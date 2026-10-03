import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { PoliClient } from '../src/client.js';

async function server(t, handler) {
  const instance = http.createServer(handler);
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  t.after(() => { instance.closeAllConnections(); instance.close(); });
  return new PoliClient({baseUrl:`http://127.0.0.1:${instance.address().port}/v1`,apiKey:'test',timeoutMs:1000});
}
const event = data => 'data: ' + JSON.stringify(data) + '\r\n\r\n';
test('SSE assembles fragmented tool calls, UTF-8, reasoning, usage, and final unterminated event', async t => {
  const client = await server(t, (req,res) => {
    res.writeHead(200,{'content-type':'text/event-stream'});
    const text = event({choices:[{delta:{reasoning_content:'thinking'}}]}) +
      event({choices:[{delta:{content:'Grüße'}}]}) +
      event({choices:[{delta:{tool_calls:[{index:1,id:'b',function:{name:'list_',arguments:'{'}}]}}]}) +
      event({choices:[{delta:{tool_calls:[{index:0,id:'a',function:{name:'view_file',arguments:'{"file_path":"a"}'}}]}}]}) +
      event({choices:[{delta:{tool_calls:[{index:1,function:{name:'dir',arguments:'}'}}]},finish_reason:'tool_calls'}],usage:{total_tokens:42}}) + 'data:[DONE]';
    const bytes = Buffer.from(text);
    for(const byte of bytes) res.write(Buffer.from([byte]));
    res.end();
  });
  const chunks=[];
  const result=await client.createChatCompletion({model:'test',messages:[],stream:true,onChunk:c=>chunks.push(c)});
  assert.equal(result.message.content,'Grüße');
  assert.deepEqual(result.message.tool_calls.map(c=>c.function.name),['view_file','list_dir']);
  assert.equal(result.message.tool_calls[1].function.arguments,'{}');
  assert.equal(result.usage.total_tokens,42);
  assert.ok(chunks.some(c=>c.type==='reasoning'));
});
test('a router that returns JSON despite stream=true remains usable', async t => {
  const client = await server(t, (req,res) => {res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message:{role:'assistant',content:'Hello'},finish_reason:'stop'}]}));});
  const result=await client.createChatCompletion({model:'test',messages:[],stream:true});
  assert.equal(result.message.content,'Hello');
});
test('HTTP and SSE errors are surfaced, rather than silently returning an empty answer', async t => {
  const client = await server(t, (req,res) => {res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'Tools unavailable',code:'model_does_not_support_tools'}}));});
  await assert.rejects(client.createChatCompletion({model:'test',messages:[]}),error=>error.status===400&&error.code==='model_does_not_support_tools');
  const streaming = await server(t, (req,res) => {res.writeHead(200,{'content-type':'text/event-stream'});res.end(event({error:{message:'Upstream unavailable'}}));});
  await assert.rejects(streaming.createChatCompletion({model:'test',messages:[],stream:true}),/Upstream unavailable/);
});
test('an abrupt stream ending cannot be reported as success', async t => {
  const client = await server(t, (req,res) => {res.writeHead(200,{'content-type':'text/event-stream'});res.end(event({choices:[{delta:{content:'Partial'}}]}));});
  await assert.rejects(client.createChatCompletion({model:'test',messages:[],stream:true}),/before completion/);
});
test('a cancelled request releases the connection immediately', async t => {
  const client = await server(t, (req,res) => {});
  const controller=new AbortController();
  const pending=client.createChatCompletion({model:'test',messages:[],signal:controller.signal});
  controller.abort();
  await assert.rejects(pending,error=>error.name==='AbortError');
});
test('requests time out instead of freezing the CLI', async t => {
  const client = await server(t, () => {});client.timeoutMs=25;
  await assert.rejects(client.createChatCompletion({model:'test',messages:[]}),/timed out/);
});
