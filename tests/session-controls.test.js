import test from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/session.js';
import { PoliAgent } from '../src/agent.js';
import { handleSessionControl, agentReport } from '../src/commands/session-controls.js';
import { stripAnsi } from '../src/ui/theme.js';

function fixture() {
  const session=new Session();session.addMessage({role:'system',content:'instructions'});
  const agent=new PoliAgent({session,config:{model:'example',maxTokens:4096}});
  const saved=[],printed=[];
  return {agent,saved,printed,options:{agent,write:text=>printed.push(stripAnsi(text)),saveConfig:updates=>saved.push(updates)}};
}

test('context controls expose output reserve and persist model budgets without inference', () => {
  const f=fixture();
  assert.equal(handleSessionControl('/context 128k',f.options),true);
  assert.deepEqual(f.saved,[{contextWindows:{example:128000}}]);
  assert.match(f.printed.at(-1),/After output reserve/);
  assert.match(f.printed.at(-1),/128,000 tokens \(configured\)/);
  const original=JSON.stringify(f.agent.config);
  handleSessionControl('/context nope',f.options);
  assert.match(f.printed.at(-1),/Usage/);
  assert.equal(JSON.stringify(f.agent.config),original);
  handleSessionControl('/context auto',f.options);
  assert.deepEqual(f.agent.config.contextWindows,{});
  assert.match(f.printed.at(-1),/not supplied by the provider/);
});

test('busy controls do not compact the active round or start a model switch', () => {
  const f=fixture();
  f.agent.session.compact=()=>assert.fail('Busy commands must not compact the active turn');
  assert.equal(handleSessionControl('/context compact',{...f.options,busy:true}),true);
  assert.match(f.printed.at(-1),/after this task finishes/);
  assert.equal(handleSessionControl('/models',f.options),false);
  assert.equal(handleSessionControl('/agents-not-a-command',f.options),false);
});

test('inspecting a delegated report preserves parent collection and sanitizes terminal controls', () => {
  const f=fixture();
  const job={id:'agent_test',label:'Review',task:'Review input',model:'example',role:'reviewer',permission:'read-only',started:Date.now(),finished:Date.now(),status:'completed',reported:false,actions:[{}],messages:[{role:'assistant',content:'Evidence\x1b[2J remains'},{role:'tool',name:'view_file',content:'{"content":"original file"}'}]};
  f.agent.subagents.jobs.set(job.id,job);
  const report=stripAnsi(agentReport(f.agent,job.id));
  assert.match(report,/Evidence remains/);
  assert.match(report,/original file/);
  assert.doesNotMatch(report,/\x1b\[2J|[╭╮╰╯│]/);
  assert.equal(job.reported,false);
  assert.match(stripAnsi(agentReport(f.agent,'missing')),/Unknown subagent/);
});

test('a user can cancel one child independently or stop the whole task', () => {
  const f=fixture(), parent=new AbortController(), child=new AbortController();
  f.agent.subagents.jobs.set('agent_test',{id:'agent_test',label:'Read',model:'example',role:'explorer',permission:'read-only',started:Date.now(),status:'running',actions:[],controller:child});
  handleSessionControl('/agents stop agent_test',{...f.options,busy:true,controller:parent});
  assert.equal(child.signal.aborted,true);
  assert.equal(parent.signal.aborted,false);
  handleSessionControl('/stop',{...f.options,busy:true,controller:parent});
  assert.equal(parent.signal.aborted,true);
});

test('saved subagent reports remain inspectable after a session resume', () => {
  const f=fixture();
  f.agent.session.subagentRecords=[{agent_id:'agent_saved',label:'Past review',task:'Review',status:'completed',role:'reviewer',permission:'read-only',model:'previous',tool_calls:1,messages:[{role:'assistant',content:'Saved report'}]}];
  const report=stripAnsi(agentReport(f.agent,'agent_saved'));
  assert.match(report,/Saved report/);
  assert.match(report,/previous/);
  assert.match(stripAnsi(agentReport(f.agent)),/agent_saved/);
});
