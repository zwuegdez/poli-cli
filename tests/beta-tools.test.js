import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { executeTool } from '../src/tools/index.js';

function workspace(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poli-beta-tools-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'file.txt'), 'before\n');
  execFileSync('git', ['add', 'file.txt'], { cwd: dir });
  return dir;
}
const patch = '--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-before\n+after\n';

test('real patch tool changes files and Git diff reports the result', async t => {
  const dir = workspace(t);
  const applied = await executeTool('apply_patch', { patch }, { workspaceDir: dir, permission: 'full' });
  assert.equal(applied.success, true, JSON.stringify(applied));
  assert.equal(fs.readFileSync(path.join(dir, 'file.txt'), 'utf8'), 'after\n');
  const diff = await executeTool('git_diff', { file_path: 'file.txt' }, { workspaceDir: dir, permission: 'read-only' });
  assert.equal(diff.exit_code, 0);
  assert.match(diff.content, /-before\n\+after/);
});

test('invalid multi-file patches do not partially change valid files', async t => {
  const dir = workspace(t);
  const broken = patch + '--- a/missing.txt\n+++ b/missing.txt\n@@ -1 +1 @@\n-old\n+new\n';
  const result = await executeTool('apply_patch', { patch: broken }, { workspaceDir: dir, permission: 'full' });
  assert.ok(result.error);
  assert.equal(fs.readFileSync(path.join(dir, 'file.txt'), 'utf8'), 'before\n');
});

test('patch approval denial, cancellation, and read-only leave files unchanged', async t => {
  const dir = workspace(t);
  for (const context of [
    { permission: 'read-only', autoApprove: true },
    { permission: 'ask' },
    { permission: 'ask', promptManager: { confirm: async () => false } },
    { permission: 'full', signal: AbortSignal.abort() },
  ]) {
    assert.equal((await executeTool('apply_patch', { patch }, { workspaceDir: dir, ...context })).rejected, true);
    assert.equal(fs.readFileSync(path.join(dir, 'file.txt'), 'utf8'), 'before\n');
  }
});

test('patch paths cannot escape the workspace', async t => {
  const dir = workspace(t);
  const result = await executeTool('apply_patch', { patch: '--- /dev/null\n+++ b/../escape.txt\n@@ -0,0 +1 @@\n+escape\n' }, { workspaceDir: dir, permission: 'full' });
  assert.ok(result.error);
  assert.equal(fs.existsSync(path.join(dir, '..', 'escape.txt')), false);
});

test('pending edit approvals cannot overwrite changes made by another agent', async t => {
  const dir=workspace(t);
  const result=await executeTool('edit_file',{file_path:'file.txt',target_content:'before',replacement_content:'approved edit'},{workspaceDir:dir,permission:'ask',promptManager:{confirm:async(message,defaultYes,options)=>{
    assert.match(options.preview,/approved edit/);
    fs.writeFileSync(path.join(dir,'file.txt'),'other agent change\n');return true;
  }}});
  assert.match(result.error,/changed while awaiting approval/);
  assert.equal(fs.readFileSync(path.join(dir,'file.txt'),'utf8'),'other agent change\n');
});

test('pending write approvals cannot overwrite a concurrently created file', async t => {
  const dir=workspace(t);
  const result=await executeTool('write_file',{file_path:'new.txt',content:'approved content'},{workspaceDir:dir,permission:'ask',promptManager:{confirm:async(message,defaultYes,options)=>{
    assert.match(options.preview,/approved content/);
    fs.writeFileSync(path.join(dir,'new.txt'),'other agent content');return true;
  }}});
  assert.match(result.error,/changed while awaiting approval/);
  assert.equal(fs.readFileSync(path.join(dir,'new.txt'),'utf8'),'other agent content');
});

test('file reads count actual lines, expose trailing newlines, and reject inverted ranges', async t => {
  const dir=workspace(t);
  const context={workspaceDir:dir,permission:'read-only'};
  const normal=await executeTool('view_file',{file_path:'file.txt'},context);
  assert.equal(normal.total_lines,1);
  assert.equal(normal.end_line,1);
  assert.equal(normal.ends_with_newline,true);
  fs.writeFileSync(path.join(dir,'empty.txt'),'');
  assert.equal((await executeTool('view_file',{file_path:'empty.txt'},context)).total_lines,0);
  assert.match((await executeTool('view_file',{file_path:'file.txt',start_line:0},context)).error,/1-indexed/);
  assert.match((await executeTool('view_file',{file_path:'file.txt',start_line:2,end_line:1},context)).error,/greater than/);
});

test('large file reads cannot flood the model context with an unbounded single line', async t => {
  const dir=workspace(t);
  fs.writeFileSync(path.join(dir,'large.txt'),'x'.repeat(100000));
  const result=await executeTool('view_file',{file_path:'large.txt'},{workspaceDir:dir,permission:'read-only'});
  assert.equal(result.truncated,true);
  assert.equal(result.line_output_truncated,true);
  assert.equal(result.content.length,30000);
  assert.equal(result.total_lines,1);
});
