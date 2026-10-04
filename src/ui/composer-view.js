import { accent, colors, style, cellWidth, plainText, truncate } from './theme.js';

export function inputLine(text, width, { placeholder = false } = {}) {
  const prefix = accent('› ');
  const body = (placeholder ? colors.dim : '') + truncate(plainText(text), Math.max(1, width - 3)) + colors.reset;
  return {prefix, body, row: prefix + body};
}

export function composerFooter({model = 'poli', mode = 'agent', width, working = false, queued = 0, lines = 1}) {
  const context = `${plainText(model)} · ${mode === 'chat' ? 'chat' : 'agent'}`;
  const hints = working ? `${queued ? `${queued} queued · ` : ''}Enter queue · Esc stop` : 'Enter send · / commands · Ctrl+J newline';
  return [accent(truncate(context, width - 1)), style.dim(truncate(`${lines > 1 ? `${lines} lines · ` : ''}${hints}`, width - 1))];
}

export function workingStatus(activity, elapsed, frame, width) {
  const brightness = [120, 150, 190, 235, 190, 150][Math.floor(frame / 2) % 6];
  const dot = colors.rgb(70, brightness, 100) + '•' + colors.reset;
  const label = (activity || 'Working').replace(/…$/, '').split(' · Ctrl+C')[0];
  const seconds = Math.floor(Number.parseFloat(elapsed) || 0);
  return dot + ' ' + style.dim(truncate(`${label} (${seconds}s · Esc to stop)`, Math.max(1, width - 3)));
}

// Normal paints stay relative to the editable row. After resizing, a cursor
// report repairs client clamping without clearing the transcript or scrollback.
export class ComposerView {
  constructor(output, write) { this.output = output; this.write = write; this.visible = false; }
  get renderable() {
    // Mobile clients can briefly report a one-row or zero-sized window while
    // switching apps. Painting a multi-row composer then scrolls it into history.
    return !this.resizing && (this.output.columns ?? 80) >= 12 && (this.output.rows ?? 24) >= 8;
  }
  queueResize(redraw) {
    this.resizing = true;
    const generation = this.resizeGeneration = (this.resizeGeneration || 0) + 1;
    clearTimeout(this.resizeTimer);
    clearTimeout(this.cursorTimer);
    this.cursorReply = null;
    if (!this.resizePending) this.resizePending = new Promise(resolve => { this.resizeResolved = resolve; });
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null;
      const finish = position => {
        if (generation !== this.resizeGeneration) return;
        this.cursorReply = null;
        clearTimeout(this.cursorTimer);
        this.resizing = false;
        this.resize(position);
        try { redraw(); }
        finally {
          const resolve = this.resizeResolved;
          this.resizePending = null;
          this.resizeResolved = null;
          resolve?.();
        }
      };
      // Synchronize with the client after its resize burst before repainting.
      // The editable row stays last, so no footer can displace its cursor.
      this.cursorReply = finish;
      this.cursorTimer = setTimeout(() => finish(null), 150);
      this.write('\x1b[6n');
    }, 300);
  }
  handleCursorReport(sequence = '') {
    const match = /^\x1b\[(\d+);(\d+)R$/.exec(sequence);
    if (!match) return false;
    this.cursorReply?.({row: Number(match[1]), column: Number(match[2])});
    return true;
  }
  settled() { return this.resizePending || Promise.resolve(); }
  dispose() {
    this.resizeGeneration = (this.resizeGeneration || 0) + 1;
    clearTimeout(this.resizeTimer);
    clearTimeout(this.cursorTimer);
    this.cursorReply = null;
    this.resizeTimer = null;
    this.resizing = false;
    this.resizeResolved?.();
    this.resizePending = null;
    this.resizeResolved = null;
  }
  clear() {
    if (!this.renderable) return;
    this.write('\r' + (this.visible && this.inputRow ? `\x1b[${this.inputRow}A` : '') + '\x1b[J');
    this.visible = false;
  }
  paint(rows, inputRow, cursorColumn, {prefix, body} = {}) {
    if (!this.renderable) return;
    if (this.visible && (rows.length !== this.rows.length || inputRow !== this.inputRow)) this.clear();
    if (!this.visible) {
      // Reconnection and resizing can leave the physical cursor partway across
      // a row. Always start at column zero before creating the composer.
      this.write('\r' + rows.join('\r\n'));
      const up = rows.length - 1 - inputRow;
      if (up) this.write(`\x1b[${up}A`);
      this.visible = true;
    } else {
      for (let row = 0; row < rows.length; row++) {
        if (rows[row] === this.rows[row]) continue;
        if (rows.length === 1 && body && body === this.body) { this.write('\r' + prefix); continue; }
        const offset = row - inputRow;
        this.write('\r' + (offset ? `\x1b[${Math.abs(offset)}${offset < 0 ? 'A' : 'B'}` : '') + '\x1b[2K' + rows[row]);
        if (offset) this.write(`\x1b[${Math.abs(offset)}${offset < 0 ? 'B' : 'A'}`);
      }
    }
    this.body = body;
    this.rows = rows; this.inputRow = inputRow; this.cursorColumn = cursorColumn;
    this.write(`\r\x1b[${cursorColumn}C`);
  }
  resize(position) {
    if (!this.renderable || !this.visible) return;
    const width = Math.max(8, this.output.columns || 80);
    // Shell terminals leave the editable cursor row for the application to
    // redraw; only the surrounding rows contribute to automatic reflow.
    const extra = this.rows.reduce((sum, row, index) => sum + (index === this.inputRow ? 0 : Math.max(0, Math.ceil(cellWidth(row) / width) - 1)), 0);
    const up = this.inputRow + extra;
    if (position) {
      this.write(`\x1b[${Math.max(1, position.row - up)};1H\x1b[J`);
    } else {
      this.write('\r' + (up ? `\x1b[${up}A` : '') + '\x1b[J');
    }
    this.visible = false;
  }
}
