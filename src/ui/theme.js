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
    colors.bold + gradientText('✦ POLI-CLI', [0, 255, 255], [255, 0, 255]),
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
    `${colors.dim}╭${border}╮${colors.reset}`,
    `${colors.dim}│${colors.reset}  ${style.poliBrand()} ${colors.dim}v${version}${colors.reset}  ${colors.dim}•  Agentic AI Coding Assistant powered by ${colors.brightMagenta}${proxy}${colors.reset}${' '.repeat(Math.max(0, width - 67 - proxy.length - version.length))}${colors.dim}│${colors.reset}`,
    `${colors.dim}│${colors.reset}  ${colors.dim}Model:${colors.reset} ${colors.brightGreen}${model}${colors.reset}  ${colors.dim}│${colors.reset}  ${colors.dim}Status:${colors.reset} ${colors.green}● ${status}${colors.reset}  ${colors.dim}│${colors.reset}  ${colors.dim}Type ${colors.yellow}/${colors.reset} ${colors.dim}or ${colors.yellow}/help${colors.reset} ${colors.dim}to show commands${colors.reset}${' '.repeat(Math.max(0, width - 69 - model.length - status.length))}${colors.dim}│${colors.reset}`,
    `${colors.dim}│${colors.reset}  ${colors.dim}Dir:${colors.reset}   ${colors.gray}${workspaceDisplay}${colors.reset}${branchDisplay}${' '.repeat(Math.max(0, width - 11 - workspaceDisplay.length - (branch ? branch.length + 8 : 0)))}${colors.dim}│${colors.reset}`,
    `${colors.dim}╰${border}╯${colors.reset}`,
  ];

  return lines.join('\n');
}

export function box(title, content, options = {}) {
  const width = Math.min(process.stdout.columns || 80, 80);
  const { borderColor = colors.dim, padding = 1, style = 'rounded' } = options;
  
  const chars = style === 'rounded' 
    ? { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' }
    : { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' };

  const cleanTitle = title ? ` ${title} ` : '';
  const titleFormatted = title ? `${colors.bold}${gradientText(title, [0,255,255], [100,100,255])}${colors.reset}` : '';
  const topBorderRaw = `${chars.tl}${chars.h}${cleanTitle}${chars.h.repeat(Math.max(0, width - cleanTitle.length - 3))}${chars.tr}`;
  
  // Need to place formatted title in the raw border
  const topBorder = title 
    ? `${borderColor}${chars.tl}${chars.h}${colors.reset}${titleFormatted}${borderColor}${chars.h.repeat(Math.max(0, width - cleanTitle.length - 3))}${chars.tr}${colors.reset}`
    : `${borderColor}${chars.tl}${chars.h.repeat(Math.max(0, width - 2))}${chars.tr}${colors.reset}`;

  const bottomBorder = `${borderColor}${chars.bl}${chars.h.repeat(Math.max(0, width - 2))}${chars.br}${colors.reset}`;

  const contentLines = content.split('\n');
  const innerLines = contentLines.map(line => {
    // strip ansi for length calculation? We'll just assume it fits or is pre-wrapped
    return `${borderColor}${chars.v}${colors.reset}${' '.repeat(padding)}${line}`;
  });

  const padLine = `${borderColor}${chars.v}${colors.reset}`;

  const finalLines = [topBorder];
  for(let i=0; i<padding; i++) finalLines.push(padLine);
  finalLines.push(...innerLines);
  for(let i=0; i<padding; i++) finalLines.push(padLine);
  finalLines.push(bottomBorder);

  return finalLines.join('\n');
}

export function toolCard({ name, args = {}, status = 'running', result = null, elapsedMs = null }) {
  const width = Math.min(process.stdout.columns || 80, 80);
  const h = '─';
  const v = '│';

  const statusBadge = status === 'success'
    ? `${colors.bgGreen}${colors.black} ${symbols.check} SUCCESS ${colors.reset}`
    : (status === 'error'
      ? `${colors.bgRed}${colors.white} ${symbols.cross} ERROR ${colors.reset}`
      : `${colors.bgYellow}${colors.black} ⚡ RUNNING ${colors.reset}`);

  const timeStr = elapsedMs != null ? ` ${colors.dim}(${elapsedMs}ms)${colors.reset}` : '';
  const title = ` ${symbols.tool} ${name} `;
  
  const bColor = status === 'running' ? colors.yellow : (status === 'error' ? colors.red : colors.dim);

  const topBorder = `${bColor}╭─${colors.reset}${colors.bold}${colors.brightMagenta}${title}${colors.reset}${bColor}${h.repeat(Math.max(0, width - title.length - 3))}╮${colors.reset}`;
  const bottomBorder = `${bColor}╰${h.repeat(Math.max(0, width - 2))}╯${colors.reset}`;

  const argPairs = Object.entries(args)
    .map(([k, v]) => `  ${colors.dim}${k}:${colors.reset} ${typeof v === 'string' ? (v.length > 50 ? v.slice(0, 47) + '...' : v) : JSON.stringify(v)}`);

  return [
    topBorder,
    `${bColor}${v}${colors.reset}  ${statusBadge}${timeStr}`,
    ...argPairs.map(l => `${bColor}${v}${colors.reset}${l}`),
    bottomBorder
  ].join('\n');
}
