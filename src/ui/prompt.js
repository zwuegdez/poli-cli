// Interactive Prompt and Readline Manager
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { colors, symbols } from './theme.js';

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
    } catch {
      // ignore
    }
  }

  saveHistory(line) {
    if (!line || !this.historyFile) return;
    try {
      const dir = path.dirname(this.historyFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(this.historyFile, line + '\n', 'utf8');
      this.history.push(line);
    } catch {
      // ignore
    }
  }

  completer(line) {
    const slashCommands = [
      '/help', '/model', '/models', '/clear', '/compact',
      '/history', '/status', '/diff', '/run', '/exit', '/quit'
    ];

    if (line.startsWith('/')) {
      const hits = slashCommands.filter(c => c.startsWith(line));
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
      } catch {
        // ignore
      }
    }

    return [[], line];
  }

  ask(questionText) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        completer: (l) => this.completer(l)
      });

      rl.question(questionText, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  promptUser({ model = 'gpt-6.1-sol' } = {}) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        completer: (l) => this.completer(l),
        prompt: `\n${colors.brightCyan}✦ poli${colors.reset} ${colors.dim}(${model})${colors.reset} ${colors.brightCyan}›${colors.reset} `
      });

      let buffer = '';

      rl.prompt();

      rl.on('line', (line) => {
        // If line ends with backslash, allow multiline input
        if (line.endsWith('\\')) {
          buffer += line.slice(0, -1) + '\n';
          rl.setPrompt(`${colors.dim}  ... ›${colors.reset} `);
          rl.prompt();
          return;
        }

        const fullInput = (buffer + line).trim();
        buffer = '';
        if (fullInput) {
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
