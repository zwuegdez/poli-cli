import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function fixture(t, handler) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'poli-repl-test-'));
  const server=http.createServer(async(req,res)=>{
    res.setHeader('content-type','application/json');
    if(req.method==='GET') {res.end(JSON.stringify({data:[{id:'selected',capabilities:{tools:false,chat:true}}]}));return;}
    let raw='';for await(const chunk of req)raw+=chunk;
    handler(JSON.parse(raw),res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({baseUrl:`http://127.0.0.1:${server.address().port}/v1`,model:'selected',mode:'chat'}));
  t.after(()=>{server.closeAllConnections();server.close();fs.rmSync(dir,{recursive:true,force:true});});
  return (args,input='')=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['bin/poli.js',...args],{cwd:new URL('..',import.meta.url),env:{...process.env,POLI_CODE_HOME:dir,POLI_API_KEY:'fake',NO_COLOR:'1'}});
    let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
    const timer=setTimeout(()=>{child.kill();reject(new Error('CLI did not exit'));},10000);
    child.on('error',reject);child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});child.stdin.end(input);
  });
}
const answer=(res,text)=>res.end(JSON.stringify({choices:[{message:{role:'assistant',content:text},finish_reason:'stop'}]}));
test('REPL retains context across several chat messages and exits on piped EOF',async t=>{
  const requests=[];
  const cli=await fixture(t,(body,res)=>{requests.push(body);answer(res,'Chat reply');});
  const result=await cli([], 'hello\nsecond message\n');
  assert.equal(result.code,0,result.stderr);
  assert.equal(requests.length,2);
  assert.equal(requests[1].model,'selected');
  assert.ok(requests.every(body=>!body.tools));
  assert.deepEqual(requests[1].messages.filter(m=>m.role==='user').map(m=>m.content),['hello','second message']);
  assert.equal(result.stdout.match(/Chat reply/g).length,2);
  assert.equal(result.stdout.match(/agent · selected/g)?.length || 0, 0);
  assert.equal(result.stdout.match(/chat · selected/g)?.length || 0, 1);
  assert.doesNotMatch(result.stdout, /\n\d+\.\d+s\n/);
  assert.doesNotMatch(result.stdout, /\n{3,}/);
  assert.doesNotMatch(result.stdout,/\x1b\[/);
});
test('/retry recovers a failed request without duplicating the user message',async t=>{
  const requests=[];
  const cli=await fixture(t,(body,res)=>{
    requests.push(body);
    if(requests.length===1){res.statusCode=503;res.end(JSON.stringify({error:{message:'Model is temporarily offline'}}));}
    else answer(res,'Recovered');
  });
  const result=await cli([],'hello\n/retry\n/exit\n');
  assert.equal(result.code,0);
  assert.equal(requests.length,2);
  assert.equal(requests[1].messages.filter(m=>m.role==='user').length,1);
  assert.match(result.stdout,/Recovered/);
});
test('one-shot failures return a failure exit code',async t=>{
  const cli=await fixture(t,(body,res)=>{res.statusCode=503;res.end(JSON.stringify({error:{message:'Unavailable'}}));});
  const result=await cli(['--chat','hello']);
  assert.equal(result.code,1);
  assert.match(result.stdout,/Unavailable/);
});

test('a conversation can be resumed across CLI processes without losing context', async t => {
  const requests=[];
  const cli=await fixture(t,(body,res)=>{requests.push(body);answer(res,'Saved answer');});
  const first=await cli([],'original task\n');
  assert.equal(first.code,0);
  const listing=await cli([],'/resume\n');
  const id=listing.stdout.match(/^([a-f0-9]{16})  /m)?.[1];
  assert.ok(id,listing.stdout);
  const resumed=await cli(['resume',id],'follow-up task\n');
  assert.equal(resumed.code,0,resumed.stdout+resumed.stderr);
  assert.match(resumed.stdout,/Resumed/);
  assert.equal(requests.length,2);
  assert.deepEqual(requests.at(-1).messages.filter(message=>message.role==='user').map(message=>message.content),['original task','follow-up task']);
});
