import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parseBridgeCalls, chatMessages } from '../src/tool-bridge.js';
import { executeTool } from '../src/tools/index.js';
import { chooseModel, modelChoices } from '../src/commands/models.js';
import { filterChoices } from '../src/ui/select.js';
import { Session } from '../src/session.js';

function scenario(code) {
  const result=spawnSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    import { PoliAgent } from './src/agent.js';
    const messages=[];
    const session={messages,workspaceDir:process.cwd(),addMessage:m=>messages.push(m),save(){},recordUsage(){}};
    ${code}
  `],{encoding:'utf8',cwd:new URL('..',import.meta.url),timeout:10000});
  assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
  return result.stdout;
}
test('agent continues beyond the previous 25-step limit',()=>{
  scenario(`let requests=0,actions=0;
    const agent=new PoliAgent({session,config:{model:'test'},execute:async()=>{actions++;return {success:true}},client:{async createChatCompletion(){
      return requests++ < 30 ? {message:{tool_calls:[{id:'call'+requests,function:{name:'list_dir',arguments:'{}'}}]}} : {message:{content:'Done'}};
    }}});
    await agent.runTurn('work'); assert.equal(actions,30);assert.equal(requests,31);assert.equal(messages.at(-1).content,'Done');`);
});
test('chat mode sends neither tool schemas nor native tool history',()=>{
  scenario(`messages.push({role:'assistant',tool_calls:[{id:'1',function:{name:'list_dir',arguments:'{}'}}]},{role:'tool',tool_call_id:'1',name:'list_dir',content:'ok'});
    const agent=new PoliAgent({session,config:{model:'test',mode:'chat'},client:{async createChatCompletion(body){
      assert.equal(body.tools,null);assert.ok(body.messages.every(m=>m.role!=='tool'&&!m.tool_calls)); return {message:{content:'Hello'}};
    }}});await agent.runTurn('hello');`);
});
test('chat-only models execute explicit local tool requests and get results',()=>{
  const output=scenario(`let requests=0,actions=0;
    const agent=new PoliAgent({session,config:{model:'test'},execute:async(name,args)=>{assert.equal(name,'list_dir');actions++;return {files:['hello']}},client:{async createChatCompletion(body){
      assert.equal(body.tools,null);
      if(requests++===0)return {message:{content:'\`\`\`poli-tool\\n{"name":"list_dir","arguments":{}}\\n\`\`\`'}};
      assert.ok(body.messages.some(m=>m.content.includes('hello')));return {message:{content:'Found hello'}};
    }}});agent.setModel({id:'test',capabilities:{tools:false}});await agent.runTurn('list files');assert.equal(actions,1);`);
  assert.doesNotMatch(output,/```poli-tool/);
});
test('unsupported native tools fall back once without duplicate user messages',()=>{
  scenario(`let requests=0;
    const agent=new PoliAgent({session,config:{model:'test'},client:{async createChatCompletion(body){
      if(requests++===0)throw Object.assign(new Error('Tools unavailable'),{status:400,code:'model_does_not_support_tools'});
      assert.equal(body.tools,null);return {message:{content:'Hello'}};
    }}});await agent.runTurn('hello');assert.equal(requests,2);assert.equal(messages.filter(m=>m.role==='user').length,1);`);
});
test('tool exceptions, invalid JSON and cancellation keep tool history paired',()=>{
  scenario(`let requests=0;
    const controller=new AbortController();
    const agent=new PoliAgent({session,config:{model:'test'},execute:async()=>{controller.abort();throw new Error('read failed')},client:{async createChatCompletion(){
      requests++;return {message:{tool_calls:[{id:'1',function:{name:'view_file',arguments:'{"file_path":"a"}'}},{id:'2',function:{name:'list_dir',arguments:'{}'}}]}};
    }}});const result=await agent.runTurn('read',{signal:controller.signal});assert.equal(result.cancelled,true);assert.equal(requests,1);assert.equal(messages.filter(m=>m.role==='tool').length,2);assert.match(messages.at(-1).content,/not executed/);`);
});
test('ordinary fenced JSON never executes as a tool',()=>{
  assert.equal(parseBridgeCalls('```json\n{"name":"run_command","arguments":{"command":"x"}}\n```').calls.length,0);
  assert.equal(parseBridgeCalls('```poli-tool\ninvalid\n```').calls[0].function.name,'__invalid_tool_request');
});
test('tool validation rejects unsafe malformed arguments before execution',async()=>{
  assert.match((await executeTool('edit_file',{file_path:'a',target_content:'',replacement_content:'b'})).error,/empty/);
  assert.match((await executeTool('write_file',{file_path:123,content:'x'})).error,/must be string/);
  assert.match((await executeTool('run_command',{})).error,/Missing/);
});
test('model selection returns the chosen catalog model and excludes unavailable entries',async()=>{
  const models=[{id:'a',capabilities:{tools:false}},{id:'b',capabilities:{tools:true}},{id:'offline',maintenance:true},{id:'image',capabilities:{chat:false}}];
  assert.equal(modelChoices(models).length,2);
  const picked=await chooseModel({client:{listModels:async()=>models},config:{model:'a'},select:async args=>{assert.equal(args.current,'a');return 'b';}});
  assert.equal(picked.id,'b');
  assert.equal(filterChoices(modelChoices(models),'b native').length,1);
});
test('a stopped shell command returns promptly and can be followed by another turn',async()=>{
  const controller=new AbortController();
  const start=Date.now();
  const pending=executeTool('run_command',{command:'sleep 10',timeout_seconds:0},{autoApprove:true,signal:controller.signal});
  setTimeout(()=>controller.abort(),30);
  const result=await pending;
  assert.equal(result.rejected,true);
  assert.ok(Date.now()-start < 1500, 'Cancellation must kill the command promptly.');
});

