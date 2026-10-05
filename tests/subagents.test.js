import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SubagentManager } from '../src/subagents.js';
import { executeTool } from '../src/tools/index.js';
import { withSignal } from '../src/async-utils.js';

const call = (name, args, id = 'call_1') => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const response = content => ({ message: { content } });
function fixture(t, createChatCompletion, permission = 'ask') {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poli-subagents-'));
  t.after(() => fs.rmSync(workspaceDir, { recursive: true, force: true }));
  const messages = [{ role: 'user', content: 'Keep the existing green theme.' }, { role: 'tool', name: 'edit_file', content: '{"success":true,"file_path":"theme.js"}' }];
  const host = { config: { model: 'fixture-model', permission }, session: { workspaceDir, messages, history: () => messages, recordUsage() {} }, client: { createChatCompletion } };
  const manager = new SubagentManager(host);
  return { host, manager, workspaceDir };
}

test('subagent receives recorded context and a read-only catalog without recursive delegation', async t => {
  const { manager } = fixture(t, async body => {
    assert.match(body.messages[0].content, /Keep the existing green theme/);
    assert.match(body.messages[0].content, /Recorded tool result edit_file/);
    assert.ok(body.tools.some(tool => tool.function.name === 'search_history'));
    assert.ok(body.tools.every(tool => !['spawn_agent', 'run_command', 'write_file', 'edit_file', 'apply_patch'].includes(tool.function.name)));
    return response('Reviewed the theme. No files changed.');
  });
  const job = manager.spawn_agent({ task: 'Review theme.js', role: 'reviewer' });
  assert.equal(job.permission, 'read-only');
  const result = await manager.wait_agent({ agent_id: job.agent_id });
  assert.equal(result.agents[0].status, 'completed');
  assert.match(result.agents[0].report, /No files changed/);
  assert.equal(manager.unread().length, 0);
  const elapsed = manager.list_agents().agents[0].elapsed_ms;
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(manager.list_agents().agents[0].elapsed_ms, elapsed);
});

test('explorers cannot change files even when the provider invents a write call', async t => {
  let request = 0;
  const { manager, workspaceDir } = fixture(t, async body => {
    if (request++ === 0) return { message: { tool_calls: [call('write_file', { file_path: 'blocked.txt', content: 'blocked' })] } };
    assert.equal(JSON.parse(body.messages.at(-1).content).rejected, true);
    return response('Write blocked by read-only permissions.');
  }, 'full');
  manager.spawn_agent({ task: 'Inspect the project' });
  const result = await manager.wait_agent();
  assert.equal(fs.existsSync(path.join(workspaceDir, 'blocked.txt')), false);
  assert.equal(result.agents[0].actions[0].result.rejected, true);
});

test('workers inherit full access and return actual changes and tool results', async t => {
  let request = 0;
  const { manager, workspaceDir } = fixture(t, async body => {
    if (request++ === 0) return { message: { tool_calls: [call('write_file', { file_path: 'worker.txt', content: 'written by worker' })] } };
    assert.equal(JSON.parse(body.messages.at(-1).content).success, true);
    return response('Created worker.txt.');
  }, 'full');
  const job = manager.spawn_agent({ task: 'Create worker.txt', role: 'worker' });
  const result = await manager.wait_agent({ agent_id: job.agent_id });
  assert.equal(fs.readFileSync(path.join(workspaceDir, 'worker.txt'), 'utf8'), 'written by worker');
  assert.equal(result.agents[0].permission, 'full');
  assert.equal(result.agents[0].actions[0].name, 'write_file');
});

test('workers cannot bypass Ask approvals in a noninteractive context', async t => {
  let request = 0;
  const { manager, workspaceDir } = fixture(t, async () => request++ === 0 ? { message: { tool_calls: [call('write_file', { file_path: 'blocked.txt', content: 'blocked' })] } } : response('Approval required.'));
  manager.spawn_agent({ task: 'Create blocked.txt', role: 'worker' });
  const result = await manager.wait_agent();
  assert.equal(result.agents[0].actions[0].result.rejected, true);
  assert.equal(fs.existsSync(path.join(workspaceDir, 'blocked.txt')), false);
});

test('subagents fall back from unsupported native tools and execute text bridge calls', async t => {
  let request = 0;
  const { manager, workspaceDir } = fixture(t, async body => {
    if (request++ === 0) throw Object.assign(new Error('tool_choice is not supported'), { status: 400 });
    assert.equal(body.tools, null);
    assert.doesNotMatch(body.messages[0].content, /"name":"spawn_agent"/);
    if (request === 2) return response('```poli-tool\n{"name":"list_directory","arguments":{"path":"."}}\n```');
    assert.ok(body.messages.some(message => message.content?.includes('fixture.txt')));
    return response('Found fixture.txt.');
  });
  fs.writeFileSync(path.join(workspaceDir, 'fixture.txt'), 'fixture');
  manager.spawn_agent({ task: 'List files' });
  const result = await manager.wait_agent();
  assert.equal(result.agents[0].status, 'completed');
  assert.equal(result.agents[0].actions[0].name, 'list_dir');
  assert.equal(request, 3);
});

