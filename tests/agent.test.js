import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parseBridgeCalls, chatMessages, combineToolCalls, unsupportedTools } from '../src/tool-bridge.js';
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

test('slow model metadata cannot delay inference and is cancelled after completion', () => {
 scenario(`
  let metadataSignal, requests=0;
  const client={listModels:async({signal})=>{metadataSignal=signal;return new Promise(()=>{});},async createChatCompletion(){requests++;return{message:{content:'Immediate answer'}};}};
  const agent=new PoliAgent({session,config:{model:'test',mode:'agent'},client});
  await agent.runTurn('hello');
  assert.equal(requests,1);assert.equal(metadataSignal.aborted,true);
 `);
});
test('chat skips model discovery and configured streaming preference reaches the provider', () => {
 scenario(`
  const client={listModels:()=>assert.fail('Chat should not load metadata'),async createChatCompletion(body){assert.equal(body.stream,false);return{message:{content:'Hello'}};}};
  await new PoliAgent({session,config:{model:'test',mode:'chat',stream:false},client}).runTurn('hello');
 `);
});
test('Thinking status is shown only when the provider streams reasoning', () => {
 scenario(`
  const activity=[];
  const original=process.stdout.isTTY;
  Object.defineProperty(process.stdout,'isTTY',{value:true,configurable:true});
  const input={active:true,start(){process.stdout.poliTurnInput=this;},setActivity(text){activity.push(text)},drain(){return[]},draft(){return''},close(){delete process.stdout.poliTurnInput}};
  try {
   await new PoliAgent({session,config:{model:'test',mode:'chat'},createTurnInput:()=>input,client:{async createChatCompletion(body){
    assert.equal(activity.at(-1),'Waiting for model…');
    body.onChunk({type:'connected'});assert.equal(activity.at(-1),'Generating response…');
    body.onChunk({type:'reasoning',text:'reasoning delta'});assert.equal(activity.at(-1),'Thinking…');
    body.onChunk({type:'content',text:'Hello'});assert.equal(activity.at(-1),'Responding…');
    return{message:{content:'Hello'}};
   }}}).runTurn('hello');
  } finally {Object.defineProperty(process.stdout,'isTTY',{value:original,configurable:true});delete process.stdout.poliTurnInput;}
 `);
});

test('switching models preserves messages and sends a factual handoff to the next model', () => {
  scenario(`
    messages.push({role:'user',content:'Fix reconnect duplication'},{role:'assistant',tool_calls:[{id:'read',function:{name:'view_file',arguments:'{"file_path":"input.js"}'}}]},{role:'tool',name:'view_file',tool_call_id:'read',content:'Actual input.js contents'});
    const config={model:'old'};
    const agent=new PoliAgent({session,config,client:{async createChatCompletion(body){
      assert.equal(body.model,'new');
      assert.match(body.messages[0].content,/Conversation continuity/);
      assert.match(body.messages[0].content,/Actual input.js contents/);
      assert.ok(body.messages.some(message=>message.content==='Fix reconnect duplication'));
      assert.ok(body.messages.some(message=>message.tool_call_id==='read'));
      return{message:{content:'I have the previous task and tool results.'}};
    }}});
    config.model='new';agent.setModel({id:'new',capabilities:{tools:true}});
    await agent.runTurn('Continue the task');
  `);
});

