import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import headless from '@xterm/headless';
import { TurnInput } from '../src/ui/turn-input.js';
import { Spinner } from '../src/ui/spinner.js';
import { ComposerView, inputLine, composerFooter } from '../src/ui/composer-view.js';
const { Terminal } = headless;

test('subagent activity grows and shrinks without duplicating the composer or erasing history', async () => {
  const f = fixture(24, 90);
  try {
    f.output.write('AGENT_TRANSCRIPT_KEEP\n'); f.composer.start();
    f.composer.onKey('draft while agents work', {});
    for (let index = 0; index < 8; index++) {
      f.composer.setAgents([{label:'Review',status:'running',activity:index % 2 ? 'Thinking' : 'Using view_file'}]);
      await f.flush();
      assert.equal(f.lines().filter(line=>line.includes('draft while agents work')).length,1);
      assert.equal(f.lines().filter(line=>line.includes('1 subagent')).length,1);
      f.composer.setAgents([]); await f.flush();
      assert.equal(f.lines().filter(line=>line.includes('draft while agents work')).length,1);
      assert.equal(f.lines().filter(line=>line.includes('1 subagent')).length,0);
      assert.ok(f.lines().includes('AGENT_TRANSCRIPT_KEEP'));
    }
  } finally { f.composer.close(); f.terminal.dispose(); }
});

test('context usage survives animation and resize with one editable draft', async () => {
  const f=fixture(24,90);
  try {
    f.output.write('CONTEXT_TRANSCRIPT_KEEP\n');f.composer.start();
    f.composer.onKey('context draft',{});
    f.composer.setContext({usedTokens:12000,limitTokens:128000,percentUsed:10});
    await f.flush();
    for(const columns of [40,90,30,110]) {
      f.terminal.resize(columns,24);f.output.columns=columns;
      f.composer.view.resize();f.composer.setActivity('Thinking…',2,'3s');
      await f.flush();
      assert.equal(f.lines().filter(line=>line.includes('context draft')).length,1,f.lines().join('\n'));
      assert.equal(f.lines().filter(line=>line.includes('context ~')).length,1,f.lines().join('\n'));
      assert.ok(f.lines().includes('CONTEXT_TRANSCRIPT_KEEP'));
    }
  }finally{f.composer.close();f.terminal.dispose();}
});

test('changing the indicator color repaints only the prefix and restores the typing cursor', async () => {
  const f = fixture();
  let printed = '';
  f.output.on('data', data => { printed += String(data); });
  const view = new ComposerView(f.output, text => f.output.write(text));
  try {
    const body = 'draft stays here';
    const first = '\x1b[32m●\x1b[0m › ';
    const next = '\x1b[92m●\x1b[0m › ';
    view.paint([first + body], 0, 4 + body.length, {prefix: first, body});
    await f.flush(); printed = '';
    view.paint([next + body], 0, 4 + body.length, {prefix: next, body});
    await f.flush();
    assert.ok(printed.includes(next));
    assert.ok(!printed.includes(body));
    assert.ok(f.lines().some(line => line === '● › ' + body));
    assert.equal(f.terminal.buffer.active.cursorX, 4 + body.length);
  } finally { f.terminal.dispose(); }
});

test('idle input and slash menu survive mobile reflow without stale rows', async () => {
  const f = fixture(24, 110);
  const view = new ComposerView(f.output, text => f.output.write(text));
  const paint = (menu = false) => {
    const rows = ['', inputLine('idle draft', f.output.columns).row, ...composerFooter({model: 'demo', width: f.output.columns})];
    if (menu) rows.push('  › /models', '    /mode');
    view.paint(rows, 1, 12);
  };
  try {
    f.output.write('IDLE_TRANSCRIPT_KEEP\n'); paint(); await f.flush();
    for (const cols of [40, 110, 30, 80]) {
      f.terminal.resize(cols, 24); f.output.columns = cols; view.resize(); paint(); await f.flush();
      assert.equal(f.lines().filter(line => line.includes('idle draft')).length, 1, f.lines().join('\n'));
      assert.ok(f.lines().includes('IDLE_TRANSCRIPT_KEEP'));
    }
    paint(true); await f.flush();
    assert.ok(f.lines().some(line => line.includes('/models')));
    paint(); await f.flush();
    assert.ok(!f.lines().some(line => line.includes('/models')));
    view.clear(); f.output.write('NEXT_MESSAGE_KEEP\n'); await f.flush();
    assert.ok(f.lines().includes('IDLE_TRANSCRIPT_KEEP'));
    assert.ok(f.lines().includes('NEXT_MESSAGE_KEEP'));
    assert.ok(!f.lines().some(line => line.includes('idle draft')));
  } finally { f.terminal.dispose(); }
});

