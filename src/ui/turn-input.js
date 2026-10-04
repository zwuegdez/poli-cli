import readline from 'node:readline';
import { ComposerView, inputLine, composerFooter, workingStatus } from './composer-view.js';
import { inputViewport, normalizeInput, splitInput, wordBoundary } from './input-layout.js';

// Keep activity, input, and model hints together after the transcript. Use normal scrolling so
// every completed output line enters native scrollback; never set scroll margins.
export class TurnInput {
  constructor({ controller, onSubmit, onDetails, model = 'poli', mode = 'agent', input = process.stdin, output = process.stdout, error = process.stderr }) {
    Object.assign(this, { controller, onSubmit, onDetails, model, mode, input, output, error });
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
    this.view = new ComposerView(this.output, this.rawWrite);
    this.rawWrite('\x1b[?2004h\x1b[6 q');
    const wrap = (stream, original) => (chunk, encoding, callback) => {
      this.pendingOutput += Buffer.isBuffer(chunk) ? chunk.toString(typeof encoding === 'string' ? encoding : 'utf8') : String(chunk);
      if (this.flushOutput(stream, original)) this.draw();
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
  flushOutput(stream = this.output, write = this.stdoutWrite) {
    if (!this.view.renderable) return false;
    const end = this.pendingOutput.lastIndexOf('\n');
    if (end < 0) return false;
    this.clear();
    write.call(stream, this.pendingOutput.slice(0, end + 1));
    this.pendingOutput = this.pendingOutput.slice(end + 1);
    return true;
  }
  clear() { this.view.clear(); }
  draw() {
    if (!this.active || !this.view.renderable) return;
    const width = Math.max(8, this.output.columns || 80);
    const input = inputViewport(this.buffer, this.cursor, width - 4, this.viewStart);
    this.viewStart = input.start;
    const placeholder = 'Ask Poli to build, fix, or explain…';
    const line = inputLine(this.buffer.length ? input.text : placeholder, width, {placeholder: !this.buffer.length});
    const rows = [workingStatus(this.activity, this.elapsed, this.frameIndex || 0, width), '', line.row, ...composerFooter({model: this.model, mode: this.mode, width, working: true, queued: this.queue.length, lines: input.lines})];
    this.view.paint(rows, 2, 2 + input.cursorColumn, line);
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
    this.view.queueResize(() => {
      if (!this.active) return;
      this.flushOutput();
      this.draw();
    });
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
    this.view.dispose();
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
