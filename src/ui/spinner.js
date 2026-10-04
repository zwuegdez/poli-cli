// Enhanced Terminal Spinner with elapsed timer and clean recovery
import { colors, symbols, truncate, cellWidth } from './theme.js';

export class Spinner {
  constructor(text = '', stream = process.stderr) {
    this.text = text;
    this.stream = stream;
    this.frames = symbols.spinner;
    this.frameIndex = 0;
    this.timer = null;
    this.startTime = null;
    this.isSpinning = false;
  }

  start(text) {
    if (text) this.text = text;
    if (this.isSpinning) return this;
    this.startTime = Date.now();
    if (!this.stream.isTTY) return this;
    this.isSpinning = true;
    this.frameIndex = 0;
    this.startTime = Date.now();
    this.render();
    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this.render();
    }, 75);
    return this;
  }

  update(text) {
    this.text = text;
    if (this.isSpinning) this.render();
    return this;
  }

  getElapsed() {
    if (!this.startTime) return '';
    const sec = ((Date.now() - this.startTime) / 1000).toFixed(1);
    return `${colors.dim}[${sec}s]${colors.reset}`;
  }

  render() {
    if (!this.stream.isTTY || this.stream.poliApprovalActive) return;
    if (this.stream.poliTurnInput?.active) {
      this.stream.poliTurnInput.setActivity(this.text, this.frameIndex, ((Date.now() - this.startTime) / 1000).toFixed(1) + 's');
      return;
    }
    const frame = colors.brightCyan + this.frames[this.frameIndex] + colors.reset;
    const elapsed = this.getElapsed();
    const label = truncate(this.text, Math.max(1, (this.stream.columns || 80) - cellWidth(elapsed) - 5));
    this.stream.write(`\r\x1b[2K${frame} ${label} ${elapsed} `);
  }

  stop() {
    if (!this.isSpinning) return this;
    clearInterval(this.timer);
    this.timer = null;
    this.isSpinning = false;
    if (this.stream.isTTY && !this.stream.poliApprovalActive) {
      if (this.stream.poliTurnInput?.active) this.stream.poliTurnInput.setActivity('');
      else this.stream.write('\r\x1b[2K');
    }
    return this;
  }

  succeed(text = this.text) {
    const elapsed = this.getElapsed();
    this.stop();
    this.stream.write(`${colors.green}${symbols.check}${colors.reset} ${text} ${elapsed}\n`);
    return this;
  }

  fail(text = this.text) {
    const elapsed = this.getElapsed();
    this.stop();
    this.stream.write(`${colors.red}${symbols.cross}${colors.reset} ${text} ${elapsed}\n`);
    return this;
  }

  info(text = this.text) {
    this.stop();
    this.stream.write(`${colors.cyan}ℹ${colors.reset} ${text}\n`);
    return this;
  }
}