test('one-row and zero-size app transitions do not scroll idle prompts into history', async () => {
  const f = fixture(52, 110);
  const view = new ComposerView(f.output, text => f.output.write(text));
  const paint = () => view.paint(['', inputLine('Ask Poli to build, fix, or explain…', f.output.columns, {placeholder: true}).row, ...composerFooter({model: 'demo', width: f.output.columns})], 1, 2);
  try {
    f.output.write('APP_SWITCH_HISTORY_KEEP\n'); paint(); await f.flush();
    for (const [cols, rows] of [[110, 2], [0, 0], [110, 52], [110, 1], [110, 52], [1, 2], [110, 52]]) {
      if (cols && rows) f.terminal.resize(cols, rows);
      f.output.columns = cols; f.output.rows = rows;
      view.resize(); paint(); await f.flush();
    }
    const lines = f.lines();
    assert.ok(lines.includes('APP_SWITCH_HISTORY_KEEP'), lines.join('\n'));
    assert.equal(lines.filter(line => line.includes('Ask Poli to build')).length, 1, lines.join('\n'));
    assert.equal(lines.filter(line => line.includes('demo · agent')).length, 1, lines.join('\n'));
  } finally { f.terminal.dispose(); }
});

test('streaming during a hidden tiny window buffers output and restores one draft', async () => {
  const f = fixture(52, 110);
  try {
    f.output.write('WORK_SWITCH_HISTORY_KEEP\n'); f.composer.start();
    f.composer.onKey('keep this draft', {}); await f.flush();
    for (let i = 0; i < 3; i++) {
      f.terminal.resize(110, 2); f.output.rows = 2;
      f.composer.onResize();
      f.composer.setActivity('Replying…', i, `${i}s`);
      f.output.write(`HIDDEN_REPLY_${i}\n`);
      assert.ok(f.composer.pendingOutput.includes(`HIDDEN_REPLY_${i}`));
      f.terminal.resize(110, 52); f.output.rows = 52;
      f.composer.onResize(); await f.flush();
    }
    const lines = f.lines();
    assert.ok(lines.includes('WORK_SWITCH_HISTORY_KEEP'), lines.join('\n'));
    assert.equal(lines.filter(line => line.includes('keep this draft')).length, 1, lines.join('\n'));
    for (let i = 0; i < 3; i++) assert.equal(lines.filter(line => line === `HIDDEN_REPLY_${i}`).length, 1, lines.join('\n'));
    assert.equal(f.composer.draft(), 'keep this draft');
  } finally { f.composer.close(); f.terminal.dispose(); }
});

test('the recorded reconnect geometry burst redraws idle input once after settling', async () => {
  const f = fixture(24, 120);
  const view = new ComposerView(f.output, text => f.output.write(text));
  const paint = () => view.paint(['', inputLine('Ask Poli to build, fix, or explain…', f.output.columns, {placeholder: true}).row, ...composerFooter({model: 'cbai/hy4-preview', width: f.output.columns})], 1, 2);
  let printed = '';
  f.output.on('data', chunk => { printed += String(chunk); });
  try {
    for (let i = 0; i < 80; i++) f.output.write(`BURST_HISTORY_${i}\n`);
    paint(); await f.flush(); printed = '';
    for (const [cols, rows] of [[120, 22], [120, 45], [70, 69], [70, 47], [120, 24], [120, 45], [120, 22]]) {
      f.terminal.resize(cols, rows); f.output.columns = cols; f.output.rows = rows;
      view.queueResize(paint);
      paint(); // Keypresses during the resize burst must not paint extra inputs.
    }
    assert.equal(printed, '');
    await view.settled(); await f.flush();
    assert.equal(printed.split('Ask Poli to build').length - 1, 1);
    assert.equal(f.lines().filter(line => line.includes('Ask Poli to build')).length, 1);
    for (let i = 0; i < 80; i++) assert.ok(f.lines().includes(`BURST_HISTORY_${i}`));
  } finally { view.dispose(); f.terminal.dispose(); }
});

