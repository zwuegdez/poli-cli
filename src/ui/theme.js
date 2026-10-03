// UI Theme, ANSI styling, gradients, and terminal formatting utilities
import { stripVTControlCharacters } from 'node:util';

const isColorSupported = !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR);
const isTrueColorSupported = isColorSupported && (
  process.env.COLORTERM === 'truecolor' ||
  process.env.TERM?.includes('24bit') ||
  process.env.TERM?.includes('xterm-256color') ||
  process.platform !== 'win32'
);

export const colors = {
  reset: isColorSupported ? '\x1b[0m' : '',
  bold: isColorSupported ? '\x1b[1m' : '',
  dim: isColorSupported ? '\x1b[2m' : '',
  italic: isColorSupported ? '\x1b[3m' : '',
  underline: isColorSupported ? '\x1b[4m' : '',

  black: isColorSupported ? '\x1b[30m' : '',
  red: isColorSupported ? '\x1b[31m' : '',
  green: isColorSupported ? '\x1b[92m' : '',
  yellow: isColorSupported ? '\x1b[33m' : '',
  blue: isColorSupported ? '\x1b[34m' : '',
  magenta: isColorSupported ? '\x1b[35m' : '',
  cyan: isColorSupported ? '\x1b[92m' : '',
  white: isColorSupported ? '\x1b[37m' : '',
  gray: isColorSupported ? '\x1b[90m' : '',

  brightRed: isColorSupported ? '\x1b[91m' : '',
  brightGreen: isColorSupported ? '\x1b[92m' : '',
  brightYellow: isColorSupported ? '\x1b[93m' : '',
  brightBlue: isColorSupported ? '\x1b[94m' : '',
  brightMagenta: isColorSupported ? '\x1b[95m' : '',
  brightCyan: isColorSupported ? '\x1b[92m' : '',
  brightWhite: isColorSupported ? '\x1b[97m' : '',

  bgBlack: isColorSupported ? '\x1b[40m' : '',
  bgRed: isColorSupported ? '\x1b[41m' : '',
  bgGreen: isColorSupported ? '\x1b[42m' : '',
  bgYellow: isColorSupported ? '\x1b[43m' : '',
  bgBlue: isColorSupported ? '\x1b[44m' : '',
  bgMagenta: isColorSupported ? '\x1b[45m' : '',
  bgCyan: isColorSupported ? '\x1b[46m' : '',
  bgWhite: isColorSupported ? '\x1b[47m' : '',
  bgDarkGray: isColorSupported ? '\x1b[100m' : '',

  // RGB colors
  rgb: (r, g, b) => isTrueColorSupported ? `\x1b[38;2;${r};${g};${b}m` : (isColorSupported ? '\x1b[92m' : ''),
  bgRgb: (r, g, b) => isTrueColorSupported ? `\x1b[48;2;${r};${g};${b}m` : ''
};

export function gradientText(text, colorStart, colorEnd) {
  if (!isTrueColorSupported) return `${colors.brightCyan}${text}${colors.reset}`;
  const rStep = (colorEnd[0] - colorStart[0]) / Math.max(1, text.length - 1);
  const gStep = (colorEnd[1] - colorStart[1]) / Math.max(1, text.length - 1);
  const bStep = (colorEnd[2] - colorStart[2]) / Math.max(1, text.length - 1);
  let res = '';
  for (let i = 0; i < text.length; i++) {
    const r = Math.round(colorStart[0] + rStep * i);
    const g = Math.round(colorStart[1] + gStep * i);
    const b = Math.round(colorStart[2] + bStep * i);
    res += `\x1b[38;2;${r};${g};${b}m${text[i]}`;
  }
  return res + colors.reset;
}

export const style = {
  bold: (t) => `${colors.bold}${colors.brightGreen}${t}${colors.reset}`,
  dim: (t) => `${colors.dim}${colors.green}${t}${colors.reset}`,
  italic: (t) => `${colors.italic}${t}${colors.reset}`,
  underline: (t) => `${colors.underline}${t}${colors.reset}`,

  cyan: (t) => `${colors.cyan}${t}${colors.reset}`,
  green: (t) => `${colors.green}${t}${colors.reset}`,
  yellow: (t) => `${colors.yellow}${t}${colors.reset}`,
  red: (t) => `${colors.red}${t}${colors.reset}`,
  blue: (t) => `${colors.blue}${t}${colors.reset}`,
  magenta: (t) => `${colors.magenta}${t}${colors.reset}`,
  gray: (t) => `${colors.gray}${t}${colors.reset}`,
  white: (t) => `${colors.white}${t}${colors.reset}`,

  brightCyan: (t) => `${colors.brightCyan}${t}${colors.reset}`,
  brightGreen: (t) => `${colors.brightGreen}${t}${colors.reset}`,
  brightYellow: (t) => `${colors.brightYellow}${t}${colors.reset}`,
  brightRed: (t) => `${colors.brightRed}${t}${colors.reset}`,
  brightBlue: (t) => `${colors.brightBlue}${t}${colors.reset}`,
  brightMagenta: (t) => `${colors.brightMagenta}${t}${colors.reset}`,

  badge: (text, bg = colors.bgBlue, fg = colors.brightWhite) =>
    `${bg}${fg}${colors.bold} ${text} ${colors.reset}`,

  pill: (text, color = colors.cyan) =>
    `${colors.dim}[${colors.reset}${color}${text}${colors.reset}${colors.dim}]${colors.reset}`,

  poliBrand: () =>
    colors.bold + gradientText('✦ poli', [145, 255, 125], [185, 255, 150]),
};

