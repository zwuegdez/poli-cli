import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executeTool } from '../src/tools/index.js';
import { permissionLevel } from '../src/permissions.js';
import { COMMAND_LIST } from '../src/ui/prompt.js';

test('read-only blocks edits and shell execution, including aliases and auto-approve', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poli-permissions-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'file.txt'), 'original');
  const context = { workspaceDir: dir, permission: 'read-only', autoApprove: true };
  for (const [name, args] of [
    ['write_file', { path: 'file.txt', content: 'changed' }],
    ['edit_file', { file_path: 'file.txt', target_content: 'original', replacement_content: 'changed' }],
    ['run_command', { command: 'touch created.txt' }],
    ['run_command', { command: 'find . -exec touch created.txt \\;' }],
  ]) assert.equal((await executeTool(name, args, context)).rejected, true);
  assert.equal(fs.readFileSync(path.join(dir, 'file.txt'), 'utf8'), 'original');
  assert.equal(fs.existsSync(path.join(dir, 'created.txt')), false);
  assert.ok(!(await executeTool('list_directory', { path: '.' }, context)).rejected);
});

test('ask requires approval for shell commands and fails closed without a prompt', async () => {
  const args = { command: 'echo approved' };
  assert.equal((await executeTool('run_command', args, { permission: 'ask', autoApprove: true })).rejected, true);
  let confirmations = 0;
  const denied = await executeTool('run_command', args, { permission: 'ask', autoApprove: true, promptManager: { confirm: async () => { confirmations++; return false; } } });
  assert.equal(denied.rejected, true);
  assert.equal(confirmations, 1);
  const allowed = await executeTool('run_command', args, { permission: 'ask', promptManager: { confirm: async () => true } });
  assert.equal(allowed.exit_code, 0);
  assert.match(allowed.stdout, /approved/);
});

test('full access executes without asking and unknown levels fail closed', async () => {
  const args = { command: 'echo full' };
  const result = await executeTool('run_command', args, { permission: 'full', promptManager: { confirm: () => { throw Error('unexpected approval'); } } });
  assert.equal(result.exit_code, 0);
  assert.equal((await executeTool('run_command', args, { permission: 'invalid' })).rejected, true);
  assert.equal(permissionLevel({ autoApprove: true }), 'full');
  assert.equal(permissionLevel({ permission: 'invalid', autoApprove: true }), 'read-only');
  assert.ok(COMMAND_LIST.find(c => c.cmd === '/permission').alias.includes('/permision'));
});