test('reconnect bursts buffer progress and animate again with one working draft', async () => {
  const f = fixture(24, 120);
  let printed = '';
  f.output.on('data', chunk => { printed += String(chunk); });
  try {
    f.output.write('BURST_WORK_HISTORY_KEEP\n'); f.composer.start();
    f.composer.onKey('one working draft', {}); await f.flush(); printed = '';
    for (const [cols, rows] of [[120, 45], [70, 69], [70, 47], [120, 24], [120, 22]]) {
      f.terminal.resize(cols, rows); f.output.columns = cols; f.output.rows = rows;
      f.composer.onResize(); f.composer.setActivity('Replying…', 3, '2s');
    }
    f.output.write('BURST_PROGRESS_KEEP\n');
    assert.equal(printed, '');
    await f.flush();
    assert.equal(printed.split('one working draft').length - 1, 1);
    assert.equal(f.lines().filter(line => line.includes('one working draft')).length, 1);
    assert.ok(f.lines().includes('BURST_WORK_HISTORY_KEEP'));
    assert.ok(f.lines().includes('BURST_PROGRESS_KEEP'));
  } finally { f.composer.close(); f.terminal.dispose(); }
});

function fixture(rows = 24, cols = 80, terminalOptions = {}) {
  const terminal = new Terminal({ rows, cols, scrollback: 1000, convertEol: true, allowProposedApi: true, ...terminalOptions });
  const input = new PassThrough(); input.isTTY = true; input.isRaw = false;
  input.setRawMode = value => { input.isRaw = value; };
  const output = new PassThrough(); output.isTTY = true; output.rows = rows; output.columns = cols;
  output.on('data', data => terminal.write(String(data)));
  const composer = new TurnInput({controller: new AbortController(), input, output, error: output});
  const flush = async () => {
    await composer.view?.settled();
    await new Promise(resolve => terminal.write('', resolve));
  };
  const lines = () => Array.from({length: terminal.buffer.active.length}, (_, i) => terminal.buffer.active.getLine(i)?.translateToString(true) || '');
  return { terminal, input, output, composer, flush, lines };
}

