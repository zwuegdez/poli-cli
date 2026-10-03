// Interactive Prompt and Readline Manager with Codex-style "/" command menu
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { colors, style, symbols } from './theme.js';

export const COMMAND_LIST = [
  { cmd: '/help', args: '', desc: 'Show all available slash commands and shortcuts', category: 'Commands' },
  { cmd: '/model', args: '[name]', desc: 'View current model or switch to a new model', category: 'Agent & Model' },
  { cmd: '/models', args: '', desc: 'Browse available frontier models from router', category: 'Agent & Model' },
  { cmd: '/tools', args: '', desc: 'Display all agent tools and capabilities', category: 'Agent & Model' },
  { cmd: '/diff', args: '', desc: 'View uncommitted git diff in the workspace', category: 'Workspace & Git' },
  { cmd: '/run', args: '<command>', desc: 'Execute a shell command directly', category: 'Workspace & Git' },
  { cmd: '/status', args: '', desc: 'View router endpoint health and session metrics', category: 'Session & Memory' },
  { cmd: '/tokens', args: '', desc: 'Show detailed token usage and cost metrics', category: 'Session & Memory' },
  { cmd: '/compact', args: '', desc: 'Compress conversation context to preserve tokens', category: 'Session & Memory' },
  { cmd: '/history', args: '', desc: 'Inspect recent conversation turn history', category: 'Session & Memory' },
  { cmd: '/clear', args: '', desc: 'Reset conversation context and start fresh', category: 'Session & Memory' },
  { cmd: '/config', args: '[get|set]', desc: 'View or modify local configuration', category: 'Settings' },
  { cmd: '/exit', args: '', desc: 'Exit Poli-code', category: 'Exit' }
];

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
      this.historyIndex = -1;
    } catch {}
  }

  promptUser({ model = 'gpt-6.1-sol', tokens = 0 } = {}) {
    if (!process.stdin.isTTY) {
      return this.promptFallback({ model, tokens });
    }
    return this.promptRawInteractive({ model, tokens });
  }

  promptFallback({ model = 'gpt-6.1-sol', tokens = 0 } = {}) {
    return new Promise((resolve) => {
      const tokenPill = tokens > 0 ? ` ${colors.dim}(${tokens.toLocaleString()} tok)${colors.reset}` : '';
      const promptString = `\n${colors.bold}${colors.brightCyan}✦ poli${colors.reset} ${colors.dim}[${colors.green}${model}${colors.dim}]${tokenPill} ${colors.brightCyan}›${colors.reset} `;

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: promptString
      });

      rl.prompt();

      rl.on('line', (line) => {
        rl.close();
        resolve(line.trim());
      });

      rl.on('SIGINT', () => {
        rl.close();
        resolve('/exit');
      });
    });
  }

  promptRawInteractive({ model = 'gpt-6.1-sol', tokens = 0 } = {}) {
    return new Promise((resolve) => {
      const stdin = process.stdin;
      const stdout = process.stdout;

      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');

      let buffer = '';
      let cursorPos = 0;
      let selectedCommandIndex = 0;
      let lastRenderedMenuLines = 0;

      const tokenPill = tokens > 0 ? ` ${colors.dim}(${tokens.toLocaleString()} tok)${colors.reset}` : '';
      const promptPrefix = `\n${colors.bold}${colors.brightCyan}✦ poli${colors.reset} ${colors.dim}[${colors.green}${model}${colors.dim}]${tokenPill} ${colors.brightCyan}›${colors.reset} `;

      stdout.write(promptPrefix);

      const cleanupAndResolve = (result) => {
        clearMenu();
        stdin.removeListener('data', onData);
        stdin.setRawMode(false);
        stdin.pause();
        stdout.write('\n');
        if (result && !result.startsWith('/')) {
          this.saveHistory(result);
        }
        resolve(result);
      };

      const clearMenu = () => {
        if (lastRenderedMenuLines > 0) {
          for (let i = 0; i < lastRenderedMenuLines; i++) {
            stdout.write('\x1b[1B\x1b[2K');
          }
          stdout.write(`\x1b[${lastRenderedMenuLines}A`);
          lastRenderedMenuLines = 0;
        }
      };

      const getMatchingCommands = () => {
        if (!buffer.startsWith('/')) return [];
        const query = buffer.trim().toLowerCase();
        if (query === '/') return COMMAND_LIST;
        return COMMAND_LIST.filter(c => c.cmd.toLowerCase().startsWith(query));
      };

      const render = () => {
        clearMenu();

        // Re-render current prompt line
        readline.cursorTo(stdout, 0);
        readline.clearLine(stdout, 0);
        
        let displayBuffer = buffer;
        let ghostText = '';
        
        // Ghost text and syntax highlighting
        const matches = getMatchingCommands();
        if (buffer.startsWith('/') && !buffer.includes(' ')) {
          if (matches.length > 0) {
            const selected = matches[selectedCommandIndex] || matches[0];
            if (selected.cmd.startsWith(buffer.toLowerCase())) {
              ghostText = selected.cmd.slice(buffer.length) + (selected.args ? ' ' + selected.args : '');
            }
          }
          // Highlight command in cyan
          displayBuffer = `${colors.brightCyan}${buffer}${colors.reset}`;
        } else if (buffer.startsWith('/')) {
          // Command + args
          const spaceIdx = buffer.indexOf(' ');
          displayBuffer = `${colors.brightCyan}${buffer.slice(0, spaceIdx)}${colors.reset}${colors.white}${buffer.slice(spaceIdx)}${colors.reset}`;
        }

        // Print prefix + colored buffer + ghost text
        const prefixPlainLength = 3; // " > " length approximation
        stdout.write(promptPrefix.replace(/^\n/, '') + displayBuffer + colors.dim + ghostText + colors.reset);
        
        // Reset cursor to the actual edit position
        readline.cursorTo(stdout, (promptPrefix.length - 1) + cursorPos);

        // If typing a slash command, render Codex-style interactive menu
        if (matches.length > 0 && buffer.startsWith('/') && !buffer.includes(' ')) {
          const menuLines = [];
          const width = Math.min(stdout.columns || 80, 80);
          const maxVisible = Math.min(matches.length, 6);

          if (selectedCommandIndex >= matches.length) selectedCommandIndex = 0;
          if (selectedCommandIndex < 0) selectedCommandIndex = matches.length - 1;

          // Float the menu up with a drop shadow aesthetic
          menuLines.push(`\n${colors.dim}╭─ ${colors.bold}${colors.brightCyan}Commands${colors.reset} ${colors.dim}(↑/↓ to navigate, Tab/Enter to select) ${'─'.repeat(Math.max(2, width - 48))}╮${colors.reset}`);

          for (let i = 0; i < maxVisible; i++) {
            const item = matches[i];
            const isSelected = i === selectedCommandIndex;
            const pointer = isSelected ? `${colors.brightGreen}➜ ${colors.bold}` : '   ';
            const cmdName = (item.cmd + (item.args ? ` ${item.args}` : '')).padEnd(24);
            const desc = item.desc.length > 40 ? item.desc.slice(0, 37) + '...' : item.desc;

            if (isSelected) {
              menuLines.push(`${colors.dim}│${colors.reset} ${pointer}${colors.brightCyan}${cmdName}${colors.reset} ${colors.brightWhite}${desc}${colors.reset}${' '.repeat(Math.max(1, width - 30 - desc.length))}${colors.dim}│${colors.reset}`);
            } else {
              menuLines.push(`${colors.dim}│${colors.reset} ${pointer}${colors.cyan}${cmdName}${colors.reset} ${colors.dim}${desc}${colors.reset}${' '.repeat(Math.max(1, width - 30 - desc.length))}${colors.dim}│${colors.reset}`);
            }
          }

          if (matches.length > maxVisible) {
            menuLines.push(`${colors.dim}│   ... and ${matches.length - maxVisible} more commands (type to filter)${' '.repeat(Math.max(1, width - 48))}${colors.dim}│${colors.reset}`);
          }

          menuLines.push(`${colors.dim}╰${'─'.repeat(Math.max(2, width - 2))}╯${colors.reset}`);

          stdout.write(menuLines.join('\n'));
          lastRenderedMenuLines = menuLines.length;

          // Return cursor back to prompt input line
          stdout.write(`\x1b[${lastRenderedMenuLines}A`);
          readline.cursorTo(stdout, (promptPrefix.length - 1) + cursorPos);
        }
      };

      const onData = (data) => {
        const key = data.toString();

        // Ctrl+C
        if (key === '\u0003') {
          cleanupAndResolve('/exit');
          return;
        }

        // Ctrl+D
        if (key === '\u0004') {
          if (!buffer) {
            cleanupAndResolve('/exit');
            return;
          }
        }

        // Enter key
        if (key === '\r' || key === '\n') {
          const matches = getMatchingCommands();
          // If in slash menu and user selected an entry with arrow keys or exact match:
          if (matches.length > 0 && buffer.startsWith('/') && !buffer.includes(' ')) {
            const selected = matches[selectedCommandIndex] || matches[0];
            if (selected) {
              if (selected.args) {
                // Keep command in prompt for user to supply args
                buffer = selected.cmd + ' ';
                cursorPos = buffer.length;
                render();
                return;
              } else {
                cleanupAndResolve(selected.cmd);
                return;
              }
            }
          }

          cleanupAndResolve(buffer.trim());
          return;
        }

        // Tab key (autocomplete)
        if (key === '\t') {
          const matches = getMatchingCommands();
          if (matches.length > 0) {
            const selected = matches[selectedCommandIndex] || matches[0];
            buffer = selected.cmd + (selected.args ? ' ' : '');
            cursorPos = buffer.length;
            render();
            return;
          }
        }

        // Escape key
        if (key === '\u001b') {
          clearMenu();
          return;
        }

        // Arrow keys
        if (key === '\u001b[A') { // Up
          const matches = getMatchingCommands();
          if (matches.length > 0) {
            selectedCommandIndex = (selectedCommandIndex - 1 + matches.length) % matches.length;
            render();
            return;
          } else if (this.history.length > 0) {
            // Navigate history
            if (this.historyIndex === -1) this.historyIndex = this.history.length - 1;
            else if (this.historyIndex > 0) this.historyIndex--;
            buffer = this.history[this.historyIndex] || '';
            cursorPos = buffer.length;
            render();
            return;
          }
        }

        if (key === '\u001b[B') { // Down
          const matches = getMatchingCommands();
          if (matches.length > 0) {
            selectedCommandIndex = (selectedCommandIndex + 1) % matches.length;
            render();
            return;
          } else if (this.history.length > 0 && this.historyIndex !== -1) {
            if (this.historyIndex < this.history.length - 1) {
              this.historyIndex++;
              buffer = this.history[this.historyIndex] || '';
            } else {
              this.historyIndex = -1;
              buffer = '';
            }
            cursorPos = buffer.length;
            render();
            return;
          }
        }

        if (key === '\u001b[D') { // Left
          if (cursorPos > 0) {
            cursorPos--;
            render();
          }
          return;
        }

        if (key === '\u001b[C') { // Right
          if (cursorPos < buffer.length) {
            cursorPos++;
            render();
          }
          return;
        }

        // Backspace
        if (key === '\u007f' || key === '\b') {
          if (cursorPos > 0) {
            buffer = buffer.slice(0, cursorPos - 1) + buffer.slice(cursorPos);
            cursorPos--;
            selectedCommandIndex = 0;
            render();
          }
          return;
        }

        // Printable characters
        if (key.length === 1 && key >= ' ') {
          buffer = buffer.slice(0, cursorPos) + key + buffer.slice(cursorPos);
          cursorPos++;
          selectedCommandIndex = 0;
          render();
          return;
        }
      };

      stdin.on('data', onData);
    });
  }

  confirm(message, defaultYes = true) {
    return new Promise((resolve) => {
      const suffix = defaultYes ? ` [Y/n] ` : ` [y/N] `;
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question(`\n${colors.yellow}?${colors.reset} ${message}${colors.dim}${suffix}${colors.reset}`, (ans) => {
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
