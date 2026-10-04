import test from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/session.js';
import { contextLimit, contextSnapshot, contextLabel, parseContextLimit, fitContext, estimateTokens } from '../src/context-window.js';
import { composerFooter } from '../src/ui/composer-view.js';
import { cellWidth, stripAnsi } from '../src/ui/theme.js';

test('context limits use provider metadata or per-model configuration, never guessed model names', () => {
  assert.deepEqual(contextLimit({id:'gpt-example'}),{tokens:null,source:'unknown'});
  assert.deepEqual(contextLimit({id:'a',context_window:128000}),{tokens:128000,source:'provider'});
  assert.deepEqual(contextLimit({id:'a',context_window:128000},{contextWindows:{a:64000,b:256000}}),{tokens:64000,source:'configured'});
  assert.deepEqual(contextLimit({id:'b'},{contextWindows:{a:64000}}),{tokens:null,source:'unknown'});
  assert.equal(contextLimit({id:'a',context_window:-100}).tokens,null);
});

test('context usage separates current estimates from lifetime usage and the last provider request', () => {
  const session=new Session();
  session.addMessage({role:'system',content:'Instructions'});
  session.addMessage({role:'user',content:'Task'});
  session.recordUsage({prompt_tokens:100000,completion_tokens:5000,total_tokens:105000});
  session.recordContextUsage({prompt_tokens:42,completion_tokens:8},'a');
  const snapshot=contextSnapshot({session,model:{id:'a',context_window:128000},config:{model:'a',maxTokens:2000}});
  assert.equal(snapshot.reportedPromptTokens,42);
  assert.equal(snapshot.reportedCompletionTokens,8);
  assert.equal(snapshot.estimated,true);
  assert.ok(snapshot.usedTokens<1000);
  assert.equal(snapshot.outputReserve,2000);
  assert.equal(contextSnapshot({session,config:{model:'b'}}).reportedPromptTokens,null);
  session.clear();
  assert.equal(session.contextUsage,null);
});

test('context display fits narrow composers and labels unknown limits and estimates clearly', () => {
  const snapshot={usedTokens:20000,limitTokens:128000,percentUsed:16};
  assert.equal(contextLabel(snapshot),'context ~20.0k/128.0k · 84% left');
  assert.match(contextLabel({...snapshot,limitTokens:null}),/~20.0k · limit unknown/);
  for(const width of [20,40,80,120]) {
    const rows=composerFooter({model:'cbai/example',mode:'agent',width,context:snapshot});
    assert.ok(rows.every(row=>cellWidth(row)<=width-1));
    assert.match(stripAnsi(rows.join('\n')),/context/);
    assert.equal(rows.filter(row=>stripAnsi(row).includes('context')).length,1);
  }
});

test('context limit input accepts tokens and compact units without accepting malformed sizes', () => {
  assert.equal(parseContextLimit('128k'),128000);
  assert.equal(parseContextLimit('2M'),2000000);
  assert.equal(parseContextLimit('131072'),131072);
  for(const value of ['-1','NaN','1','0','2.5k','128k ignored','99999999999999999999']) assert.equal(parseContextLimit(value),null);
});

test('long tool rounds can be shortened while preserving current instructions, tool pairs, and original records', () => {
  const messages=[{role:'system',content:'Instructions'},{role:'user',content:'Complete this task and preserve all requirements.'}];
  for(let index=0;index<10;index++)messages.push({role:'assistant',tool_calls:[{id:'call_'+index,function:{name:'view_file',arguments:'{"file_path":"a.js"}'}}]},{role:'tool',name:'view_file',tool_call_id:'call_'+index,content:'Evidence '+index+' '+ 'x'.repeat(20000)});
  const original=JSON.stringify(messages);
  const shortened=fitContext(messages,null,5000);
  assert.ok(estimateTokens(shortened)<estimateTokens(messages));
  assert.equal(JSON.stringify(messages),original);
  assert.ok(shortened.some(message=>message.role==='user'&&message.content==='Complete this task and preserve all requirements.'));
  assert.match(shortened[0].content,/full recorded outcomes remain available/);
  for(const tool of shortened.filter(message=>message.role==='tool'))assert.ok(shortened.some(message=>message.tool_calls?.some(call=>call.id===tool.tool_call_id)));
  assert.ok(shortened.some(message=>message.tool_call_id==='call_9'));
  assert.deepEqual(fitContext(messages,null,1000000),messages);
});
