import readline from 'node:readline';
import { inputViewport, normalizeInput, splitInput, wordBoundary } from './input-layout.js';
import { accent, messageText, cellWidth, style, truncate } from './theme.js';

// Keep a compact activity row above the editable line. Use normal scrolling so
// every completed output line enters native scrollback; never set scroll margins.
export class TurnInput {
  constructor({ controller, onSubmit, onDetails, input = process.stdin, output = process.stdout, error = process.stderr }) {
    Object.assign(this, { controller, onSubmit, onDetails, input, output, error });
    this.queue = [];
    this.buffer = [];
    this.cursor = 0;
    this.active = false;
    this.notice = '';
    this.viewStart = 0;
    this.pasting = false;
    this.paste = '';
    this.onKey = this.onKey.bind(this);
    this.onResize = this.onResize.bind(this);
  }
  start() {
    if (this.active || !this.input.isTTY || !this.output.isTTY) return;
    this.active = true;
    this.previousRaw = this.input.isRaw;
    this.stdoutWrite = this.output.write;
    this.stderrWrite = this.error.write;
    this.rawWrite = text => this.stdoutWrite.call(this.output, text);
    this.pendingOutput = '';
    this.activity = '';
    this.footerVisible = false;
    this.lastInput = '';
    this.lastStatus = '';
    this.rawWrite('\x1b[?2004h\x1b[6 q');
    const wrap = (stream, original) => (chunk, encoding, callback) => {
      this.pendingOutput += Buffer.isBuffer(chunk) ? chunk.toString(typeof encoding === 'string' ? encoding : 'utf8') : String(chunk);
      const end = this.pendingOutput.lastIndexOf('\n');
      if (end >= 0) {
        this.clear();
        original.call(stream, this.pendingOutput.slice(0, end + 1));
        this.pendingOutput = this.pendingOutput.slice(end + 1);
        this.draw();
      }
      const done = typeof encoding === 'function' ? encoding : callback;
      if (done) queueMicrotask(done);
      return true;
    };
    this.output.write = wrap(this.output, this.stdoutWrite);
    this.output.poliTurnInput = this;
    if (this.error !== this.output && this.error.isTTY) {
      this.error.write = wrap(this.error, this.stderrWrite);
      this.error.poliTurnInput = this;
    }
    readline.emitKeypressEvents(this.input);
    this.input.setRawMode(true);
    this.input.resume();
    this.input.on('keypress', this.onKey);
    this.output.on('resize', this.onResize);
    this.draw();
  }
  clear() {
    if (this.footerVisible) this.rawWrite('\r\x1b[1A\x1b[J');
    else this.rawWrite('\r\x1b[2K');
    this.footerVisible = false;
  }
  draw() {
    if (!this.active) return;
    const width = Math.max(8, this.output.columns || 80);
    const frames = ['● · ·', '· ● ·', '· · ●', '· ● ·'];
    const frame = frames[Math.floor((this.frameIndex || 0) / 2) % frames.length];
    const activity = (this.activity || 'Working').replace(/…$/, '');
    const status = `${frame} ${activity}${this.elapsed ? ' · ' + this.elapsed : ''}`;
    const hint = this.queue.length ? `${this.queue.length} queued · Esc stop` : 'Enter queue · Esc stop';
    const statusRoom = width - cellWidth(hint) - 4;
    const label = truncate(status, Math.max(1, statusRoom >= 12 ? statusRoom : width - 1));
    const statusLine = accent(label) + (statusRoom >= 12 ? ' '.repeat(Math.max(2, width - cellWidth(label) - cellWidth(hint) - 1)) + style.dim(hint) : '');
    const prompt = '› ';
    const promptWidth = cellWidth(prompt);
    const available = Math.max(1, width - promptWidth - 2);
    const view = inputViewport(this.buffer, this.cursor, available, this.viewStart);
    this.viewStart = view.start;
    const value = view.text;
    const placeholder = this.notice ? 'Message queued. Add another…' : 'Message poli…';
    const inputLine = accent(prompt) + (this.buffer.length ? messageText(value) : style.dim(truncate(placeholder, available)));
    const cursorColumn = promptWidth + view.cursorColumn;
    if (!this.footerVisible) {
      this.rawWrite(`${statusLine}\r\n${inputLine}`);
      this.footerVisible = true;
    } else {
      // Animation updates only the status row: the input and its cursor do not flicker.
      if (statusLine !== this.lastStatus) this.rawWrite(`\r\x1b[1A\x1b[2K${statusLine}\r\x1b[1B`);
      if (inputLine !== this.lastInput) this.rawWrite(`\r\x1b[2K${inputLine}`);
    }
    this.lastInput = inputLine;
    this.lastStatus = statusLine;
    this.lastCursorColumn = cursorColumn;
    this.rawWrite(`\r\x1b[${cursorColumn}C`);
  }
  setActivity(text, frame = 0, elapsed = '') {
    if (text && text !== this.activity && !this.queue.length) this.notice = '';
    this.activity = text;
    this.frameIndex = frame;
    this.elapsed = elapsed;
    this.draw();
  }
  onResize() {
    if (!this.active) return;
    // After reflow, recover the first footer row from its previous cell lengths.
    const width = Math.max(8, this.output.columns || 80);
    if (this.footerVisible) {
      const statusRows = Math.max(1, Math.ceil(cellWidth(this.lastStatus) / width));
      const cursorRows = Math.floor((this.lastCursorColumn || 0) / width);
      this.rawWrite(`\r\x1b[${statusRows + cursorRows}A\x1b[J`);
      this.footerVisible = false;
    }
    this.draw();
  }
  insert(text) {
    const left = this.buffer.slice(0, this.cursor).join('') + normalizeInput(text);
    this.buffer = splitInput(left + this.buffer.slice(this.cursor).join(''));
    this.cursor = splitInput(left).length;
    this.notice = '';
  }
  onKey(text, key = {}) {
    if (key.sequence === '\x1b[200~') { this.pasting = true; this.paste = ''; return; }
    if (key.sequence === '\x1b[201~') { this.pasting = false; this.insert(this.paste); this.draw(); return; }
    if (this.pasting) { this.paste += text || key.sequence || ''; return; }
    if (key.ctrl && key.name === 't') { this.onDetails?.(); return; }
    if (key.name === 'escape' || key.ctrl && key.name === 'c') { this.controller.abort(); return; }
    if (key.sequence === '\n' || key.ctrl && key.name === 'j' || (key.name === 'return' || key.name === 'enter') && (key.shift || key.meta)) { this.insert('\n'); this.draw(); return; }
    if (key.name === 'return' || key.name === 'enter') {
      const message = this.buffer.join('');
      if (message.trim()) {
        this.queue.push(message);
        this.onSubmit?.(message);
        this.notice = 'Queued';
        this.buffer = [];
        this.cursor = 0;
      }
    } else if (key.name === 'left') this.cursor = key.ctrl || key.meta ? wordBoundary(this.buffer, this.cursor, -1) : Math.max(0, this.cursor - 1);
    else if (key.name === 'right') this.cursor = key.ctrl || key.meta ? wordBoundary(this.buffer, this.cursor, 1) : Math.min(this.buffer.length, this.cursor + 1);
    else if (key.name === 'home' || key.ctrl && key.name === 'a') this.cursor = 0;
    else if (key.name === 'end' || key.ctrl && key.name === 'e') this.cursor = this.buffer.length;
    else if (key.ctrl && key.name === 'w' || key.meta && key.name === 'backspace') { const start = wordBoundary(this.buffer, this.cursor, -1); this.buffer.splice(start, this.cursor - start); this.cursor = start; }
    else if (key.name === 'backspace' && this.cursor) this.buffer.splice(--this.cursor, 1);
    else if (key.name === 'delete') this.buffer.splice(this.cursor, 1);
    else if (key.ctrl && key.name === 'u') { this.buffer.splice(0, this.cursor); this.cursor = 0; }
    else if (key.ctrl && key.name === 'k') this.buffer.splice(this.cursor);
    else if (text && !key.ctrl && !key.meta) this.insert(text);
    this.draw();
  }
  drain() {
    const messages = this.queue.splice(0);
    if (messages.length) { this.notice = ''; this.draw(); }
    return messages;
  }
  suspend() {
    if (!this.active) return;
    this.output.write = this.stdoutWrite;
    if (this.error !== this.output && this.error.isTTY) this.error.write = this.stderrWrite;
    this.input.removeListener('keypress', this.onKey);
    this.output.removeListener('resize', this.onResize);
    this.clear();
    if (this.pendingOutput) this.rawWrite(this.pendingOutput + '\n');
    this.pendingOutput = '';
    delete this.output.poliTurnInput;
    if (this.error !== this.output) delete this.error.poliTurnInput;
    this.rawWrite('\x1b[?2004l\x1b[0 q');
    this.input.setRawMode(this.previousRaw || false);
    this.input.pause();
    this.active = false;
  }
  close() { this.suspend(); }
  draft() { return this.buffer.join(''); }
}