test('compaction retains complete turns and matched tool results', () => {
  const session = new Session();
  session.addMessage({ role: 'system', content: 'instructions' });
  for (let i = 0; i < 6; i++) {
    session.addMessage({ role: 'user', content: 'turn ' + i });
    session.addMessage({ role: 'assistant', tool_calls: [{ id: String(i), function: { name: 'list_dir', arguments: '{}' } }] });
    session.addMessage({ role: 'tool', tool_call_id: String(i), content: '{}' });
    session.addMessage({ role: 'assistant', content: 'done' });
  }
  assert.equal(session.compact(), true);
  assert.equal(session.messages.filter(m => m.role === 'user').length, 4);
  for (const message of session.messages.filter(m => m.role === 'tool')) {
    assert.ok(session.messages.some(m => m.tool_calls?.some(c => c.id === message.tool_call_id)));
  }
  assert.equal(session.messages[0].content, 'instructions');
});

test('list_directory(path) from the reported transcript executes as list_dir(dir_path)', async () => {
  const result = await executeTool('list_directory', { path: '.' }, { workspaceDir: process.cwd() });
  assert.ok(!result.error, result.error);
  assert.ok(result.items.some(item => item.name === 'package.json'));
});
test('unknown tools and missing arguments return schemas and workspace for model recovery', async () => {
  const unknown = await executeTool('invented_tool', {}, { workspaceDir: '/the/workspace' });
  assert.equal(unknown.workspace_dir, '/the/workspace');
  assert.ok(unknown.available_tools.some(tool => tool.name === 'list_dir'));
  const missing = await executeTool('view_file', {}, { workspaceDir: '/the/workspace' });
  assert.deepEqual(missing.expected_tool.parameters.required, ['file_path']);
});
test('each bridge request carries actual tool names and workspace near the latest result', () => {
  const request = chatMessages([{ role: 'system', content: 'instructions' }, { role: 'user', content: 'Explore this project' }], true, { workspaceDir: '/repo/poli-cli' });
  assert.match(request.at(-1).content, /Workspace directory: \/repo\/poli-cli/);
  assert.match(request.at(-1).content, /list_dir\(dir_path\?, recursive\?\)/);
  assert.match(request.at(-1).content, /view_file\(file_path,/);
});
test('queued follow-ups run after the active response without another Enter press', () => {
  scenario(`let requests = 0;
    const queue = [];
    const input = { active: false, start(){}, suspend(){}, close(){}, draft(){return ''}, drain(){return queue.splice(0)} };
    const agent = new PoliAgent({ session, config: { model: 'test', mode: 'chat' }, createTurnInput: () => input, client: {
      async createChatCompletion(body) {
        if (requests++ === 0) { queue.push('follow-up typed while working'); return {message:{content:'First answer'}}; }
        assert.equal(body.messages.at(-1).content, 'follow-up typed while working');
        return {message:{content:'Follow-up answer'}};
      }
    }});
    await agent.runTurn('initial task');
    assert.equal(requests, 2);
    assert.equal(messages.at(-1).content, 'Follow-up answer');`);
});
test('queued steering waits until all tool results are recorded', () => {
  scenario(`let requests = 0;
    const queue = [];
    const input = {active:false,start(){},suspend(){},close(){},draft(){return ''},drain(){return queue.splice(0)}};
    const agent = new PoliAgent({session,config:{model:'test'},createTurnInput:()=>input,execute:async()=>({ok:true}),client:{async createChatCompletion(body){
      if(requests++===0){queue.push('new direction');return {message:{tool_calls:[{id:'a',function:{name:'list_dir',arguments:'{}'}},{id:'b',function:{name:'list_dir',arguments:'{}'}}]}};}
      const last=body.messages.slice(-3);assert.equal(last[0].role,'tool');assert.equal(last[1].role,'tool');assert.equal(last[2].content,'new direction');
      return {message:{content:'Updated'}};
    }}});await agent.runTurn('initial');assert.equal(requests,2);`);
});

test('null tool arguments become tool errors and keep conversation pairs intact', () => {
  const output=scenario(`let requests=0;
    const agent=new PoliAgent({session,config:{model:'test'},client:{async createChatCompletion(){
      if(requests++===0)return {message:{tool_calls:[{id:'bad',function:{name:'list_dir',arguments:'null'}}]}};
      assert.equal(messages.filter(m=>m.role==='tool').length,1);
      assert.match(messages.at(-1).content,/must be an object/);
      return {message:{content:'Recovered'}};
    }}});await agent.runTurn('inspect');assert.equal(requests,2);`);
  assert.match(output,/Recovered/);
});
test('empty tool results are reported as failures instead of successful actions', () => {
  const output=scenario(`let requests=0;
    const agent=new PoliAgent({session,config:{model:'test'},execute:async()=>null,client:{async createChatCompletion(){
      if(requests++===0)return {message:{tool_calls:[{id:'empty',function:{name:'list_dir',arguments:'{}'}}]}};
      assert.match(messages.at(-1).content,/Tool returned no result/);
      return {message:{content:'Recovered'}};
    }}});await agent.runTurn('inspect');`);
  assert.match(output,/× Listed/);
  assert.doesNotMatch(output,/✓ Listed/);
});
