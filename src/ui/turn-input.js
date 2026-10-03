import readline from 'node:readline';
import { accent, messageText, cellWidth, style, truncate, symbols } from './theme.js';

// Keep one editable line after the transcript. Use normal terminal scrolling so
// every completed output line enters native scrollback; never set scroll margins.
export class TurnInput {
  constructor({ controller, onSubmit, onDetails, input = process.stdin, output = process.stdout, error = process.stderr }) {
    Object.assign(this, { controller, onSubmit, onDetails, input, output, error });
    this.queue = [];
    this.buffer = [];
    this.cursor = 0;
    this.active = false;
    this.notice = '';
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
    this.rawWrite('\r\x1b[2K');
  }
  draw() {
    if (!this.active) return;
    const width = Math.max(8, this.output.columns || 80);
    const frame = symbols.spinner[this.frameIndex || 0];
    const longDraft = cellWidth(this.buffer.join('')) > width / 2;
    const status = this.activity ? (longDraft ? frame : `${frame} ${this.activity}${this.elapsed ? ' · ' + this.elapsed : ''}`) : (longDraft ? '' : 'Enter send · Esc stop');
    const statusWidth = this.notice ? 0 : Math.min(cellWidth(status), Math.max(0, Math.min(32, Math.floor(width / 2) - 2)));
    const available = Math.max(1, width - 5 - (statusWidth ? statusWidth + 2 : 0));
    let start = this.cursor, used = 0;
    while (start && used + cellWidth(this.buffer[start - 1]) < available) used += cellWidth(this.buffer[--start]);
    const value = truncate(this.buffer.slice(start).join(''), available);
    this.clear();
    const placeholder = this.notice || 'Type a follow-up…';
    this.rawWrite(`${accent(' > ')}${this.buffer.length ? messageText(value) : style.dim(truncate(placeholder, available))}`);
    if (statusWidth) {
      this.rawWrite(`\r\x1b[${width - statusWidth - 2}C${this.activity ? accent(truncate(status, statusWidth)) : style.dim(truncate(status, statusWidth))}`);
    }
    this.rawWrite(`\r\x1b[${3 + cellWidth(this.buffer.slice(start, this.cursor).join(''))}C`);
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
    // The terminal can reflow the old editable line onto extra rows. Only
    // clear from that final line down; the transcript above stays untouched.
    this.rawWrite('\r\x1b[J');
    this.draw();
  }
  insert(text) {
    const chars = Array.from(text.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').replace(/[\r\n]+/g, ' '));
    this.buffer.splice(this.cursor, 0, ...chars);
    this.cursor += chars.length;
    this.notice = '';
  }
  onKey(text, key = {}) {
    if (key.sequence === '\x1b[200~') { this.pasting = true; this.paste = ''; return; }
    if (key.sequence === '\x1b[201~') { this.pasting = false; this.insert(this.paste); this.draw(); return; }
    if (this.pasting) { this.paste += text || key.sequence || ''; return; }
    if (key.ctrl && key.name === 't') { this.onDetails?.(); return; }
    if (key.name === 'escape' || key.ctrl && key.name === 'c') { this.controller.abort(); return; }
    if (key.name === 'return' || key.name === 'enter') {
      const message = this.buffer.join('').trim();
      if (message) {
        this.queue.push(message);
        this.onSubmit?.(message);
        this.notice = `Queued (${this.queue.length}): ${message}`;
        this.buffer = [];
        this.cursor = 0;
      }
    } else if (key.name === 'left') this.cursor = Math.max(0, this.cursor - 1);
    else if (key.name === 'right') this.cursor = Math.min(this.buffer.length, this.cursor + 1);
    else if (key.name === 'home' || key.ctrl && key.name === 'a') this.cursor = 0;
    else if (key.name === 'end' || key.ctrl && key.name === 'e') this.cursor = this.buffer.length;
    else if (key.name === 'backspace' && this.cursor) this.buffer.splice(--this.cursor, 1);
    else if (key.name === 'delete') this.buffer.splice(this.cursor, 1);
    else if (key.ctrl && key.name === 'u') { this.buffer.splice(0, this.cursor); this.cursor = 0; }
    else if (key.ctrl && key.name === 'k') this.buffer.splice(this.cursor);
    else if (text && !key.ctrl && !key.meta) this.insert(text);
    this.draw();
  }
  drain() {
    const messages = this.queue.splice(0);
    if (messages.length) { this.notice = 'Processing your queued message…'; this.draw(); }
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
