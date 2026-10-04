// UI Theme, ANSI styling, gradients, and terminal formatting utilities
import { stripVTControlCharacters } from 'node:util';

const forcedColor = process.env.FORCE_COLOR != null && process.env.FORCE_COLOR !== '0';
const isColorSupported = !('NO_COLOR' in process.env) && process.env.TERM !== 'dumb' && (process.stdout.isTTY || forcedColor);
const isTrueColorSupported = isColorSupported && (
  process.env.COLORTERM === 'truecolor' ||
  process.env.TERM?.includes('24bit') ||
  process.env.TERM?.includes('xterm-256color') ||
  process.platform !== 'win32'
);
const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export const colors = {
  reset: isColorSupported ? '\x1b[0m' : '',
  bold: isColorSupported ? '\x1b[1m' : '',
  dim: isColorSupported ? '\x1b[2m' : '',
  italic: isColorSupported ? '\x1b[3m' : '',
  underline: isColorSupported ? '\x1b[4m' : '',

  black: isColorSupported ? '\x1b[30m' : '',
  red: isColorSupported ? '\x1b[31m' : '',
  green: isColorSupported ? '\x1b[32m' : '',
  yellow: isColorSupported ? '\x1b[33m' : '',
  blue: isColorSupported ? '\x1b[34m' : '',
  magenta: isColorSupported ? '\x1b[35m' : '',
  cyan: isColorSupported ? '\x1b[36m' : '',
  white: isColorSupported ? '\x1b[37m' : '',
  gray: isColorSupported ? '\x1b[90m' : '',

  brightRed: isColorSupported ? '\x1b[91m' : '',
  brightGreen: isColorSupported ? '\x1b[92m' : '',
  brightYellow: isColorSupported ? '\x1b[93m' : '',
  brightBlue: isColorSupported ? '\x1b[94m' : '',
  brightMagenta: isColorSupported ? '\x1b[95m' : '',
  brightCyan: isColorSupported ? '\x1b[96m' : '',
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
  const glyphs = [...segments.segment(String(text))].map(({ segment }) => segment);
  const last = Math.max(1, glyphs.length - 1);
  const rStep = (colorEnd[0] - colorStart[0]) / last;
  const gStep = (colorEnd[1] - colorStart[1]) / last;
  const bStep = (colorEnd[2] - colorStart[2]) / last;
  let res = '';
  for (let i = 0; i < glyphs.length; i++) {
    const r = Math.round(colorStart[0] + rStep * i);
    const g = Math.round(colorStart[1] + gStep * i);
    const b = Math.round(colorStart[2] + bStep * i);
    res += `\x1b[38;2;${r};${g};${b}m${glyphs[i]}`;
  }
  return res + colors.reset;
}

