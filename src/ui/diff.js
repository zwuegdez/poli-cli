// Compact, numbered change previews. Shared lines stay outside the changed block.
import { colors, style, plainText, truncate, cellWidth, wrapText, terminalWidth } from './theme.js';

export function changedLines(oldContent = '', newContent = '') {
  const before = oldContent ? oldContent.split('\n') : [];
  const after = newContent ? newContent.split('\n') : [];
  let start = 0, end = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  while (end < before.length - start && end < after.length - start && before[before.length - end - 1] === after[after.length - end - 1]) end++;
  return { before, after, start, end, removed: before.length - start - end, added: after.length - start - end };
}

export function renderDiff(filename, oldContent = '', newContent = '') {
  const { before, after, start, end, removed, added } = changedLines(oldContent, newContent);
  const width = terminalWidth();
  const out = wrapText(`  └ ${plainText(filename)} (+${added} −${removed})`, width).map(style.dim);
  if (!added && !removed) return [...out, style.dim('    No changes.')].join('\n');
  const indent = width < 14 ? '  ' : '    ';
  const numberWidth = Math.max(1, Math.min(width - indent.length - 4, 7, Math.max(3, String(Math.max(before.length, after.length)).length)));
  const contentWidth = Math.max(1, width - numberWidth - indent.length - 3);
  const contextBefore = Math.min(start, 2), contextAfter = Math.min(end, 2);
  const budget = 60 - contextBefore - contextAfter;
  let showRemoved = Math.min(removed, Math.floor(budget / 2));
  const showAdded = Math.min(added, budget - showRemoved);
  showRemoved = Math.min(removed, budget - showAdded);
  const rows = [];
  for (let i = start - contextBefore; i < start; i++) rows.push([i + 1, ' ', before[i]]);
  for (let i = start; i < start + showRemoved; i++) rows.push([i + 1, '−', before[i]]);
  for (let i = start; i < start + showAdded; i++) rows.push([i + 1, '+', after[i]]);
  for (let i = after.length - end; i < after.length - end + contextAfter; i++) rows.push([i + 1, ' ', after[i]]);
  let longLines = false;
  for (const [number, sign, text] of rows) {
    const color = sign === '+' ? colors.green : sign === '−' ? colors.red : colors.dim;
    const background = sign === '+' ? colors.bgRgb(17, 48, 32) : sign === '−' ? colors.bgRgb(54, 24, 27) : '';
    const safe = plainText(text).replace(/\n/g, ' ');
    longLines ||= cellWidth(safe) > contentWidth;
    const label = String(number).slice(-numberWidth).padStart(numberWidth);
    out.push(`${background}${color}${indent}${label} ${sign} ${truncate(safe, contentWidth)}${colors.reset}`);
  }
  const hidden = removed + added - showRemoved - showAdded;
  if (hidden || longLines) out.push(...wrapText(`    Preview shortened${hidden ? ' · ' + hidden + ' more changed lines' : ''} · /diff for tracked changes`, width).map(style.dim));
  return out.join('\n');
}
