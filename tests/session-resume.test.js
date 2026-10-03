import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Session } from '../src/session.js';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poli-resume-'));
  const previous = process.env.POLI_CODE_HOME;
  process.env.POLI_CODE_HOME = dir;
  t.after(() => { if (previous === undefined) delete process.env.POLI_CODE_HOME; else process.env.POLI_CODE_HOME = previous; fs.rmSync(dir, { recursive: true, force: true }); });
  return dir;
}
test('saved conversations restore context and usage while excluding other workspaces', t => {
  const dir = fixture(t);
  const saved = new Session({workspaceDir: dir});
  saved.addMessage({role:'system',content:'instructions'});
  saved.addMessage({role:'user',content:'fix the project'});
  saved.addMessage({role:'assistant',content:'Ready'});
  saved.recordUsage({prompt_tokens:5,completion_tokens:3,total_tokens:8});
  saved.save();
  const other = new Session({workspaceDir:path.join(dir,'other')});
  other.addMessage({role:'user',content:'different project'});other.save();
  fs.writeFileSync(path.join(dir,'sessions','session_broken.json'), '{');
  assert.deepEqual(Session.list(dir).map(item=>item.id),[saved.id]);
  const fresh = new Session({workspaceDir:dir});fresh.restore(saved.id);
  assert.equal(fresh.messages.at(-1).content,'Ready');
  assert.equal(fresh.tokenStats.totalTokens,8);
  assert.throws(()=>fresh.restore(other.id),/different workspace/);
  assert.throws(()=>Session.read('../config',dir),/Invalid session ID/);
});
test('resuming an interrupted tool batch repairs missing results without executing tools', t => {
  const dir=fixture(t);
  const saved=new Session({workspaceDir:dir});
  saved.addMessage({role:'user',content:'inspect'});
  saved.addMessage({role:'assistant',tool_calls:[{id:'first',function:{name:'list_dir',arguments:'{}'}},{id:'second',function:{name:'view_file',arguments:'{}'}}]});
  saved.addMessage({role:'tool',tool_call_id:'first',name:'list_dir',content:'{}'});
  saved.save();
  const fresh=new Session({workspaceDir:dir});fresh.restore(saved.id);
  assert.deepEqual(fresh.messages.filter(message=>message.role==='tool').map(message=>message.tool_call_id),['first','second']);
  assert.equal(JSON.parse(fresh.messages.at(-1).content).rejected,true);
  assert.match(fresh.messages.at(-1).content,/Inspect the workspace/);
});