for (const windowsMode of [false, true]) {
  test(`reconnecting preserves one idle composer when terminal reflow is ${windowsMode ? 'disabled' : 'enabled'}`, async () => {
    const f = fixture(52, 110, {windowsMode});
    const view = new ComposerView(f.output, text => f.output.write(text));
    const paint = () => view.paint(['', inputLine('Ask Poli to build, fix, or explain…', f.output.columns, {placeholder: true}).row, ...composerFooter({model: 'demo', width: f.output.columns})], 1, 2);
    try {
      for (let i = 0; i < 70; i++) f.output.write(`RECONNECT_HISTORY_${i}\n`);
      paint(); await f.flush();
      for (const [cols, rows] of [[110, 22], [68, 22], [68, 22], [110, 52], [110, 22], [110, 22]]) {
        f.terminal.resize(cols, rows); f.output.columns = cols; f.output.rows = rows;
        view.resize(); paint(); await f.flush();
        const lines = f.lines();
        assert.equal(lines.filter(line => line.includes('Ask Poli to build')).length, 1, lines.join('\n'));
        for (let i = 0; i < 70; i++) assert.ok(lines.includes(`RECONNECT_HISTORY_${i}`), lines.join('\n'));
      }
      view.clear(); await f.flush();
      assert.ok(!f.lines().some(line => line.includes('Ask Poli to build')));
    } finally { f.terminal.dispose(); }
  });
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
    assert.equal(f.lines().filter(line=>line.includes('Ask Poli to build')).length,1,f.lines().join('\n'));
    f.output.write('AFTER_RESIZE_KEEP\n');f.composer.close();f.output.write('NEXT_PROMPT_KEEP\n');await f.flush();
    const lines=f.lines();
    for(const marker of ['HEADER_KEEP','BEFORE_RESIZE_KEEP','AFTER_RESIZE_KEEP','NEXT_PROMPT_KEEP'])assert.ok(lines.includes(marker),lines.join('\n'));
    assert.equal(lines.filter(line=>line.includes('Ask Poli to build')).length,0,lines.join('\n'));
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
    assert.equal(lines.filter(line=>line.includes('Ask Poli to build')).length,0,lines.join('\n'));
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

test('activity and model context stay above the draft without repainting it', async () => {
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
    assert.ok(lines[inputRow].startsWith('› '));
    assert.match(lines[inputRow - 4], /• Replying \(1s · Esc to stop\)/);
    assert.equal(lines[inputRow - 3], '');
    assert.match(lines[inputRow - 2], /poli · agent/);
    assert.match(lines[inputRow - 1], /Enter queue · Esc stop/);
    assert.equal(f.terminal.buffer.active.cursorX, draft.length + 2);
    assert.ok(!printed.includes(draft), 'animation must not rewrite the draft');
    f.composer.onKey('\r', {name: 'return'});
    await f.flush();
    assert.ok(f.lines().some(line => line.includes('1 queued')));
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
    assert.equal(f.lines().filter(line => line.includes('Ask Poli to build')).length, 1);
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

for (const working of [false, true]) {
  test(`cursor clamped to bottom on reconnect preserves one ${working ? 'working' : 'idle'} input`, async () => {
    const f = fixture(24, 120);
    const view = working ? null : new ComposerView(f.output, text => f.output.write(text));
    const activeView = () => view || f.composer.view;
    const response = f.terminal.onData(data => activeView()?.handleCursorReport(data));
    const paint = () => view.paint(['', ...composerFooter({model: 'demo', width: 120}), inputLine('RECONNECT_DRAFT', 120).row], 3, 2);
    try {
      for (let i = 0; i < 30; i++) f.output.write(`HISTORY_${i}\n`);
      if (working) { f.composer.start(); f.composer.onKey('RECONNECT_DRAFT', {}); }
      else paint();
      await f.flush();
      for (const height of [22, 20, 18]) {
        f.terminal.resize(120, height); f.output.rows = height;
        // The measured mobile client retains the cursor on the last row after
        // shrinking. Keeping the input last avoids any footer/cursor mismatch.
        f.output.write(`\x1b[${height};3H`);
        await f.flush();
        if (working) f.composer.onResize(); else view.queueResize(paint);
        await activeView().settled(); await f.flush();
        assert.equal(f.lines().filter(line => line.includes('RECONNECT_DRAFT')).length, 1, f.lines().join('\n'));
        for (let i = 0; i < 30; i++) assert.ok(f.lines().includes(`HISTORY_${i}`), `missing ${i}: ` + f.lines().join("\n"));
      }
    } finally { response.dispose(); if (working) f.composer.suspend(); view?.dispose(); f.terminal.dispose(); }
  });
}

test('a new resize cancels an outstanding cursor query and late reports never become input', async () => {
  const f = fixture();
  let queries = 0;
  let firstQuery;
  const queried = new Promise(resolve => { firstQuery = resolve; });
  f.output.on('data', data => { if (String(data).includes('\x1b[6n')) { queries++; firstQuery(); } });
  try {
    f.composer.start(); f.composer.onKey('keep draft', {});
    f.composer.onResize(); await queried;
    f.composer.onResize();
    f.composer.onKey(undefined, {sequence: '\x1b[24;3R'});
    assert.equal(f.composer.view.resizing, true);
    await f.flush();
    assert.equal(queries, 2);
    assert.equal(f.composer.buffer.join(''), 'keep draft');
    f.composer.onKey(undefined, {sequence: '\x1b[24;3R'});
    assert.equal(f.composer.buffer.join(''), 'keep draft');
  } finally { f.composer.suspend(); f.terminal.dispose(); }
});
