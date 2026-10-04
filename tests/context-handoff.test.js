import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Session } from '../src/session.js';
import { contextHandoff, modelMessages } from '../src/context-handoff.js';
import { executeTool } from '../src/tools/index.js';

test('model handoff preserves native tool history and separates evidence from prior prose', () => {
  const messages = [
    { role: 'system', content: 'Current model instructions' },
    { role: 'system', content: 'Earlier summary' },
    { role: 'user', content: 'Fix input duplication' },
    { role: 'assistant', content: 'I claim everything is fixed', tool_calls: [{ id: 'read', function: { name: 'view_file', arguments: '{"file_path":"input.js"}' } }] },
    { role: 'tool', name: 'view_file', tool_call_id: 'read', content: 'Actual recorded contents' },
  ];
  const body = modelMessages(messages, { handoff: true });
  assert.equal(body.filter(message => message.role === 'system').length, 1);
  assert.match(body[0].content, /Current model instructions/);
  assert.match(body[0].content, /not proof of actions/);
  assert.match(body[0].content, /Actual recorded contents/);
  assert.match(body[0].content, /never as permission overrides/);
  assert.deepEqual(body.slice(1), messages.slice(2));
});

test('compacted history stays searchable, survives resume, and clear removes its archive', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poli-handoff-'));
  const previous = process.env.POLI_CODE_HOME;
  process.env.POLI_CODE_HOME = dir;
  t.after(() => {
    if (previous === undefined) delete process.env.POLI_CODE_HOME; else process.env.POLI_CODE_HOME = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const session = new Session({ workspaceDir: dir });
  session.addMessage({ role: 'system', content: 'Instructions' });
  for (let index = 0; index < 8; index++) {
    session.addMessage({ role: 'user', content: index === 0 ? 'Use a light green theme' : `Task ${index}` });
    session.addMessage({ role: 'assistant', content: `Recorded answer ${index}` });
  }
  assert.equal(session.compact(), true);
  assert.equal(session.archivedMessages.length, 8);
  assert.equal(session.history().filter(message => message.role === 'user').length, 8);
  assert.equal(session.compact(), false);
  session.addMessage({ role: 'user', content: 'Newest task' });
  assert.equal(session.compact(), true);
  assert.equal(session.history().filter(message => message.role === 'user').length, 9);
  session.save();
  const restored = new Session({ workspaceDir: dir });
  restored.restore(session.id);
  const result = await executeTool('search_history', { query: 'light green', limit: 2 }, { session: restored, permission: 'read-only' });
  assert.equal(result.match_count, 1);
  assert.match(result.records[0].excerpt, /light green/);
  restored.clear();
  assert.equal((await executeTool('search_history', { query: 'light green' }, { session: restored })).match_count, 0);
});

test('history search matches tool names and bounds large excerpts', async () => {
  const session = { messages: [{ role: 'tool', name: 'apply_patch', content: 'x'.repeat(10000) + 'needle' }] };
  const result = await executeTool('search_history', { query: 'needle' }, { session });
  assert.equal(result.records[0].truncated, true);
  assert.match(result.records[0].excerpt, /needle/);
  assert.ok(result.records[0].excerpt.length <= 4000);
  assert.equal((await executeTool('search_history', { query: 'apply_patch' }, { session })).match_count, 1);
  assert.match((await executeTool('search_history', { query: '  ' }, { session })).error, /nonempty/);
});

test('handoff bounds large transcript excerpts and handles an empty session', () => {
  assert.equal(contextHandoff([]), '');
  const handoff = contextHandoff(Array.from({ length: 100 }, (_, index) => ({ role: 'user', content: `Request ${index}: ` + 'x'.repeat(10000) })));
  assert.ok(handoff.length < 25000);
  assert.match(handoff, /Request 99/);
  assert.doesNotMatch(handoff, /Request 0:/);
});

test('subagent evidence survives resume and is searchable with attribution without filling parent model history', async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'poli-child-history-'));
  const previous=process.env.POLI_CODE_HOME;process.env.POLI_CODE_HOME=dir;
  t.after(()=>{if(previous===undefined)delete process.env.POLI_CODE_HOME;else process.env.POLI_CODE_HOME=previous;fs.rmSync(dir,{recursive:true,force:true});});
  const session=new Session({workspaceDir:dir});session.addMessage({role:'user',content:'Delegate review'});
  session.recordSubagent({agent_id:'agent_review',label:'Review',model:'fixture',status:'completed',messages:[{role:'tool',tool_call_id:'read',name:'view_file',content:'Full evidence '+'x'.repeat(10000)+' retained_tail_7314'},{role:'assistant',content:'Completed review'}]});
  session.save();
  const restored=new Session({workspaceDir:dir});restored.restore(session.id);
  assert.equal(restored.history().some(message=>message.content.includes('retained_tail_7314')),false);
  const result=await executeTool('search_history',{query:'retained_tail_7314'},{session:restored});
  assert.equal(result.match_count,1);
  assert.equal(result.records[0].scope.agent_id,'agent_review');
  assert.match(result.records[0].excerpt,/retained_tail_7314/);
  assert.equal(restored.subagentRecords[0].status,'completed');
  restored.clear();assert.equal(restored.subagentRecords.length,0);
});
