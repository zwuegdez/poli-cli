// Interactive Prompt and Readline Manager
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { colors, style, symbols } from './theme.js';

export const COMMAND_LIST = [
  { cmd: '/help', alias: ['/?', '/'], desc: 'Show all available commands & shortcuts', category: 'Commands' },
  { cmd: '/model', args: '[name]', desc: 'View or switch the active LLM model', category: 'Agent & Model' },
  { cmd: '/models', desc: 'Browse all available models from proxy', category: 'Agent & Model' },
  { cmd: '/tools', desc: 'Show all active agent tools and parameters', category: 'Agent & Model' },
  { cmd: '/diff', desc: 'Show uncommitted git diff in the workspace', category: 'Workspace & Git' },
  { cmd: '/run', args: '<command>', desc: 'Execute a shell command directly', category: 'Workspace & Git' },
  { cmd: '/status', desc: 'Show proxy connection, model, & token metrics', category: 'Session & Memory' },
  { cmd: '/tokens', desc: 'Show detailed token usage breakdown', category: 'Session & Memory' },
  { cmd: '/compact', desc: 'Summarize and compress context window', category: 'Session & Memory' },
  { cmd: '/history', desc: 'View recent conversation turn history', category: 'Session & Memory' },
  { cmd: '/clear', desc: 'Clear conversation context and start fresh', category: 'Session & Memory' },
  { cmd: '/config', args: '[get|set]', desc: 'View or modify CLI configuration', category: 'Settings' },
  { cmd: '/exit', alias: ['/quit', '/q'], desc: 'Exit Poli-code', category: 'Exit' }
];

export class PromptManager {
  constructor(options = {}) {
    this.history = [];
    this.historyFile = options.historyFile || null;
    this.loadHistory();
  }

  loadHistory() {
    if (!this.historyFile) return;
    try {
      if (fs.existsSync(this.historyFile)) {
        const lines = fs.readFileSync(this.historyFile, 'utf8')
          .split('\n')
          .map(l => l.trim())
          .filter(Boolean);
        this.history = lines.slice(-200);
      }
    } catch {}
  }

  saveHistory(line) {
    if (!line || !this.historyFile) return;
    try {
      const dir = path.dirname(this.historyFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(this.historyFile, line + '\n', 'utf8');
      this.history.push(line);
    } catch {}
  }

  completer(line) {
    if (line.startsWith('/')) {
      const slashCommands = COMMAND_LIST.map(c => c.cmd);
      const hits = slashCommands.filter(c => c.startsWith(line));

      if (line === '/') {
        // Show inline hints on terminal
        process.stdout.write('\n\x1b[36mCommands:\x1b[0m ' + slashCommands.slice(0, 10).join(', ') + '...\n');
        return [slashCommands, line];
      }

      return [hits.length ? hits : slashCommands, line];
    }

    // File path autocompletion
    const parts = line.split(' ');
    const lastPart = parts[parts.length - 1];
    if (lastPart.startsWith('./') || lastPart.startsWith('/') || lastPart.includes('/')) {
      try {
        const dir = path.dirname(lastPart) || '.';
        const base = path.basename(lastPart);
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          const hits = files.filter(f => f.startsWith(base)).map(f => path.join(dir, f));
          return [hits, lastPart];
        }
      } catch {}
    }

    return [[], line];
  }

  promptUser({ model = 'gpt-6.1-sol', tokens = 0 } = {}) {
    return new Promise((resolve) => {
      const tokenPill = tokens > 0 ? ` ${colors.dim}(${tokens.toLocaleString()} tok)${colors.reset}` : '';
      const promptString = `\n${colors.bold}${colors.brightCyan}✦ poli${colors.reset} ${colors.dim}[${colors.green}${model}${colors.dim}]${tokenPill} ${colors.brightCyan}›${colors.reset} `;

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        completer: (l) => this.completer(l),
        prompt: promptString
      });

      let buffer = '';

      rl.prompt();

      rl.on('line', (line) => {
        // Multiline support via trailing backslash
        if (line.endsWith('\\')) {
          buffer += line.slice(0, -1) + '\n';
          rl.setPrompt(`${colors.dim}  ... ›${colors.reset} `);
          rl.prompt();
          return;
        }

        const fullInput = (buffer + line).trim();
        buffer = '';
        if (fullInput && !fullInput.startsWith('/')) {
          this.saveHistory(fullInput);
        }
        rl.close();
        resolve(fullInput);
      });

      rl.on('SIGINT', () => {
        rl.close();
        resolve('/exit');
      });
    });
  }

  confirm(message, defaultYes = true) {
    return new Promise((resolve) => {
      const suffix = defaultYes ? ` [Y/n] ` : ` [y/N] `;
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question(`${colors.yellow}?${colors.reset} ${message}${colors.dim}${suffix}${colors.reset}`, (ans) => {
        rl.close();
        const trimmed = ans.trim().toLowerCase();
        if (!trimmed) {
          resolve(defaultYes);
        } else {
          resolve(trimmed === 'y' || trimmed === 'yes');
        }
      });
    });
  }
}
