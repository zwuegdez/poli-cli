import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inputViewport, draftViewport, verticalCursor, normalizeInput, splitInput, wordBoundary } from '../src/ui/input-layout.js';
import { cellWidth } from '../src/ui/theme.js';
import { PromptManager } from '../src/ui/prompt.js';

test('input preserves code indentation and newlines while rendering one safe row', () => {
  const text=normalizeInput('  def hello():\r\n\treturn "👩‍💻"\r\n');
  assert.equal(text,'  def hello():\n    return "👩‍💻"\n');
  const buffer=splitInput(text);
  const view=inputViewport(buffer,buffer.length,40);
  assert.doesNotMatch(view.text,/\n/);
  assert.match(view.text,/↵/);
  assert.equal(view.lines,3);
  assert.equal(buffer.join(''),text);
  assert.ok(cellWidth(view.text)<=40);
  assert.ok(view.cursorColumn<40);
});
test('Unicode editing and viewport navigation keep complete graphemes', () => {
  const buffer=splitInput('a👩‍💻日本語 café xyz');
  assert.ok(buffer.includes('👩‍💻'));
  assert.ok(buffer.includes('é'));
  let start=0;
  for(const cursor of [...Array(buffer.length+1).keys(),0,buffer.length]) {
    const view=inputViewport(buffer,cursor,8,start);start=view.start;
    assert.ok(cellWidth(view.text)<=8,view.text);
    assert.ok(view.cursorColumn>=0&&view.cursorColumn<8);
  }
  assert.equal(inputViewport(buffer,0,8,start).start,0);
});
test('word editing handles whitespace and file path separators', () => {
  const words=splitInput('hello world   ');
  assert.equal(wordBoundary(words,words.length,-1),6);
  assert.equal(wordBoundary(words,0,1),6);
  const filename=splitInput('src/app.js');
  assert.equal(wordBoundary(filename,filename.length,-1),8);
});

test('multiline drafts show logical lines and keep the cursor on the last visible row', () => {
  const buffer = splitInput('first\n  second\nthird\nfourth\nfifth');
  const view = draftViewport(buffer, buffer.length, 20, {maxRows:3});
  assert.deepEqual(view.rows, ['third','fourth','fifth']);
  assert.equal(view.hiddenAbove, 2);
  assert.equal(view.lineNumber, 5);
  const earlier = draftViewport(buffer, 11, 20, {maxRows:3});
  assert.deepEqual(earlier.rows, ['first','  second']);
  assert.equal(earlier.hiddenBelow, 3);
  assert.equal(earlier.cursorColumn, 5);
  assert.equal(buffer.join(''), 'first\n  second\nthird\nfourth\nfifth');
});

test('vertical editing uses terminal cells and never splits a Unicode grapheme', () => {
  const buffer = splitInput('a👩‍💻b\n日本語x\nend');
  const next = verticalCursor(buffer, 3, 1);
  assert.equal(buffer.slice(0,next).join(''), 'a👩‍💻b\n日本');
  assert.equal(verticalCursor(buffer,next,-1),3);
  assert.equal(verticalCursor(buffer,0,-1),0);
  assert.equal(verticalCursor(buffer,buffer.length,1),buffer.length);
});
test('multiline history survives restart and retains legacy history entries', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'poli-input-history-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'history.txt');
  fs.writeFileSync(file,'legacy message\n');
  const input=new PromptManager({historyFile:file});
  input.saveHistory('  first line\n    second line\n');
  const restored=new PromptManager({historyFile:file});
  assert.deepEqual(restored.history,['legacy message','  first line\n    second line\n']);
});
