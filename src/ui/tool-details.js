import { section, style, plainText } from './theme.js';

export function toolDetails(messages, number = 1) {
  if (!Number.isSafeInteger(number) || number < 1) return style.dim('Use /details [number], where 1 is the latest tool result.');
  const tools = messages.filter(message => message.role === 'tool');
  const latest = tools.at(-number);
  if (!latest) return style.dim(tools.length ? `Only ${tools.length} tool results are available.` : 'No completed tool calls yet.');
  let result;
  try { result = JSON.parse(latest.content); } catch { result = { content: latest.content }; }
  const body = [result?.error, result?.message, result?.diff_preview, result?.content, result?.stdout, result?.stderr].filter(value => typeof value === 'string' && value.trim()).join('\n\n');
  return section(`Details · ${plainText(latest.name || 'tool')} · ${number}/${tools.length}`, plainText(body || JSON.stringify(result, null, 2) || 'No result.'));
}
