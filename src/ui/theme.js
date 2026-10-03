// UI Theme, ANSI styling and terminal formatting utilities

const isColorSupported = !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR);

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
  box: {
    tl: '┌',
    tr: '┐',
    bl: '└',
    br: '┘',
    h: '─',
    v: '│',
  }
};

export function banner(info = {}) {
  const {
    version = '1.0.0',
    model = 'gpt-6.1-sol',
    cwd = process.cwd(),
    proxy = 'poli-proxy',
    status = 'connected'
  } = info;

  const title = ` POLI-CODE CLI v${version} `;
  const width = Math.min(process.stdout.columns || 80, 80);
  const border = '─'.repeat(Math.max(0, width - 2));

  const lines = [
    `${colors.brightCyan}┌${border}┐${colors.reset}`,
    `${colors.brightCyan}│${colors.reset}  ${colors.bold}${colors.brightCyan}✦ POLI-CODE${colors.reset} ${colors.dim}— Agentic AI Assistant powered by ${colors.brightMagenta}${proxy}${colors.reset}${' '.repeat(Math.max(0, width - 48 - proxy.length))}${colors.brightCyan}│${colors.reset}`,
    `${colors.brightCyan}│${colors.reset}  ${colors.dim}Model:${colors.reset} ${colors.green}${model}${colors.reset}  ${colors.dim}Status:${colors.reset} ${colors.brightGreen}● ${status}${colors.reset}  ${colors.dim}Type ${colors.yellow}/help${colors.reset} ${colors.dim}for commands${colors.reset}${' '.repeat(Math.max(0, width - 54 - model.length - status.length))}${colors.brightCyan}│${colors.reset}`,
    `${colors.brightCyan}│${colors.reset}  ${colors.dim}Workspace:${colors.reset} ${colors.gray}${cwd.length > 55 ? '...' + cwd.slice(-52) : cwd}${colors.reset}${' '.repeat(Math.max(0, width - 14 - (cwd.length > 55 ? 55 : cwd.length)))}${colors.brightCyan}│${colors.reset}`,
    `${colors.brightCyan}└${border}┘${colors.reset}`,
  ];

  return lines.join('\n');
}

export function box(title, content, options = {}) {
  const width = Math.min(process.stdout.columns || 80, 80);
  const h = '─';
  const v = '│';
  const pad = ' ';

  const cleanTitle = title ? ` ${title} ` : '';
  const topBorder = `┌─${cleanTitle}${h.repeat(Math.max(0, width - cleanTitle.length - 3))}┐`;
  const bottomBorder = `└${h.repeat(Math.max(0, width - 2))}┘`;

  const contentLines = content.split('\n');
  const innerLines = contentLines.map(line => `${v} ${line}`);

  return [
    colors.cyan + topBorder + colors.reset,
    ...innerLines,
    colors.cyan + bottomBorder + colors.reset
  ].join('\n');
}
