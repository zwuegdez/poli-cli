import { section, style, plainText } from './theme.js';

export function toolDetails(messages) {
  const latest = messages.findLast(message => message.role === 'tool');
  if (!latest) return style.dim('No completed tool calls yet.');
  let result;
  try { result = JSON.parse(latest.content); } catch { result = { content: latest.content }; }
  const body = [result?.error, result?.message, result?.diff_preview, result?.content, result?.stdout, result?.stderr].filter(value => typeof value === 'string' && value.trim()).join('\n\n');
  return section(`Details · ${plainText(latest.name || 'tool')}`, plainText(body || JSON.stringify(result, null, 2) || 'No result.'));
}
