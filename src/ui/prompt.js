// Interactive Prompt and Readline Manager with Codex-style "/" command menu
import readline from 'node:readline';
import { ComposerView, inputLine, composerFooter } from './composer-view.js';
import fs from 'node:fs';
import path from 'node:path';
import { inputViewport, normalizeInput, splitInput, wordBoundary } from './input-layout.js';
import { colors, style, accent, cellWidth, truncate, terminalWidth, plainText } from './theme.js';

export const COMMAND_LIST = [
  { cmd: '/help', args: '', desc: 'Show all available slash commands and shortcuts', category: 'Commands' },
  { cmd: '/models', args: '', desc: 'Choose a model with arrows or search', category: 'Agent & Model' },
  { cmd: '/permission', args: '', desc: 'Choose Read-only, Ask before changes, or Full access', alias: ['/permision', '/permissions'], category: 'Agent & Model' },
  { cmd: '/mode', args: '', desc: 'Choose Agent (workspace tools) or Chat', category: 'Agent & Model' },
  { cmd: '/retry', args: '', desc: 'Retry or continue the last task', category: 'Session & Memory' },
  { cmd: '/agents', args: '', desc: 'List subagents and their task status', category: 'Agent & Model' },
  { cmd: '/tools', args: '', desc: 'Display all agent tools and capabilities', category: 'Agent & Model' },
  { cmd: '/details', args: '[number]', desc: 'Inspect tool results · 1 is latest · Ctrl+T', category: 'Agent & Model' },
  { cmd: '/resume', args: '[id]', desc: 'Resume a saved conversation in this workspace', category: 'Session & Memory' },
  { cmd: '/diff', args: '', desc: 'View uncommitted git diff in the workspace', category: 'Workspace & Git' },
  { cmd: '/run', args: '<command>', desc: 'Execute a shell command directly', category: 'Workspace & Git' },
  { cmd: '/status', args: '', desc: 'View router endpoint health and session metrics', category: 'Session & Memory' },
  { cmd: '/tokens', args: '', desc: 'Show prompt, completion, and total token usage', category: 'Session & Memory' },
  { cmd: '/compact', args: '', desc: 'Compress conversation context to preserve tokens', category: 'Session & Memory' },
  { cmd: '/context', args: '[tokens|auto|compact]', desc: 'View context usage or set this model’s window', category: 'Session & Memory' },
  { cmd: '/history', args: '', desc: 'Inspect recent conversation turn history', category: 'Session & Memory' },
  { cmd: '/clear', args: '', desc: 'Reset conversation context and start fresh', category: 'Session & Memory' },
  { cmd: '/config', args: '[get|set]', desc: 'View or modify local configuration', category: 'Settings' },
  { cmd: '/exit', args: '', desc: 'Exit poli', category: 'Exit' }
];

export function matchCommands(text) {
  if (!/^\/[^\s]*$/.test(text)) return [];
  const query = text.toLowerCase();
  return COMMAND_LIST.filter(c => c.cmd.startsWith(query))
    .sort((a, b) => Number(b.cmd === query) - Number(a.cmd === query));
}

export class PromptManager {
  constructor(options = {}) {
    this.history = [];
    this.historyIndex = -1;
    this.historyFile = options.historyFile || null;
    this.loadHistory();
  }

  loadHistory() {
    if (!this.historyFile) return;
    try {
      if (fs.existsSync(this.historyFile)) {
        const lines = fs.readFileSync(this.historyFile, 'utf8')
          .split('\n')
          .map(line => {
            if (line.startsWith('@poli-v1 ')) {
              try { const text = JSON.parse(line.slice(9)); if (typeof text === 'string') return text; } catch {}
            }
            return line.trim();
          })
          .filter(Boolean);
        this.history = lines.slice(-200);
      }
    } catch {}
  }