test('native-capable models can still use the text bridge without exposing its blocks', () => {
  const output = scenario(`let requests=0, actions=0;
    const agent=new PoliAgent({session,config:{model:'test'},execute:async()=>{actions++;return{items:['fixture']}},client:{async createChatCompletion(body){
      assert.ok(body.tools.length);
      return requests++===0?{message:{content:'\`\`\`poli-tool\\n{"name":"list_dir","arguments":{}}\\n\`\`\`'}}:{message:{content:'Inspected fixture'}};
    }}});
    agent.setModel({id:'test',capabilities:{tools:true}});
    await agent.runTurn('Inspect files');assert.equal(actions,1);
  `);
  assert.doesNotMatch(output, /```poli-tool|Could not find the language/);
});

test('matching native and bridge calls execute once while intentional native repeats remain', () => {
  const native = {id:'native',function:{name:'list_dir',arguments:'{"recursive":false,"dir_path":"."}'}};
  const bridged = {id:'text',function:{name:'list_directory',arguments:'{"path":".","recursive":false}'}};
  assert.deepEqual(combineToolCalls([native], [bridged]), [native]);
  assert.equal(combineToolCalls([native, native], [bridged]).length, 2);
  assert.equal(combineToolCalls([], [bridged, bridged]).length, 2);
});

test('fallback detection accepts explicit tool rejection and excludes unrelated provider errors', () => {
  assert.equal(unsupportedTools({status:400,message:'Unknown parameter: tools'}),true);
  assert.equal(unsupportedTools({status:422,message:'tool_choice is unsupported'}),true);
  assert.equal(unsupportedTools({status:400,message:'Invalid API key'}),false);
  assert.equal(unsupportedTools({status:503,message:'Tools unsupported'}),false);
});

test('parent automatically collects subagent results before delivering its final synthesis', () => {
  scenario(`let requests=0, childRequests=0;
    const agent=new PoliAgent({session,config:{model:'test'},client:{async createChatCompletion(body){
      if(body.messages[0].content.includes('You are subagent')){childRequests++;return{message:{content:'Verified child result'}};}
      if(requests++===0)return{message:{tool_calls:[{id:'spawn',function:{name:'spawn_agent',arguments:'{"task":"Review files","label":"Review"}'}}]}};
      if(requests===2)return{message:{content:'Preparing the combined report'}};
      assert.ok(body.messages.some(message=>message.role==='tool'&&message.name==='wait_agent'&&message.content.includes('Verified child result')));
      return{message:{content:'Final synthesis includes verified child result'}};
    }}});
    await agent.runTurn('Delegate a review');
    assert.equal(childRequests,1);assert.equal(requests,3);
    assert.match(messages.at(-1).content,/Final synthesis/);
    assert.equal(agent.subagents.running().length,0);
    const wait=messages.find(message=>message.name==='wait_agent');
    assert.ok(messages.some(message=>message.tool_calls?.some(call=>call.id===wait.tool_call_id)));
  `);
});

test('provider cancellation cannot hang the main CLI turn', () => {
  scenario(`
    const controller=new AbortController();
    const agent=new PoliAgent({session,config:{model:'test'},client:{async createChatCompletion(){controller.abort();return new Promise(()=>{});}}});
    const result=await agent.runTurn('hello',{signal:controller.signal});
    assert.equal(result.cancelled,true);
  `);
});

test('cancelling an automatic subagent wait records a paired tool outcome', () => {
  scenario(`let requests=0;
    const controller=new AbortController();
    const agent=new PoliAgent({session,config:{model:'test'},client:{async createChatCompletion(body){
      if(body.messages[0].content.includes('You are subagent'))return new Promise(()=>{});
      if(requests++===0)return{message:{tool_calls:[{id:'spawn',function:{name:'spawn_agent',arguments:'{"task":"Review files"}'}}]}};
      setTimeout(()=>controller.abort(),10);return{message:{content:'Waiting for the report'}};
    }}});
    const result=await agent.runTurn('Delegate review',{signal:controller.signal});
    assert.equal(result.cancelled,true);
    for(const message of messages.filter(message=>message.tool_calls))for(const call of message.tool_calls)assert.ok(messages.some(message=>message.role==='tool'&&message.tool_call_id===call.id));
    assert.equal(JSON.parse(messages.at(-1).content).rejected,true);
  `);
});

test('context overflow recovers even within one long task and keeps original results searchable', () => {
  scenario(`let requests=0;
    messages.push({role:'user',content:'Long task'});
    for(let index=0;index<12;index++)messages.push({role:'assistant',tool_calls:[{id:'call_'+index,function:{name:'view_file',arguments:'{"file_path":"a.js"}'}}]},{role:'tool',name:'view_file',tool_call_id:'call_'+index,content:'Stored evidence '+index+' '+'x'.repeat(20000)});
    const agent=new PoliAgent({session,config:{model:'test'},client:{async createChatCompletion(body){
      if(requests++===0)throw Object.assign(new Error('Context length exceeded'),{code:'context_length_exceeded'});
      assert.ok(JSON.stringify(body.messages).length<100000);
      assert.ok(body.messages.some(message=>message.content==='Continue the original task'));
      assert.ok(messages.some(message=>message.role==='tool'&&message.content.length>20000));
      return{message:{content:'Continued successfully'}};
    }}});
    await agent.runTurn('Continue the original task');assert.equal(requests,2);
  `);
});

test('parent streaming output cannot overwrite a subagent approval question', () => {
  scenario(`
    const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'poli-concurrent-approval-'));session.workspaceDir=dir;
    let started,release,requests=0,childRequests=0,printed='';
    const entered=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
    const original=process.stdout.write;
    process.stdout.write=function(chunk,...args){printed+=String(chunk);return original.call(this,chunk,...args);};
    try{
      const agent=new PoliAgent({session,config:{model:'test',permission:'ask'},promptManager:{confirm:async(message,defaultYes,options)=>{
        assert.match(message,/Subagent Worker/);assert.match(options.preview,/created content/);started();await gate;return true;
      }},client:{async createChatCompletion(body){
        if(body.messages[0].content.includes('You are subagent'))return childRequests++===0?{message:{tool_calls:[{id:'write',function:{name:'write_file',arguments:'{"file_path":"created.txt","content":"created content"}'}}]}}:{message:{content:'Created file with approval'}};
        if(requests++===0)return{message:{tool_calls:[{id:'spawn',function:{name:'spawn_agent',arguments:'{"task":"Create created.txt","label":"Worker","role":"worker"}'}}]}};
        if(requests===2){await entered;body.onChunk({type:'content',text:'MUST_BUFFER\\n'});assert.doesNotMatch(printed,/MUST_BUFFER/);release();return{message:{content:'MUST_BUFFER\\n'}};}
        return{message:{content:'Final approved result'}};
      }}});
      await agent.runTurn('Delegate file creation');
      assert.equal(fs.readFileSync(path.join(dir,'created.txt'),'utf8'),'created content');
      assert.match(printed,/MUST_BUFFER/);assert.equal(process.stdout.poliApprovalActive,undefined);
    }finally{process.stdout.write=original;fs.rmSync(dir,{recursive:true,force:true});}
  `);
});

test('escaped fenced tool envelopes decode without corrupting valid HTML arguments',()=>{
  const parsed=parseBridgeCalls('```poli-tool\n{&quot;name&quot;:&quot;view_file&quot;,&quot;arguments&quot;:{&quot;file_path&quot;:&quot;README.md&quot;}}\n```');
  assert.equal(parsed.calls[0].function.name,'view_file');
  assert.deepEqual(JSON.parse(parsed.calls[0].function.arguments),{file_path:'README.md'});
  const html=parseBridgeCalls('```poli-tool\n'+JSON.stringify({name:'write_file',arguments:{file_path:'a.html',content:'&quot; &amp;'}})+'\n```');
  assert.equal(JSON.parse(html.calls[0].function.arguments).content,'&quot; &amp;');
});
test('unfenced tool output is hidden and repaired, never executed directly',()=>{
  const malformed='Working.poli-tool\n{&quot;name&quot;:&quot;list_dir&quot;,&quot;arguments&quot;:{}}';
  const parsed=parseBridgeCalls(malformed);
  assert.equal(parsed.protocolError,true);assert.equal(parsed.calls.length,0);assert.equal(parsed.content,'Working.');
  const docs=parseBridgeCalls('```text\n'+malformed+'\n```');assert.equal(docs.protocolError,false);
  const output=scenario(`let requests=0,actions=0;
    const agent=new PoliAgent({session,config:{model:'test'},execute:async()=>{actions++;return {files:['hello']}},client:{async createChatCompletion(body){
      if(requests++===0)return {message:{content:${JSON.stringify(malformed)}}};
      if(requests===2){assert.match(body.messages.at(-1).content,/NOT executed/);return {message:{content:'\`\`\`poli-tool\\n{"name":"list_dir","arguments":{}}\\n\`\`\`'}};}
      return {message:{content:'Found hello'}};
    }}});await agent.runTurn('list files');assert.equal(actions,1);assert.equal(requests,3);`);
  assert.doesNotMatch(output,/&quot;|poli-tool/);
});
