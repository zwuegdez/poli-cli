import { accent, colors, cellWidth, plainText, truncate } from './theme.js';

export function inputLine(text, width, { placeholder = false, working = false, frame = 0 } = {}) {
  const brightness = [120, 150, 190, 235, 190, 150][Math.floor(frame / 2) % 6];
  const prefix = (working ? colors.rgb(70, brightness, 100) + '● ' + colors.reset : '  ') + accent('› ');
  const body = (placeholder ? colors.rgb(125, 165, 133) : colors.rgb(190, 255, 174)) + truncate(plainText(text), Math.max(1, width - 5)) + colors.reset;
  return {prefix, body, row: prefix + body};
}

// All positions are relative to the editable row. No alternate screen, scroll
// region, or absolute screen coordinate: the transcript stays in scrollback.
export class ComposerView {
  constructor(output, write) { this.output = output; this.write = write; this.visible = false; }
  clear() {
    this.write('\r' + (this.visible && this.inputRow ? `\x1b[${this.inputRow}A` : '') + '\x1b[J');
    this.visible = false;
  }
  paint(rows, inputRow, cursorColumn, {prefix, body} = {}) {
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
