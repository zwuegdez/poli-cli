import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import headless from '@xterm/headless';
import { TurnInput } from '../src/ui/turn-input.js';
import { Spinner } from '../src/ui/spinner.js';
const { Terminal } = headless;

function fixture(rows = 24, cols = 80) {
  const terminal = new Terminal({ rows, cols, scrollback: 1000, convertEol: true, allowProposedApi: true });
  const input = new PassThrough(); input.isTTY = true; input.isRaw = false;
  input.setRawMode = value => { input.isRaw = value; };
  const output = new PassThrough(); output.isTTY = true; output.rows = rows; output.columns = cols;
  output.on('data', data => terminal.write(String(data)));
  const composer = new TurnInput({controller: new AbortController(), input, output, error: output});
  const flush = () => new Promise(resolve => terminal.write('', resolve));
  const lines = () => Array.from({length: terminal.buffer.active.length}, (_, i) => terminal.buffer.active.getLine(i)?.translateToString(true) || '');
  return { terminal, input, output, composer, flush, lines };
}
test('ending a turn appends the next prompt below the answer instead of overwriting the header', async () => {
  const f = fixture();
  try {
    f.output.write('HEADER_KEEP\nWorkspace: project\nAPPROVALS_KEEP\n\nYou: hi\n');
    f.composer.start();
    f.output.write('ASSISTANT_KEEP\n');
    f.composer.close();
    f.output.write('\nAgent · demo · 42 tokens\n › next message');
    await f.flush();
    const lines = f.lines();
    assert.ok(lines.includes('HEADER_KEEP'), lines.join('\n'));
    assert.ok(lines.includes('APPROVALS_KEEP'), lines.join('\n'));
    assert.ok(lines.findIndex(line=>line.includes('Agent · demo')) > lines.indexOf('ASSISTANT_KEEP'), lines.join('\n'));
  } finally { f.composer.close(); f.terminal.dispose(); }
});
test('starting the working composer preserves the user card already at the bottom of the screen', async () => {
  const f = fixture();
  try {
    for(let i=0;i<20;i++)f.output.write(`history ${i}\n`);
    f.output.write('╭─ You ─╮\n│ USER_CARD_KEEP │\n╰───────╯\n');
    f.composer.start();
    f.output.write('reply\n');
    await f.flush();
    assert.ok(f.lines().some(line=>line.includes('USER_CARD_KEEP')), f.lines().join('\n'));
  } finally { f.composer.close(); f.terminal.dispose(); }
});

test('approval pause and repeated turns keep cards and prompts in chronological order', async () => {
  const f = fixture(24, 96);
  try {
    f.output.write('STARTUP_KEEP\n');
    for(let turn=0;turn<3;turn++) {
      f.output.write(`╭─ You ${turn} ─╮\n│ USER_${turn}_KEEP │\n╰─────────╯\n`);
      f.composer.start();
      f.output.write(`REPLY_${turn}_KEEP\n`);
      f.composer.suspend();
      f.output.write(`APPROVAL_${turn}_KEEP\n`);
      f.composer.start();
      f.output.write(`RESULT_${turn}_KEEP\n`);
      f.composer.close();
      f.output.write(`IDLE_${turn}_KEEP\n`);
    }
    await f.flush();
    const lines = f.lines();
    assert.ok(lines.includes('STARTUP_KEEP'), lines.join('\n'));
    let previous = -1;
    for(let turn=0;turn<3;turn++) {
      for(const marker of [`USER_${turn}_KEEP`, `REPLY_${turn}_KEEP`, `APPROVAL_${turn}_KEEP`, `RESULT_${turn}_KEEP`, `IDLE_${turn}_KEEP`]) {
        const index = lines.findIndex(line=>line.includes(marker));
        assert.ok(index>previous, marker+'\n'+lines.join('\n'));previous=index;
      }
    }
  } finally { f.composer.close(); f.terminal.dispose(); }
});

test('resizing does not leave an old working footer in the conversation', async () => {
  const f = fixture();
  try {
    f.output.write('HEADER_KEEP\n');
    f.composer.start();f.output.write('BEFORE_RESIZE_KEEP\n');await f.flush();
    f.terminal.resize(80, 30);f.output.rows=30;f.composer.onResize();await f.flush();
    assert.equal(f.lines().filter(line=>line.includes('Message poli')).length,1,f.lines().join('\n'));
    f.output.write('AFTER_RESIZE_KEEP\n');f.composer.close();f.output.write('NEXT_PROMPT_KEEP\n');await f.flush();
    const lines=f.lines();
    for(const marker of ['HEADER_KEEP','BEFORE_RESIZE_KEEP','AFTER_RESIZE_KEEP','NEXT_PROMPT_KEEP'])assert.ok(lines.includes(marker),lines.join('\n'));
    assert.equal(lines.filter(line=>line.includes('Message poli')).length,0,lines.join('\n'));
  } finally { f.composer.close();f.terminal.dispose(); }
});