export const style = {
  // Keep long-form content on the terminal's natural foreground. Color is a
  // signal for state and navigation, not a tint applied to every sentence.
  bold: (t) => `${colors.bold}${t}${colors.reset}`,
  dim: (t) => `${colors.dim}${t}${colors.reset}`,
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
  width = Math.max(1, Math.floor(width));
  const lines = [];
  for (const sourceLine of String(text).replace(/\t/g, '    ').split('\n')) {
    let current = [], cells = 0, lastSpace = -1;
    const emit = tokens => {
      let end = tokens.length;
      while (end && tokens[end - 1].space) end--;
      lines.push(tokens.slice(0, end).map(token => token.raw).join(''));
    };
    const widthOf = tokens => tokens.reduce((sum, token) => sum + token.width, 0);
    const lastWhitespace = tokens => {
      for (let i = tokens.length - 1; i >= 0; i--) if (tokens[i].space) return i;
      return -1;
    };
    const add = token => {
      if (token.width > width) token = { ...token, raw: '?', width: 1, space: false };
      if (token.space && cells + token.width > width && cells) {
        emit(current);
        current = [];
        cells = 0;
        lastSpace = -1;
        return;
      }
      while (cells + token.width > width && cells) {
        if (lastSpace >= 0) {
          let left = current.slice(0, lastSpace);
          while (left.length && left.at(-1).space) left = left.slice(0, -1);
          emit(left);
          current = current.slice(lastSpace + 1);
          cells = widthOf(current);
          lastSpace = lastWhitespace(current);
        } else {
          // A single unbroken token is wrapped by grapheme, never by UTF-16 unit.
          emit(current);
          current = [];
          cells = 0;
          lastSpace = -1;
        }
      }
      current.push(token);
      cells += token.width;
      if (token.space) lastSpace = current.length - 1;
    };

    for (const token of sourceLine.match(/\x1b\[[0-?]*[ -/]*[@-~]|[^\x1b]+/g) || []) {
      if (token.startsWith('\x1b')) add({ raw: token, width: 0, space: false });
      else for (const { segment } of segments.segment(token)) add({ raw: segment, width: cellWidth(segment), space: /^\s$/u.test(segment) });
    }
    lines.push(current.map(token => token.raw).join(''));
  }
  return lines;
}
export function truncate(text, width) {
  width = Math.max(0, Math.floor(width));
  if (!width) return '';
  const plain = plainText(text).replace(/[\r\n\t]/g, ' ');
  if (cellWidth(plain) <= width) return plain;
  if (width === 1) return '…';
  return wrapText(plain, width - 1)[0] + '…';
}

export function truncateMiddle(text, width) {
  width = Math.max(0, Math.floor(width));
  if (!width) return '';
  const plain = plainText(text).replace(/[\r\n\t]/g, ' ');
  if (cellWidth(plain) <= width) return plain;
  if (width === 1) return '…';

  const glyphs = [...segments.segment(plain)].map(({ segment }) => segment);
  const room = width - 1;
  const leftLimit = Math.ceil(room / 2);
  const left = [];
  let leftWidth = 0;
  while (glyphs.length && leftWidth + cellWidth(glyphs[0]) <= leftLimit) {
    const glyph = glyphs.shift();
    left.push(glyph);
    leftWidth += cellWidth(glyph);
  }
  const right = [];
  let rightWidth = 0;
  const rightLimit = room - leftWidth;
  while (glyphs.length && rightWidth + cellWidth(glyphs.at(-1)) <= rightLimit) {
    const glyph = glyphs.pop();
    right.unshift(glyph);
    rightWidth += cellWidth(glyph);
  }
  return left.join('') + '…' + right.join('');
}
export const accent = (text) => `${colors.rgb(155, 255, 140)}${text}${colors.reset}`;

// Model output should use the user's configured terminal foreground. Accent
// colors are reserved for prompts, labels, and syntax so long answers stay calm.
export function messageText(text) { return String(text); }

export function section(title, content, { width = terminalWidth() } = {}) {
  width = Math.max(4, Math.floor(width));
  const heading = `${accent('✦')} ${style.bold(truncate(title, Math.max(1, width - 2)))}`;
  const rule = style.dim('─'.repeat(Math.min(width, 44)));
  return [heading, rule, '', ...wrapText(content, width)].join('\n');
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

export function banner({ version = '1.3.4', model = 'gpt-6.1-sol', cwd = process.cwd(), branch = '', autoApprove = false, mode = 'agent' } = {}) {
  const width = terminalWidth();
  const rows = [];
  const brand = style.poliBrand();
  const versionLabel = `v${version}`;
  const brandWidth = cellWidth('✦ poli');
  const versionWidth = cellWidth(versionLabel);
  if (brandWidth + versionWidth + 2 <= width) {
    rows.push(`${brand}${' '.repeat(Math.max(2, width - brandWidth - versionWidth))}${style.dim(versionLabel)}`);
  } else {
    rows.push(...wrapText(brand, width));
    rows.push(...wrapText(style.dim(versionLabel), width));
  }

  const placeLabel = width >= 28 ? 'workspace ' : 'dir ';
  const place = truncateMiddle(cwd, Math.max(1, width - cellWidth(placeLabel)));
  rows.push(`${style.dim(placeLabel)}${style.bold(place)}`);

  if (branch) {
    const gitPrefix = 'git ';
    rows.push(`${style.dim(gitPrefix)}${style.white(truncateMiddle(branch, Math.max(1, width - cellWidth(gitPrefix))))}`);
  }

  const modeLabel = mode === 'chat' ? 'chat' : 'agent';
  if (width >= 13) {
    const modePrefix = `${modeLabel} · `;
    const modelText = truncateMiddle(model, Math.max(1, width - cellWidth(modePrefix)));
    rows.push(`${accent(modeLabel)}${style.dim(' · ')}${style.bold(modelText)}`);
  } else {
    rows.push(accent(truncate(modeLabel, width)));
    const modelPrefix = 'model ';
    rows.push(`${style.dim(modelPrefix)}${style.bold(truncateMiddle(model, Math.max(1, width - cellWidth(modelPrefix))))}`);
  }

  const approval = autoApprove ? (width >= 30 ? 'auto-approve' : 'auto') : (width >= 30 ? 'ask before changes' : 'ask');
  const approvalPrefix = width >= 20 ? 'approvals · ' : '';
  rows.push(`${style.dim(approvalPrefix)}${style.bold(approval)}`);

  rows.push('');
  rows.push(...wrapText('Type / for commands · /models to choose a model.', width).map(style.dim));
  return rows.join('\n');
}

export function chatMessage(role, text, { queued = false } = {}) {
  const width = terminalWidth();
  if (role === 'user') {
    const lines = wrapText(plainText(text), Math.max(1, width - 2));
    return lines.map((line, index) => `${index ? '  ' : accent('› ')}${messageText(line)}`).join('\n') + (queued ? '\n' + style.dim('  ↳ queued') : '');
  }
  const heading = style.poliBrand();
  return [...wrapText(heading, width), ...wrapText(text, Math.max(1, width - 2)).map(line => '  ' + messageText(line))].join('\n');
}

export function toolActivity(name, args = {}) {
  if (!args || typeof args !== 'object') args = {};
  const titles = { view_file: 'Reading', list_dir: 'Listing', file_search: 'Finding files for', grep_search: 'Searching', run_command: 'Running', edit_file: 'Editing', write_file: 'Writing' };
  const safeName = plainText(name || 'tool');
  const target = args.command || args.file_path || args.dir_path || args.query || args.pattern || '';
  return truncate(`${titles[safeName] || safeName}${target ? ' ' + plainText(target) : ''}`, Math.max(4, terminalWidth() - 2));
}

export function toolCard({ name, args = {}, status = 'running', result = null, elapsedMs = null }) {
  const width = terminalWidth();
  if (!args || typeof args !== 'object') args = {};
  const states = { success: ['✓', style.green], error: ['×', style.red], rejected: ['!', style.yellow], running: ['◌', accent] };
  const [icon, color] = states[status] || ['·', style.dim];
  const safeName = plainText(name || 'tool');
  const target = plainText(args.command || args.file_path || args.dir_path || args.query || args.pattern || '');
  const actions = {
    view_file: 'Read',
    list_dir: 'Listed',
    file_search: 'Found',
    grep_search: 'Searched',
    run_command: 'Ran',
    edit_file: 'Edited',
    write_file: result?.created ? 'Created' : 'Wrote',
  };
  const action = `${actions[safeName] || safeName}${target ? ' ' + target : ''}`;
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

  const headline = `${color(icon)} ${style.bold(action)}${metrics.length ? style.dim('  ·  ' + metrics.join(' · ')) : ''}`;
  const rows = wrapText(headline, width);
  if (result?.diff_preview) {
    for (const line of plainText(result.diff_preview).split('\n')) {
      const styled = /\s− /.test(line) ? style.red(line) : /\s\+ /.test(line) ? style.green(line) : style.dim(line);
      rows.push(...wrapText(styled, width));
    }
  }
  const detail = result?.error || (result?.rejected && result?.message);
  if (detail) rows.push(...wrapText(plainText(detail), Math.max(1, width - 4)).slice(0, 6).map(line => '    ' + color(line)));
  if (result?.timed_out) rows.push(...wrapText('    Command timed out.', width).map(style.yellow));
  if (result?.truncated) rows.push(...wrapText(`    ${name === 'view_file' ? 'More lines available.' : 'Output truncated · request a smaller range.'}`, width).map(style.dim));

  const output = result?.stderr || result?.stdout;
  if (output?.trim()) {
    const lines = plainText(output).trim().split('\n').flatMap(line => wrapText(line, Math.max(1, width - 4)));
    rows.push(...lines.slice(0, 4).map((line, index) => `  ${index === 0 ? '└ ' : '  '}${style.dim(line)}`));
    if (lines.length > 4) rows.push(...wrapText(`    + ${lines.length - 4} more lines · Ctrl+T or /details`, width).map(style.dim));
  }
  return rows.join('\n');
}
