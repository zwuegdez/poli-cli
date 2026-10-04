import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { TurnInput } from '../src/ui/turn-input.js';

function fixture() {
  const input = new PassThrough(); input.isTTY = true; input.isRaw = false;
  input.setRawMode = value => { input.isRaw = value; };
  const output = new PassThrough(); output.isTTY = true; output.rows = 24; output.columns = 60;
  let printed = ''; output.on('data', data => { printed += String(data); });
  const controller = new AbortController();
  const originalWrite = output.write;
  const composer = new TurnInput({ controller, input, output, error: output });
  return { input, output, controller, originalWrite, composer, printed: () => printed };
}
test('typing stays available between output writes, and Enter submits a queued message', () => {
  const f = fixture();
  f.composer.start();
  try {
    f.composer.onKey('hello', {});
    f.output.write('Assistant progress\n');
    f.composer.onKey(' world', {});
    f.composer.onKey('\r', { name: 'return' });
    assert.deepEqual(f.composer.drain(), ['hello world']);
    assert.match(f.printed(), /Assistant progress/);
    assert.match(f.printed(), /1 queued/);
    assert.equal(f.composer.draft(), '');
  } finally { f.composer.close(); }
  assert.equal(f.output.write, f.originalWrite);
  assert.equal(f.input.isRaw, false);
  assert.doesNotMatch(f.printed(), /\x1b\[[0-9;]*r|\x1b\[\?1049[hl]/);
  assert.ok(f.printed().includes('\x1b[?2004l'));
});
test('approval pause preserves the draft and resumes the composer', () => {
  const f = fixture();
  f.composer.start();
  f.composer.onKey('unfinished', {});
  f.composer.suspend();
  assert.equal(f.output.write, f.originalWrite);
  assert.equal(f.composer.draft(), 'unfinished');
  f.composer.start();
  assert.equal(f.composer.draft(), 'unfinished');
  f.composer.onKey(null, { name: 'escape' });
  assert.equal(f.controller.signal.aborted, true);
  f.composer.close();
});
test('pasted multiline follow-ups are queued as one message', () => {
  const f = fixture();
  f.composer.start();
  try {
    f.composer.onKey(null, { sequence: '\x1b[200~' });
    f.composer.onKey('first\nsecond', {});
    f.composer.onKey(null, { sequence: '\x1b[201~' });
    f.composer.onKey(null, { name: 'return' });
    assert.deepEqual(f.composer.drain(), ['first\nsecond']);
  } finally { f.composer.close(); }
});

test('Ctrl+T opens tool details while preserving the draft and running turn', () => {
  const f = fixture();
  let opened = 0;
  f.composer.onDetails = () => { opened++; f.output.write('Tool details\n'); };
  f.composer.start();
  try {
    f.composer.onKey('unfinished task', {});
    f.composer.onKey(null, { ctrl: true, name: 't' });
    assert.equal(opened, 1);
    assert.equal(f.composer.draft(), 'unfinished task');
    assert.equal(f.controller.signal.aborted, false);
    assert.match(f.printed(), /Tool details/);
  } finally { f.composer.close(); }
});

test('newline shortcuts, word deletion, and emoji editing preserve the queued text', () => {
  const f=fixture();f.composer.start();
  try {
    f.composer.onKey('  first',{});
    f.composer.onKey('\n',{sequence:'\n',name:'enter'});
    f.composer.onKey('    👩‍💻 extra',{});
    f.composer.onKey(null,{ctrl:true,name:'w'});
    f.composer.onKey(null,{name:'backspace'});
    assert.equal(f.composer.draft(),'  first\n    👩‍💻');
    f.composer.onKey(null,{name:'backspace'});
    assert.equal(f.composer.draft(),'  first\n    ');
    f.composer.onKey('\r',{name:'return'});
    assert.deepEqual(f.composer.drain(),['  first\n    ']);
  } finally {f.composer.close();}
});