test('shrinking terminal height preserves the answer, draft, and restored cursor', async () => {
  const f = fixture();
  try {
    f.output.write('HEADER_KEEP\n');f.composer.start();f.output.write('BEFORE_SHRINK_KEEP\n');
    f.composer.onKey('my draft', {});await f.flush();
    f.terminal.resize(80, 18);f.output.rows=18;f.composer.onResize();await f.flush();
    assert.equal(f.lines().filter(line=>line.includes('my draft')).length,1,f.lines().join('\n'));
    f.output.write('AFTER_SHRINK_KEEP\n');f.composer.close();f.output.write('NEXT_PROMPT_KEEP\n');await f.flush();
    const lines=f.lines();
    for(const marker of ['HEADER_KEEP','BEFORE_SHRINK_KEEP','AFTER_SHRINK_KEEP','NEXT_PROMPT_KEEP'])assert.ok(lines.includes(marker),lines.join('\n'));
    assert.equal(f.composer.draft(),'my draft');
    assert.equal(lines.filter(line=>line.includes('Message poli')).length,0,lines.join('\n'));
  } finally { f.composer.close();f.terminal.dispose(); }
});

test('full-width framed output survives footer redraws between individual lines', async () => {
  const f=fixture(24,80);
  try {
    const border='─'.repeat(78);
    const card=`╭${border}╮\n│ ${'USER_CONTENT_KEEP'.padEnd(76)} │\n╰${border}╯\n`;
    f.output.write(card);
    f.composer.start();
    for(const line of [`╭${border}╮`, `│ ${'ASSISTANT_CONTENT_KEEP'.padEnd(76)} │`, `╰${border}╯`]) {
      f.output.write(line);f.composer.onKey('a',{});f.output.write('\n');
    }
    f.composer.close();f.output.write('IDLE_KEEP\n');await f.flush();
    const lines=f.lines();
    assert.ok(lines.some(line=>line.includes('USER_CONTENT_KEEP')),lines.join('\n'));
    assert.ok(lines.some(line=>line.includes('ASSISTANT_CONTENT_KEEP')),lines.join('\n'));
    assert.equal(lines.filter(line=>line===`╭${border}╮`).length,2,lines.join('\n'));
    assert.equal(lines.filter(line=>line===`╰${border}╯`).length,2,lines.join('\n'));
    assert.ok(lines.includes('IDLE_KEEP'),lines.join('\n'));
  } finally {f.composer.close();f.terminal.dispose();}
});


test('long conversations enter native scrollback and can be scrolled during work', async () => {
  const f = fixture(12, 80);
  try {
    f.output.write('FIRST_MESSAGE_KEEP\n');
    f.composer.start();
    for (let i = 0; i < 100; i++) f.output.write(`MESSAGE_${i}_KEEP\n`);
    await f.flush();
    assert.ok(f.terminal.buffer.active.baseY > 80);
    f.terminal.scrollToTop();
    assert.equal(f.terminal.buffer.active.viewportY, 0);
    f.composer.setActivity('Running view_file', 3);
    await f.flush();
    assert.equal(f.terminal.buffer.active.viewportY, 0);
    const lines = f.lines();
    assert.ok(lines.includes('FIRST_MESSAGE_KEEP'));
    for (let i = 0; i < 100; i++) assert.equal(lines.filter(line => line === `MESSAGE_${i}_KEEP`).length, 1);
    f.terminal.scrollToBottom();
    assert.equal(f.terminal.buffer.active.viewportY, f.terminal.buffer.active.baseY);
  } finally { f.composer.close(); f.terminal.dispose(); }
});

