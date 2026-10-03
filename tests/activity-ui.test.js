import test from 'node:test';
import assert from 'node:assert/strict';
import { changedLines, renderDiff } from '../src/ui/diff.js';
import { toolDetails } from '../src/ui/tool-details.js';
import { toolCard, stripAnsi, cellWidth } from '../src/ui/theme.js';

test('change previews keep repeated context and distinguish inserted and removed lines', () => {
  const before = 'same\na\nsame\nb\nsame';
  const after = 'same\na\nnew\nsame\nb\nsame';
  const diff = changedLines(before, after);
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 0);
  const preview = stripAnsi(renderDiff('src/a.js', before, after));
  assert.match(preview, /\(\+1 −0\)/);
  assert.match(preview, /3 \+ new/);
  assert.doesNotMatch(preview, /− same/);
  const deleted = stripAnsi(renderDiff('src/a.js', after, before));
  assert.match(deleted, /\(\+0 −1\)/);
  assert.match(deleted, /3 − new/);
});
test('activity previews are bounded and details recover the complete tool output', () => {
  const stdout = Array.from({ length: 20 }, (_, i) => `output ${i}`).join('\n');
  const result = { stdout, exit_code: 0 };
  const card = stripAnsi(toolCard({ name: 'run_command', args: { command: 'npm test' }, result, status: 'success' }));
  assert.match(card, /\[ok\] Ran npm test/);
  assert.match(card, /└ output 0/);
  assert.doesNotMatch(card, /output 19/);
  assert.match(card, /Ctrl\+T or \/details/);
  const details = stripAnsi(toolDetails([{ role: 'tool', name: 'run_command', content: JSON.stringify(result) }]));
  assert.match(details, /output 19/);
  assert.doesNotMatch(card, /[╭╮╰╯│]/);
});
test('numbered change previews fit narrow terminals with Unicode', () => {
  const previous = process.stdout.columns;
  try {
    process.stdout.columns = 20;
    const preview = renderDiff('a/long/file/name.js', '日本語'.repeat(20), 'changed '.repeat(20));
    assert.ok(preview.split('\n').every(line => cellWidth(line) <= 20));
  } finally { process.stdout.columns = previous; }
});

test('details tolerate null and primitive tool results', () => {
  for (const content of ['null', '42', '"done"', '[1,2]']) {
    assert.doesNotThrow(() => toolDetails([{ role: 'tool', name: 'test', content }]));
  }
});
test('tool output cannot erase messages or move the terminal cursor', () => {
  const stdout = 'before\x1b[2J\x1b[1;1Hafter\x1b]0;changed title\x07\rkeep';
  const result = { stdout };
  const details = toolDetails([{ role: 'tool', name: 'run_command', content: JSON.stringify(result) }]);
  const card = toolCard({ name: 'run_command', args: { command: 'test' }, status: 'success', result });
  for (const output of [details, card]) {
    assert.doesNotMatch(output, /\x1b\[2J|\x1b\[1;1H|\x1b\]|\x07|\r/);
    assert.match(output, /before/);
    assert.match(output, /after/);
  }
});
test('large replacement previews include both removed and added text', () => {
  const before = Array.from({length: 100}, (_, i) => `old ${i}`).join('\n');
  const after = Array.from({length: 100}, (_, i) => `new ${i}`).join('\n');
  const preview = stripAnsi(renderDiff('a.js', before, after));
  assert.match(preview, /− old/);
  assert.match(preview, /\+ new/);
  assert.ok(preview.split('\n').length <= 62);
});

test('older tool results can be selected and invalid selections are explained', () => {
  const messages = [{role:'tool',name:'first',content:'{"stdout":"older output"}'},{role:'assistant',content:'done'},{role:'tool',name:'second',content:'{"stdout":"latest output"}'}];
  assert.match(stripAnsi(toolDetails(messages, 2)), /older output/);
  assert.doesNotMatch(stripAnsi(toolDetails(messages, 2)), /latest output/);
  assert.match(stripAnsi(toolDetails(messages, 9)), /Only 2 tool results/);
  assert.match(stripAnsi(toolDetails(messages, 0)), /Use \/details/);
});