test('three subagents run concurrently and excess delegation returns a recoverable error', async t => {
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  let started = 0;
  const { manager } = fixture(t, async () => { started++; await ready; return response('Done'); });
  for (let index = 0; index < 3; index++) manager.spawn_agent({ task: `Independent review ${index}` });
  assert.equal(started, 3);
  assert.match(manager.spawn_agent({ task: 'Fourth review' }).error, /Three subagents/);
  release();
  const result = await manager.wait_agent();
  assert.equal(result.agents.length, 3);
  assert.ok(result.agents.every(agent => agent.status === 'completed'));
});

test('cancellation stops a subagent promptly even if a provider ignores AbortSignal', async t => {
  const { manager } = fixture(t, async () => new Promise(() => {}));
  const job = manager.spawn_agent({ task: 'Review files' });
  manager.stop_agent({ agent_id: job.agent_id });
  const result = await Promise.race([manager.wait_agent(), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Cancellation hung')), 500); timer.unref(); })]);
  assert.equal(result.agents[0].status, 'cancelled');
  assert.equal(result.agents[0].error, 'Subagent stopped.');
});

test('stopping a parent cancels all attached subagents and wait requests', async t => {
  const { manager } = fixture(t, async () => new Promise(() => {}));
  const controller = new AbortController();
  manager.spawn_agent({ task: 'Review files' }, { signal: controller.signal });
  const wait = manager.wait_agent({}, { signal: controller.signal });
  controller.abort();
  await assert.rejects(wait, /abort/i);
  const result = await manager.wait_agent();
  assert.equal(result.agents[0].status, 'cancelled');
});

test('approval mutex serializes concurrent prompts and recovers after rejection', async t => {
  const { manager } = fixture(t, async () => response('Done'));
  const order = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const first = manager.withApproval(async () => { order.push('first'); await gate; throw new Error('First rejected'); });
  const handled = assert.rejects(first, /First rejected/);
  const second = manager.withApproval(async () => { order.push('second'); return true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(order, ['first']);
  release();
  await handled;
  assert.equal(await second, true);
  assert.deepEqual(order, ['first', 'second']);
});

test('subagent failures are reported, unknown IDs are recoverable, nested tools are rejected', async t => {
  const { manager } = fixture(t, async () => { throw new Error('Provider unavailable'); });
  manager.spawn_agent({ task: 'Review' });
  assert.equal((await manager.wait_agent()).agents[0].error, 'Provider unavailable');
  assert.match((await manager.wait_agent({ agent_id: 'missing' })).error, /Unknown subagent/);
  assert.match(manager.stop_agent({ agent_id: 'missing' }).error, /Unknown subagent/);
  assert.match((await executeTool('spawn_agent', { task: 'Nested' }, { subagents: null })).error, /Nested delegation/);
  assert.match((await executeTool('spawn_agent', { task: 42 }, { subagents: manager })).error, /must be string/);
  assert.match(manager.spawn_agent({ task: 'Task', role: 'admin' }).error, /Choose explorer/);
});

test('subagents have no step cap and bound collected reports without claiming omitted evidence', async t => {
  let requests = 0;
  const { manager } = fixture(t, async () => requests++ < 30 ? { message: { tool_calls: [call('list_dir', {}, `call_${requests}`)] } } : response('R'.repeat(10000)));
  manager.spawn_agent({ task: 'Inspect thoroughly' });
  const result = (await manager.wait_agent()).agents[0];
  assert.equal(requests, 31);
  assert.equal(result.tool_calls, 30);
  assert.equal(result.actions.length, 12);
  assert.equal(result.omitted_actions, 18);
  assert.equal(result.report.length, 8000);
  assert.equal(result.truncated, true);
});

test('an already aborted signal handles a rejecting in-flight promise', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(withSignal(Promise.reject(new Error('Late provider failure')), controller.signal), /abort/i);
  await new Promise(resolve => setImmediate(resolve));
});

test('malformed subagent tool output is retried and cannot become a success report',async t=>{
 let requests=0;
 const {manager}=fixture(t,async()=>requests++===0?response('Reading.poli-tool\n{&quot;name&quot;:&quot;list_dir&quot;,&quot;arguments&quot;:{}}'):requests===2?response('```poli-tool\n{"name":"list_dir","arguments":{"dir_path":"."}}\n```'):response('Inspected workspace.'));
 manager.spawn_agent({task:'Inspect files'});const result=await manager.wait_agent();
 assert.equal(requests,3);assert.equal(result.agents[0].actions[0].name,'list_dir');assert.equal(result.agents[0].status,'completed');
});
