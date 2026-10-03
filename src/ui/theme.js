// UI Theme, ANSI styling, gradients, and terminal formatting utilities

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
  rgb: (r, g, b) => isTrueColorSupported ? `\x1b[38;2;${r};${g};${b}m` : (isColorSupported ? '\x1b[36m' : ''),
  bgRgb: (r, g, b) => isTrueColorSupported ? `\x1b[48;2;${r};${g};${b}m` : ''
};

export const style = {
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
    `${colors.bold}${colors.brightCyan}✦ POLI${colors.reset}${colors.bold}${colors.brightMagenta}-CODE${colors.reset}`,
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

export function banner(info = {}) {
  const {
    version = '1.0.0',
    model = 'gpt-6.1-sol',
    cwd = process.cwd(),
    proxy = 'poli-proxy',
    status = 'connected',
    branch = ''
  } = info;

  const width = Math.min(process.stdout.columns || 82, 82);
  const border = '─'.repeat(Math.max(0, width - 2));

  const workspaceDisplay = cwd.length > 40 ? '...' + cwd.slice(-37) : cwd;
  const branchDisplay = branch ? ` ${colors.dim}git:(${colors.cyan}${branch}${colors.dim})${colors.reset}` : '';

  const lines = [
    `${colors.brightCyan}╭${border}╮${colors.reset}`,
    `${colors.brightCyan}│${colors.reset}  ${style.poliBrand()} ${colors.dim}v${version}${colors.reset}  ${colors.dim}•  Agentic AI Coding Assistant powered by ${colors.brightMagenta}${proxy}${colors.reset}${' '.repeat(Math.max(0, width - 67 - proxy.length - version.length))}${colors.brightCyan}│${colors.reset}`,
    `${colors.brightCyan}│${colors.reset}  ${colors.dim}Model:${colors.reset} ${colors.brightGreen}${model}${colors.reset}  ${colors.dim}│${colors.reset}  ${colors.dim}Status:${colors.reset} ${colors.green}● ${status}${colors.reset}  ${colors.dim}│${colors.reset}  ${colors.dim}Type ${colors.yellow}/${colors.reset} ${colors.dim}or ${colors.yellow}/help${colors.reset} ${colors.dim}to show commands${colors.reset}${' '.repeat(Math.max(0, width - 69 - model.length - status.length))}${colors.brightCyan}│${colors.reset}`,
    `${colors.brightCyan}│${colors.reset}  ${colors.dim}Dir:${colors.reset}   ${colors.gray}${workspaceDisplay}${colors.reset}${branchDisplay}${' '.repeat(Math.max(0, width - 11 - workspaceDisplay.length - (branch ? branch.length + 8 : 0)))}${colors.brightCyan}│${colors.reset}`,
    `${colors.brightCyan}╰${border}╯${colors.reset}`,
  ];

  return lines.join('\n');
}

export function box(title, content, options = {}) {
  const width = Math.min(process.stdout.columns || 80, 80);
  const h = '─';
  const v = '│';

  const cleanTitle = title ? ` ${title} ` : '';
  const topBorder = `╭─${cleanTitle}${h.repeat(Math.max(0, width - cleanTitle.length - 3))}╮`;
  const bottomBorder = `╰${h.repeat(Math.max(0, width - 2))}╯`;

  const contentLines = content.split('\n');
  const innerLines = contentLines.map(line => `${v} ${line}`);

  const borderColor = options.borderColor || colors.cyan;

  return [
    borderColor + topBorder + colors.reset,
    ...innerLines,
    borderColor + bottomBorder + colors.reset
  ].join('\n');
}

export function toolCard({ name, args = {}, status = 'running', result = null, elapsedMs = null }) {
  const width = Math.min(process.stdout.columns || 80, 80);
  const h = '─';
  const v = '│';

  const statusBadge = status === 'success'
    ? `${colors.green}${symbols.check} success${colors.reset}`
    : (status === 'error'
      ? `${colors.red}${symbols.cross} error${colors.reset}`
      : `${colors.yellow}running${colors.reset}`);

  const timeStr = elapsedMs != null ? ` ${colors.dim}(${elapsedMs}ms)${colors.reset}` : '';
  const title = ` ${symbols.tool} ${name} `;
  const topBorder = `╭─${colors.bold}${colors.brightMagenta}${title}${colors.reset}${colors.dim}${h.repeat(Math.max(0, width - title.length - 3))}╮${colors.reset}`;
  const bottomBorder = `╰${colors.dim}${h.repeat(Math.max(0, width - 2))}╯${colors.reset}`;

  const argPairs = Object.entries(args)
    .map(([k, v]) => `  ${colors.dim}${k}:${colors.reset} ${typeof v === 'string' ? (v.length > 50 ? v.slice(0, 47) + '...' : v) : JSON.stringify(v)}`);

  return [
    topBorder,
    `${v}  ${colors.dim}Status:${colors.reset} ${statusBadge}${timeStr}`,
    ...argPairs.map(l => `${v}${l}`),
    bottomBorder
  ].join('\n');
}
