import readline from 'node:readline';
import { accent, section, style, truncate } from './theme.js';

export function filterChoices(choices, query) {
  const words = query.toLowerCase().trim().split(/\s+/);
  return choices.filter(c => words.every(word => `${c.label} ${c.description || ''}`.toLowerCase().includes(word)));
}

// A searchable, scrollable selector that restores the terminal on every exit.
export async function selectChoice({ title, choices, current, input = process.stdin, output = process.stdout }) {
  if (!choices.length) return null;
  if (!input.isTTY || !output.isTTY) return null;
  return new Promise(resolve => {
    let query = '', selected = Math.max(0, choices.findIndex(c => c.value === current)), lines = 0, settled = false;
    const previousRaw = input.isRaw;
    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    const clear = () => {
      if (!lines) return;
      readline.cursorTo(output, 0);
      if (lines > 1) readline.moveCursor(output, 0, -(lines - 1));
      readline.clearScreenDown(output);
    };
    const render = () => {
      clear();
      const matches = filterChoices(choices, query);
      selected = Math.max(0, Math.min(selected, matches.length - 1));
      const count = Math.max(1, Math.min(8, (output.rows || 24) - 8));
      const start = Math.max(0, Math.min(selected - count + 1, matches.length - count));
      const width = Math.max(4, Math.min(output.columns || 80, 96) - 2);
      const rows = [style.dim('/ ') + truncate(query || 'Type to search…', Math.max(1, width - 2)), ''];
      for (const [i, item] of matches.slice(start, start + count).entries()) {
        const active = start + i === selected;
        const label = `${active ? '>' : ' '} ${item.value === current ? '✓' : ' '} ${item.label}`;
        rows.push(active ? accent(truncate(label, width)) : style.dim(truncate(label, width)));
      }
      if (!matches.length) rows.push(style.dim(truncate('No matches · Backspace to change search', width)));
      if (matches[selected]?.description) rows.push('', style.dim(truncate(matches[selected].description, width)));
      rows.push('', style.dim(truncate(`↑↓ move · Enter select · Esc cancel · ${matches.length ? selected + 1 : 0}/${matches.length}`, width)));
      const frame = section(title, rows.join('\n'), { width });
      output.write(frame);
      lines = frame.split('\n').length;
    };
    const finish = value => {
      if (settled) return;
      settled = true;
      input.removeListener('keypress', onKey);
      input.removeListener('end', onEnd);
      output.removeListener('resize', render);
      clear();
      input.setRawMode(previousRaw || false);
      input.pause();
      resolve(value);
    };
    const onEnd = () => finish(null);
    const onKey = (text, key = {}) => {
      const matches = filterChoices(choices, query);
      if (key.name === 'escape' || key.ctrl && ['c', 'd'].includes(key.name)) return finish(null);
      if (key.name === 'return' || key.name === 'enter') { if (matches[selected]) finish(matches[selected].value); return; }
      if (key.name === 'up') selected = matches.length ? (selected - 1 + matches.length) % matches.length : 0;
      else if (key.name === 'down') selected = matches.length ? (selected + 1) % matches.length : 0;
      else if (key.name === 'pageup') selected = Math.max(0, selected - 8);
      else if (key.name === 'pagedown') selected = Math.min(matches.length - 1, selected + 8);
      else if (key.name === 'backspace') { query = Array.from(query).slice(0, -1).join(''); selected = 0; }
      else if (key.ctrl && key.name === 'u') { query = ''; selected = 0; }
      else if (text && !key.ctrl && !key.meta && !/[\x00-\x1f\x7f]/.test(text)) { query += text; selected = 0; }
      render();
    };
    input.on('keypress', onKey);
    input.once('end', onEnd);
    output.on('resize', render);
    output.write('\n');
    render();
  });
}

// While the agent works, Ctrl+C / Esc cancels the turn instead of killing the CLI.
export function watchCancellation(controller, input = process.stdin) {
  const onSignal = () => controller.abort();
  process.on('SIGINT', onSignal);
  const previousRaw = input.isRaw;
  const onKey = (_, key = {}) => { if (key.name === 'escape' || key.ctrl && key.name === 'c') controller.abort(); };
  if (input.isTTY) {
    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    input.on('keypress', onKey);
  }
  return () => {
    process.removeListener('SIGINT', onSignal);
    if (input.isTTY) {
      input.removeListener('keypress', onKey);
      input.setRawMode(previousRaw || false);
      input.pause();
    }
  };
}