test('partial output and animated tool status never overwrite messages or drafts', async () => {
  const f = fixture(12, 80);
  const spinner = new Spinner('Running view_file', f.output);
  try {
    f.composer.start();
    f.composer.onKey('follow-up draft', {});
    f.output.write('PARTIAL_');
    spinner.start();
    for (let i = 0; i < 10; i++) { spinner.frameIndex = i; spinner.render(); }
    await f.flush();
    const editableLine = f.lines().find(line => line.includes('follow-up draft'));
    assert.ok(editableLine?.startsWith('› follow-up draft'));
    assert.ok(f.lines().some(line => line.includes('Running view_file')));
    assert.ok(!editableLine.includes('Running view_file'));
    f.output.write('MESSAGE_KEEP\n');
    f.output.write('UNTERMINATED_KEEP');
    spinner.stop();
    f.composer.close();
    await f.flush();
    assert.equal(f.lines().filter(line => line === 'PARTIAL_MESSAGE_KEEP').length, 1);
    assert.ok(f.lines().includes('UNTERMINATED_KEEP'));
    assert.equal(f.composer.draft(), 'follow-up draft');
    assert.ok(!f.lines().some(line => line.includes('Running view_file')));
  } finally { spinner.stop(); f.composer.close(); f.terminal.dispose(); }
});

test('activity animates above a full-width draft without repainting the input', async () => {
  const f = fixture(12, 80);
  let printed = '';
  f.output.on('data', chunk => { printed += String(chunk); });
  try {
    f.output.write('TRANSCRIPT_KEEP\n');
    f.composer.start();
    const draft = 'Write a detailed test for the chat input and keep this whole draft';
    f.composer.onKey(draft, {});
    f.composer.setActivity('Replying…', 0, '1.0s');
    await f.flush();
    printed = '';
    f.composer.setActivity('Replying…', 2, '1.1s');
    await f.flush();
    const lines = f.lines();
    assert.ok(lines.includes('TRANSCRIPT_KEEP'));
    const inputRow = lines.findIndex(line => line.includes(draft));
    assert.ok(inputRow > 0);
    assert.match(lines[inputRow - 1], /· ● · Replying · 1.1s/);
    assert.match(lines[inputRow - 1], /Enter queue · Esc stop/);
    assert.equal(f.terminal.buffer.active.cursorX, draft.length + 2);
    assert.ok(!printed.includes(draft), 'animation must not rewrite the draft');
    f.composer.onKey('\r', {name: 'return'});
    await f.flush();
    assert.ok(f.lines().some(line => line.includes('1 queued')));
    assert.ok(f.lines().some(line => line.includes('Message queued. Add another')));
    assert.deepEqual(f.composer.drain(), [draft]);
  } finally { f.composer.close(); f.terminal.dispose(); }
});


test('narrowing the terminal removes reflowed input hints without deleting the transcript', async () => {
  const f = fixture(24, 80);
  try {
    f.output.write('TRANSCRIPT_KEEP\n');
    f.composer.start();
    f.composer.setActivity('Running run_command with a long command description', 2);
    await f.flush();
    f.terminal.resize(30, 24); f.output.columns = 30; f.composer.onResize();
    await f.flush();
    assert.ok(f.lines().includes('TRANSCRIPT_KEEP'));
    assert.equal(f.lines().filter(line => line.includes('Running')).length, 1);
    f.output.write('AFTER_NARROW_KEEP\n'); f.composer.close(); await f.flush();
    assert.ok(f.lines().includes('TRANSCRIPT_KEEP'));
    assert.ok(f.lines().includes('AFTER_NARROW_KEEP'));
    assert.equal(f.lines().filter(line => line.includes('Running')).length, 0);
  } finally { f.composer.close(); f.terminal.dispose(); }
});


test('opening and closing a mobile keyboard keeps history and one editable draft', async () => {
  const f = fixture(52, 110);
  try {
    for (let i = 0; i < 80; i++) f.output.write(`HISTORY_${i}_KEEP\n`);
    f.composer.start();
    f.composer.onKey('mobile draft', {});
    await f.flush();
    for (const [cols, rows] of [[110, 22], [68, 22], [110, 52], [110, 22]]) {
      f.terminal.resize(cols, rows); f.output.columns = cols; f.output.rows = rows;
      f.composer.onResize(); await f.flush();
      assert.equal(f.lines().filter(line => line.includes('mobile draft')).length, 1);
      assert.equal(f.composer.draft(), 'mobile draft');
      for (let i = 0; i < 80; i++) assert.ok(f.lines().includes(`HISTORY_${i}_KEEP`));
    }
    f.output.write('NEW_REPLY_KEEP\n'); f.composer.close(); await f.flush();
    assert.ok(f.lines().includes('NEW_REPLY_KEEP'));
    assert.ok(!f.lines().some(line => line.includes('mobile draft')));
  } finally { f.composer.close(); f.terminal.dispose(); }
});