  saveHistory(line) {
    this.historyIndex = -1;
    if (!line || this.history[this.history.length - 1] === line) return;
    this.history.push(line);
    this.history = this.history.slice(-200);
    if (!this.historyFile) return;
    try {
      const dir = path.dirname(this.historyFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(this.historyFile, '@poli-v1 ' + JSON.stringify(line) + '\n', 'utf8');

    } catch {}
  }

  promptUser({ model = 'gpt-6.1-sol', tokens = 0, mode = 'agent', context } = {}) {
    if (!process.stdin.isTTY) {
      return this.promptFallback({ model, tokens });
    }
    return this.promptRawInteractive({ model, tokens, mode, context });
  }

  promptFallback() {
    if (!this.fallback) {
      this.fallback = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
      this.fallbackLines = this.fallback[Symbol.asyncIterator]();
    }
    return this.fallbackLines.next().then(({ value, done }) => done ? '/exit' : value.trim());
  }

  promptRawInteractive({ model = 'gpt-6.1-sol', tokens = 0, mode = 'agent', context } = {}) {
    return new Promise((resolve) => {
      const stdin = process.stdin, stdout = process.stdout;
      const previousRaw = stdin.isRaw;
      readline.emitKeypressEvents(stdin);
      stdin.setRawMode(true);
      stdin.resume();
      let buffer = splitInput(this.draft || ''), cursor = buffer.length, selected = 0, dismissed = false;
      this.draft = '';
      let draft = [], pasting = false, paste = '', viewStart = 0;
      this.historyIndex = -1;
      const text = () => buffer.join('');
      const matches = () => dismissed ? [] : matchCommands(text());
      const view = new ComposerView(stdout, value => stdout.write(value));
      const render = () => {
        if (!view.renderable) return;
        const width = Math.max(8, stdout.columns || 80);
        const input = inputViewport(buffer, cursor, width - 4, viewStart);
        viewStart = input.start;
        const items = matches();
        selected = items.length ? (selected + items.length) % items.length : 0;
        const line = inputLine(buffer.length ? input.text : 'Ask Poli to build, fix, or explain…', width, {placeholder: !buffer.length});
        const rows = ['', ...composerFooter({model, mode, width, lines: input.lines, context})];
        if (items.length) {
          const count = Math.min(items.length, Math.max(1, Math.min(6, (stdout.rows || 24) - 8)));
          const offset = Math.max(0, Math.min(selected - count + 1, items.length - count));
          for (let i = offset; i < offset + count; i++) {
            const item = items[i];
            const label = `${i === selected ? '›' : ' '} ${item.cmd}${item.args ? ' ' + item.args : ''}`;
            const description = width >= 65 ? ' '.repeat(Math.max(1, 26 - cellWidth(label))) + item.desc : '';
            const row = truncate('  ' + label + description, width - 1);
            rows.push(i === selected ? accent(row) : style.dim(row));
          }
          rows.push(style.dim(truncate(`  ↑↓ select · Tab fill · Esc close · ${selected + 1}/${items.length}`, width - 1)));
        }
        rows.push(line.row);
        view.paint(rows, rows.length - 1, 2 + input.cursorColumn, line);
      };
      const onResize = () => view.queueResize(render);
      const finish = (value) => {
        view.dispose();
        view.clear();
        stdin.removeListener('keypress', onKey);
        stdout.removeListener('resize', onResize);
        stdin.removeListener('end', onEnd);
        stdout.write('\x1b[?2004l\x1b[0 q');
        stdin.setRawMode(previousRaw || false);
        stdin.pause();
        readline.cursorTo(stdout, 0);
        readline.clearLine(stdout, 0);
        if (value.startsWith('/')) stdout.write(style.dim(' › ' + truncate(value, terminalWidth() - 4)) + '\n');
        if (value && !value.startsWith('/')) this.saveHistory(value);
        resolve(value);
      };
      const insert = (value) => {
        const left = buffer.slice(0, cursor).join('') + normalizeInput(value);
        buffer = splitInput(left + buffer.slice(cursor).join(''));
        cursor = splitInput(left).length;
        selected = 0; dismissed = false;
      };
      const onEnd = () => finish('/exit');
      const onKey = (str, key = {}) => {
        if (view.handleCursorReport(key.sequence)) return;
        if (key.sequence === '\x1b[200~') { pasting = true; paste = ''; return; }
        if (key.sequence === '\x1b[201~') { pasting = false; insert(paste); render(); return; }
        if (pasting) { paste += str || key.sequence || ''; return; }
        if (key.ctrl && key.name === 't') { this.draft = text(); finish('/details'); return; }
        if (key.ctrl && key.name === 'c') { if (buffer.length) { buffer = []; cursor = 0; selected = 0; dismissed = false; this.historyIndex = -1; } else { finish('/exit'); return; } }
        else if (key.ctrl && key.name === 'd' && !buffer.length) { finish('/exit'); return; }
        else if (key.sequence === '\n' || key.ctrl && key.name === 'j' || (key.name === 'return' || key.name === 'enter') && (key.shift || key.meta)) insert('\n');
        else if (key.name === 'return' || key.name === 'enter') {
          const item = matches()[selected];
          if (!item && !text().trim()) return;
          if (item && item.args && item.args.startsWith('<')) { buffer = splitInput(item.cmd + ' '); cursor = buffer.length; }
          else { finish(item ? item.cmd : text()); return; }
        }
        else if (key.name === 'tab') {
          const item = matches()[selected];
          if (item) { buffer = splitInput(item.cmd + (item.args ? ' ' : '')); cursor = buffer.length; dismissed = true; }
        }
        else if (key.name === 'escape') dismissed = true;
        else if (key.name === 'up' || key.name === 'down') {
          if (matches().length) selected += key.name === 'up' ? -1 : 1;
          else {
            if (this.historyIndex === -1) draft = [...buffer];
            if (key.name === 'up') this.historyIndex = this.historyIndex === -1 ? this.history.length - 1 : Math.max(0, this.historyIndex - 1);
            else if (this.historyIndex !== -1) this.historyIndex = this.historyIndex + 1 >= this.history.length ? -1 : this.historyIndex + 1;
            buffer = this.historyIndex === -1 ? [...draft] : splitInput(this.history[this.historyIndex] || ''); cursor = buffer.length;
          }
        }
        else if (key.name === 'left') cursor = key.ctrl || key.meta ? wordBoundary(buffer, cursor, -1) : Math.max(0, cursor - 1);
        else if (key.name === 'right') cursor = key.ctrl || key.meta ? wordBoundary(buffer, cursor, 1) : Math.min(buffer.length, cursor + 1);
        else if (key.name === 'home' || key.ctrl && key.name === 'a') cursor = 0;
        else if (key.name === 'end' || key.ctrl && key.name === 'e') cursor = buffer.length;
        else if (key.ctrl && key.name === 'u') { buffer.splice(0, cursor); cursor = 0; }
        else if (key.ctrl && key.name === 'k') buffer.splice(cursor);
        else if (key.ctrl && key.name === 'w' || key.meta && key.name === 'backspace') { const start = wordBoundary(buffer, cursor, -1); buffer.splice(start, cursor - start); cursor = start; }
        else if (key.name === 'backspace') { if (cursor) buffer.splice(--cursor, 1); selected = 0; dismissed = false; }
        else if (key.name === 'delete') buffer.splice(cursor, 1);
        else if (str && !key.ctrl && !key.meta) insert(str.replace(/[\r\n]/g, ' '));
        render();
      };
      stdout.write('\x1b[?2004h\x1b[6 q');
      stdin.on('keypress', onKey);
      stdin.once('end', onEnd);
      stdout.on('resize', onResize);
      render();
    });
  }

  confirm(message, defaultYes = true, { signal, onCancel, preview } = {}) {
    return new Promise((resolve) => {
      if (signal?.aborted) { resolve(false); return; }
      if (!process.stdin.isTTY) { resolve(false); return; }
      if (preview) process.stdout.write('\n' + preview + '\n');
      const suffix = defaultYes ? ` [Y/n] ` : ` [y/N] `;
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const stop = () => rl.close();
      signal?.addEventListener('abort', stop, { once: true });
      rl.once('close', () => { signal?.removeEventListener('abort', stop); resolve(false); });
      rl.on('SIGINT', () => { onCancel?.(); rl.close(); });
      rl.question(`\n${colors.yellow}?${colors.reset} ${plainText(message)}${colors.dim}${suffix}${colors.reset}`, (ans) => {
        const trimmed = ans.trim().toLowerCase();
        resolve(trimmed ? trimmed === 'y' || trimmed === 'yes' : defaultYes);
        rl.close();
      });
    });
  }
}