export const symbols = {
  poli: '✦',
  bot: '🤖',
  user: '👤',
  tool: '⚡',
  check: '✔',
  cross: '✖',
  arrow: '➜',
  bullet: '•',
  spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  dots: '…',
  branch: '🌿',
  box: {
    tl: '╭',
    tr: '╮',
    bl: '╰',
    br: '╯',
    h: '─',
    v: '│',
    cross: '┼',
    tDown: '┬',
    tUp: '┴',
    tRight: '├',
    tLeft: '┤'
  }
};

// Measure terminal cells rather than JavaScript string length (ANSI, emoji, CJK).
const ansi = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export function stripAnsi(text) { return String(text).replace(ansi, ''); }
export function plainText(text) {
  return stripVTControlCharacters(String(text)).replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
}
export function cellWidth(text) {
  let width = 0;
  for (const { segment } of segments.segment(stripAnsi(text))) {
    const cp = segment.codePointAt(0);
    if (/^[\p{Mark}\p{Control}]+$/u.test(segment)) continue;
    width += /\p{Extended_Pictographic}/u.test(segment) || cp >= 0x1100 && (
      cp <= 0x115f || cp >= 0x2e80 && cp <= 0xa4cf || cp >= 0xac00 && cp <= 0xd7a3 ||
      cp >= 0xf900 && cp <= 0xfaff || cp >= 0xfe10 && cp <= 0xfe6f ||
      cp >= 0xff01 && cp <= 0xff60 || cp >= 0x20000) ? 2 : 1;
  }
  return width;
}
export function terminalWidth(max = 96) { return Math.max(8, Math.min(process.stdout.columns || 80, max)); }
export function wrapText(text, width) {
  width = Math.max(1, width);
  const lines = [];
  for (const line of String(text).replace(/\t/g, '    ').split('\n')) {
    let current = '', cells = 0;
    for (const token of line.match(/\x1b\[[0-?]*[ -/]*[@-~]|[^\x1b]+/g) || []) {
      if (token.startsWith('\x1b')) { current += token; continue; }
      for (const { segment } of segments.segment(token)) {
        const size = cellWidth(segment);
        if (cells + size > width && cells) { lines.push(current); current = ''; cells = 0; }
        current += size > width ? '?' : segment;
        cells += Math.min(size, width);
      }
    }
    lines.push(current);
  }
  return lines;
}
export function truncate(text, width) {
  const plain = plainText(text).replace(/[\r\n\t]/g, ' ');
  if (cellWidth(plain) <= width) return plain;
  return wrapText(plain, Math.max(1, width - 1))[0] + '…';
}
export const accent = (text) => `${colors.rgb(155, 255, 140)}${text}${colors.reset}`;
export function messageText(text) {
  if (!colors.reset) return String(text);
  return colors.green + String(text).replaceAll(colors.reset, colors.reset + colors.green) + colors.reset;
}

export function section(title, content, { width = terminalWidth() } = {}) {
  return [accent(style.bold(truncate(title, width))), '', ...wrapText(content, width)].join('\n');
}

export function box(title, content, options = {}) {
  const width = options.width || terminalWidth();
  const borderColor = options.borderColor || colors.gray;
  const padding = Math.min(options.padding ?? 1, Math.max(0, Math.floor((width - 4) / 2)));
  const inner = width - 2 - padding * 2;
  const label = title ? ` ${truncate(title, width - 6)} ` : '';
  const top = `${borderColor}╭─${colors.reset}${accent(label)}${borderColor}${'─'.repeat(Math.max(0, width - 3 - cellWidth(label)))}╮${colors.reset}`;
  const rows = wrapText(content, inner).map(line => `${borderColor}│${colors.reset}${' '.repeat(padding)}${line}${colors.reset}${' '.repeat(Math.max(0, inner - cellWidth(line)) + padding)}${borderColor}│${colors.reset}`);
  return [top, ...rows, `${borderColor}╰${'─'.repeat(width - 2)}╯${colors.reset}`].join('\n');
}

export function banner({ version = '1.0.0', model = 'gpt-6.1-sol', cwd = process.cwd(), branch = '', autoApprove = false, mode = 'agent' } = {}) {
  const width = terminalWidth();
  return [
    `${style.bold('poli-cli')} ${style.dim('v' + version)}`,
    style.dim(truncate(cwd + (branch ? '  git:' + branch : ''), width)),
    ...wrapText(`${mode === 'chat' ? 'chat' : 'agent'} · ${model} · approvals:${autoApprove ? 'auto' : 'ask'}`, width).map(style.dim),
    '',
    style.dim('Enter send · / commands · Ctrl+T tool details'),
  ].map(line => cellWidth(line) > width ? wrapText(line, width).join('\n') : line).join('\n');
}

export function chatMessage(role, text, { queued = false } = {}) {
  const width = terminalWidth();
  if (role === 'user') {
    const lines = wrapText(plainText(text), Math.max(1, width - 2));
    return lines.map((line, index) => `${index ? '  ' : accent('> ')}${messageText(line)}`).join('\n') + (queued ? '\n' + style.dim('  queued') : '');
  }
  const heading = style.bold('poli:');
  return [...wrapText(heading, width), ...wrapText(text, Math.max(1, width - 2)).map(line => '  ' + messageText(line))].join('\n');
}

export function toolActivity(name, args = {}) {
  if (!args || typeof args !== 'object') args = {};
  const titles = { view_file: 'Read', list_dir: 'List', file_search: 'Find files', grep_search: 'Search', run_command: 'Run', edit_file: 'Edit', write_file: 'Write' };
  const target = args.command || args.file_path || args.dir_path || args.query || args.pattern || '';
  return truncate(`${titles[name] || name}${target ? ' ' + target : ''}`, Math.max(4, terminalWidth() - 2));
}

export function toolCard({ name, args = {}, status = 'running', result = null, elapsedMs = null }) {
  const width = terminalWidth();
  const states = { success: ['[ok]', style.green], error: ['[err]', style.red], rejected: ['[skip]', style.yellow], running: ['[run]', accent] };
  const [icon, color] = states[status] || ['·', style.dim];
  const metrics = [];
  if (status === 'error') metrics.push('Failed');
  if (status === 'rejected') metrics.push('Declined');
  if (status === 'running') metrics.push('Running');
  if (result?.total_items != null) metrics.push(`${result.total_items} items`);
  if (result?.match_count != null) metrics.push(`${result.match_count} matches`);
  if (result?.total_found != null) metrics.push(`${result.total_found} files`);
  if (result?.total_lines != null) metrics.push(result.start_line && result.end_line ? `lines ${result.start_line}–${result.end_line}` : `${result.total_lines} lines`);
  if (result?.bytes_written != null) metrics.push(`${result.bytes_written.toLocaleString()} bytes`);
  if (result?.replacements_made != null) metrics.push(`${result.replacements_made} ${result.replacements_made === 1 ? 'change' : 'changes'}`);
  if (result?.exit_code) metrics.push(`Exit ${result.exit_code}`);
  if (elapsedMs != null) metrics.push(elapsedMs < 1000 ? `${elapsedMs}ms` : `${(elapsedMs / 1000).toFixed(1)}s`);
  const explored = ['view_file', 'list_dir', 'grep_search', 'file_search'].includes(name) && status === 'success';
  const activity = toolActivity(name, args).replace(/^Run /, 'Ran ').replace(/^Edit /, 'Edited ').replace(/^Write /, result?.created ? 'Created ' : 'Wrote ');
  const rows = wrapText(`${color(icon)} ${style.bold(explored ? 'Explored' : activity)}${style.dim(metrics.length ? ' · ' + metrics.join(' · ') : '')}`, width);
  if (explored) rows.push(...wrapText('  └ ' + toolActivity(name, args), width));
  if (result?.diff_preview) rows.push(...plainText(result.diff_preview).split('\n').map(line => /\s− /.test(line) ? style.red(line) : /\s\+ /.test(line) ? style.green(line) : style.dim(line)));
  const detail = result?.error || (result?.rejected && result?.message);
  if (detail) rows.push(...wrapText(plainText(detail), Math.max(1, width - 4)).slice(0, 6).map(line => '    ' + color(line)));
  if (result?.timed_out) rows.push('    ' + style.yellow('Command timed out.'));
  if (result?.truncated) rows.push(...wrapText(name === 'view_file' ? 'More lines available.' : 'Output truncated · request a smaller range.', Math.max(1, width - 4)).map(line => '    ' + style.dim(line)));
  const output = result?.stderr || result?.stdout;
  if (output?.trim()) {
    const lines = wrapText(plainText(output).trim(), Math.max(1, width - 4));
    rows.push(...lines.slice(0, 4).map((line, index) => '  ' + (index === 0 ? '└ ' : '  ') + style.dim(line)));
    if (lines.length > 4) rows.push(...wrapText(`    + ${lines.length - 4} more lines · Ctrl+T or /details`, Math.max(1, width)).map(style.dim));
  }
  return wrapText(rows.join('\n'), width).join('\n');
}
