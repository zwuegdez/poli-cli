import { plainText, cellWidth } from './theme.js';

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export const splitInput = text => Array.from(graphemes.segment(String(text)), part => part.segment);
export const normalizeInput = text => plainText(text).replace(/\t/g, '    ');

// One screen row, with explicit newline and overflow markers. The original
// buffer keeps all newlines and indentation for the message sent to the model.
export function inputViewport(buffer, cursor, width, previousStart = 0) {
  width = Math.max(3, width);
  const displayed = buffer.map(char => char === '\n' ? '↵' : char);
  const sizes = displayed.map(cellWidth);
  let start = Math.max(0, Math.min(previousStart, cursor));
  let before = sizes.slice(start, cursor).reduce((sum, size) => sum + size, 0);
  while (start < cursor && before + (start ? 1 : 0) > width - 1) before -= sizes[start++];
  const prefix = start ? '‹' : '';
  let end = start, used = 0;
  const room = width - cellWidth(prefix);
  while (end < displayed.length && used + sizes[end] <= room) used += sizes[end++];
  const overflow = end < displayed.length;
  if (overflow) while (end > cursor && used > room - 1) used -= sizes[--end];
  return { text: prefix + displayed.slice(start, end).join('') + (overflow ? '›' : ''), cursorColumn: cellWidth(prefix) + before, start, lines: buffer.filter(char => char === '\n').length + 1 };
}

export function wordBoundary(buffer, cursor, direction) {
  const space = char => /\s/u.test(char || '');
  const word = char => /[\p{L}\p{N}_]/u.test(char || '');
  let position = cursor;
  if (direction < 0) {
    while (position && space(buffer[position - 1])) position--;
    const kind = word(buffer[position - 1]);
    while (position && !space(buffer[position - 1]) && word(buffer[position - 1]) === kind) position--;
  } else {
    const kind = word(buffer[position]);
    while (position < buffer.length && !space(buffer[position]) && word(buffer[position]) === kind) position++;
    while (position < buffer.length && space(buffer[position])) position++;
  }
  return position;
}
