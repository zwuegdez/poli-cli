import { accent, colors, style, cellWidth, plainText, truncate } from './theme.js';

export function inputBand(text, width, { placeholder = false } = {}) {
  const body = truncate(plainText(text), Math.max(1, width - 3));
  const foreground = placeholder ? colors.rgb(106, 151, 117) : colors.rgb(190, 255, 174);
  // Erase with the input background instead of writing a screenful of spaces.
  // Space padding becomes real wrapped lines when mobile clients reconnect.
  return colors.bgRgb(15, 35, 24) + colors.rgb(155, 255, 140) + colors.bold + '› ' + foreground + body + '\x1b[K' + colors.reset;
}

export function composerMeta({ model = 'poli', mode = 'agent', width, working = false, queued = 0, lines = 1 }) {
  const hint = working ? (queued ? `${queued} queued · Esc stop` : 'Enter queue · Esc stop') : 'Enter send · / commands';
  const context = `${plainText(model)} · ${mode === 'chat' ? 'chat' : 'agent'}${lines > 1 ? ` · ${lines} lines` : ''}`;
  const room = width - cellWidth(hint) - 4;
  if (room < 10) return style.dim(truncate(working && queued ? `${queued} queued · Esc stop` : context, width - 1));
  const left = truncate(context, room);
  return accent(left) + style.dim(' · ' + hint);
}

// All positions are relative to the editable row. No alternate screen, scroll
// region, or absolute screen coordinate: the transcript stays in scrollback.
export class ComposerView {
  constructor(output, write) { this.output = output; this.write = write; this.visible = false; }
  clear() {
    this.write('\r' + (this.visible && this.inputRow ? `\x1b[${this.inputRow}A` : '') + '\x1b[J');
    this.visible = false;
  }
  paint(rows, inputRow, cursorColumn) {
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
        const offset = row - inputRow;
        this.write('\r' + (offset ? `\x1b[${Math.abs(offset)}${offset < 0 ? 'A' : 'B'}` : '') + '\x1b[2K' + rows[row]);
        if (offset) this.write(`\x1b[${Math.abs(offset)}${offset < 0 ? 'B' : 'A'}`);
      }
    }
    this.rows = rows; this.inputRow = inputRow; this.cursorColumn = cursorColumn;
    this.write(`\r\x1b[${cursorColumn}C`);
  }
  resize() {
    if (!this.visible) return;
    const width = Math.max(8, this.output.columns || 80);
    // Terminal reflow shifts the cursor by added rows even below the caret.
    const extra = this.rows.reduce((sum, row) => sum + Math.max(0, Math.ceil(cellWidth(row) / width) - 1), 0);
    const up = this.inputRow + extra;
    this.write('\r' + (up ? `\x1b[${up}A` : '') + '\x1b[J');
    this.visible = false;
  }
}
