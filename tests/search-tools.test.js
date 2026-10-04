import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executeTool } from '../src/tools/index.js';

function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'poli-search-tools-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const write=(name,content)=>{fs.mkdirSync(path.dirname(path.join(dir,name)),{recursive:true});fs.writeFileSync(path.join(dir,name),content);};
  write('src/a.js','const Marker = "Alpha";\nfunction test() {}\n');
  write('src/a.js.bak','Marker in a backup\n');
  write('src/a.test.js','Marker in a test\n');
  write('src/deep/b.test.js','Marker in a nested test\n');
  write('notes.txt','Marker in text\n');
  write('node_modules/ignored.js','Marker generated\n');
  return {dir,write,context:{workspaceDir:dir,permission:'read-only'}};
}

test('file search honors extension and nested globs rather than loose suffix substrings', async t=>{
  const {context}=fixture(t);
  const js=await executeTool('file_search',{pattern:'*.js'},context);
  assert.deepEqual(js.files.sort(),['src/a.js','src/a.test.js','src/deep/b.test.js']);
  const tests=await executeTool('file_search',{pattern:'src/**/*.test.js'},context);
  assert.deepEqual(tests.files.sort(),['src/a.test.js','src/deep/b.test.js']);
  assert.equal((await executeTool('file_search',{pattern:'notes'},context)).total_found,1);
  assert.match((await executeTool('file_search',{pattern:'*.js',max_results:0},context)).error,/between/);
});

test('file search can stop, caps results, and does not recurse through symlink loops', async t=>{
  const {dir,context}=fixture(t);
  fs.symlinkSync(dir,path.join(dir,'loop'),'dir');
  const result=await executeTool('file_search',{pattern:'*',max_results:2},context);
  assert.equal(result.files.length,2);assert.equal(result.truncated,true);
  assert.equal((await executeTool('file_search',{pattern:'*'},{...context,signal:AbortSignal.abort()})).rejected,true);
});

test('text search supports files and globs, case options, and regex errors', async t=>{
  const {context}=fixture(t);
  const file=await executeTool('grep_search',{query:'marker',path_pattern:'src/a.js'},context);
  assert.equal(file.match_count,1,JSON.stringify(file));
  assert.match(file.matches[0],/a\.js:1:/);
  const tests=await executeTool('grep_search',{query:'Marker',path_pattern:'src/**/*.test.js'},context);
  assert.equal(tests.match_count,2,JSON.stringify(tests));
  assert.equal((await executeTool('grep_search',{query:'marker',path_pattern:'src/a.js',case_sensitive:true},context)).match_count,0);
  assert.match((await executeTool('grep_search',{query:'[',path_pattern:'src/a.js'},context)).error,/regex|expression|pattern/i);
  assert.match((await executeTool('grep_search',{query:' '},context)).error,/empty/);
});

test('search queries remain data: shell substitutions, backticks, quotes, and flags cannot execute', async t=>{
  const {dir,write,context}=fixture(t);
  const query='$(touch SHOULD_NOT_EXIST) `touch OTHER_FILE` "quoted" -n';
  write('literal.txt',query+'\n');
  const literal=await executeTool('grep_search',{query,literal:true,path_pattern:'literal.txt'},context);
  assert.equal(literal.match_count,1,JSON.stringify(literal));
  assert.equal(fs.existsSync(path.join(dir,'SHOULD_NOT_EXIST')),false);
  assert.equal(fs.existsSync(path.join(dir,'OTHER_FILE')),false);
  assert.equal((await executeTool('grep_search',{query:'function test() {}',literal:true,path_pattern:'src/a.js'},context)).match_count,1);
  assert.equal((await executeTool('grep_search',{query:'-n',literal:true,path_pattern:'literal.txt'},context)).match_count,1);
});

test('large searches bound output and report truncation instead of flooding history', async t=>{
  const {write,context}=fixture(t);
  write('many.txt',Array.from({length:5000},(_,index)=>`match ${index}`).join('\n'));
  const result=await executeTool('grep_search',{query:'match',path_pattern:'many.txt'},context);
  assert.equal(result.truncated,true);
  assert.ok(result.matches.length<=80);
  assert.ok(JSON.stringify(result.matches).length<35000);
  assert.equal((await executeTool('grep_search',{query:'match'},{...context,signal:AbortSignal.abort()})).rejected,true);
});

test('text search uses direct grep when ripgrep is absent from PATH', async t=>{
  const {dir,context}=fixture(t);
  const executable=path.join(dir,'executables');fs.mkdirSync(executable);
  fs.symlinkSync('/usr/bin/grep',path.join(executable,'grep'));
  const previous=process.env.PATH;
  try {
    process.env.PATH=executable;
    const result=await executeTool('grep_search',{query:'Marker',path_pattern:'src/a.js'},context);
    assert.equal(result.engine,'grep',JSON.stringify(result));
    assert.equal(result.match_count,1,JSON.stringify(result));
  } finally {process.env.PATH=previous;}
});
