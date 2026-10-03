// Simple terminal markdown renderer with syntax highlighting
import { colors, style } from './theme.js';

export function renderMarkdown(markdown = '') {
  if (!markdown) return '';
  const lines = markdown.split('\n');
  const rendered = [];
  let inCodeBlock = false;
  let codeLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code blocks
    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = line.trim().slice(3).trim();
        rendered.push(`${colors.dim}┌── [${codeLang || 'code'}]${'─'.repeat(Math.max(2, 40 - (codeLang.length || 4)))}${colors.reset}`);
      } else {
        inCodeBlock = false;
        rendered.push(`${colors.dim}└──${'─'.repeat(42)}${colors.reset}`);
      }
      continue;
    }

    if (inCodeBlock) {
      // Syntax-tinted code line
      rendered.push(`${colors.dim}│${colors.reset} ${highlightCode(line, codeLang)}`);
      continue;
    }

    // Headers
    if (/^# {1,4}/.test(line)) {
      rendered.push(`\n${colors.bold}${colors.brightCyan}${line.replace(/^#+\s*/, '')}${colors.reset}`);
      continue;
    }
    if (/^## {1,4}/.test(line)) {
      rendered.push(`\n${colors.bold}${colors.cyan}${line.replace(/^#+\s*/, '')}${colors.reset}`);
      continue;
    }
    if (/^### {1,4}/.test(line)) {
      rendered.push(`\n${colors.bold}${colors.blue}${line.replace(/^#+\s*/, '')}${colors.reset}`);
      continue;
    }

    // Horizontal rule
    if (/^(\*\*\*|---|___)$/.test(line.trim())) {
      rendered.push(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);
      continue;
    }

    // Bullet points
    if (/^\s*[-*+]\s+/.test(line)) {
      const indent = line.match(/^\s*/)[0];
      const content = line.replace(/^\s*[-*+]\s+/, '');
      rendered.push(`${indent}${colors.cyan}•${colors.reset} ${formatInline(content)}`);
      continue;
    }

    // Numbered lists
    if (/^\s*\d+\.\s+/.test(line)) {
      const match = line.match(/^(\s*)(\d+\.)\s+(.*)$/);
      if (match) {
        rendered.push(`${match[1]}${colors.cyan}${match[2]}${colors.reset} ${formatInline(match[3])}`);
        continue;
      }
    }

    // Regular text with inline formatting
    rendered.push(formatInline(line));
  }

  return rendered.join('\n');
}

function formatInline(text) {
  if (!text) return '';
  return text
    // Bold **text**
    .replace(/\*\*(.*?)\*\*/g, `${colors.bold}$1${colors.reset}`)
    // Italic *text*
    .replace(/\*(.*?)\*/g, `${colors.italic}$1${colors.reset}`)
    // Inline code `code`
    .replace(/`([^`]+)`/g, `${colors.yellow}$1${colors.reset}`);
}

function highlightCode(line, lang = '') {
  // Lightweight keyword highlighting
  const keywords = ['const', 'let', 'var', 'function', 'async', 'await', 'return', 'import', 'export', 'from', 'if', 'else', 'for', 'while', 'class', 'extends', 'try', 'catch', 'throw', 'new', 'def', 'import', 'from', 'self', 'true', 'false', 'null'];
  let hl = line;

  // Strings
  hl = hl.replace(/(['"`])(.*?)\1/g, `${colors.green}$1$2$1${colors.reset}`);

  // Keywords
  for (const kw of keywords) {
    const regex = new RegExp(`\\b(${kw})\\b`, 'g');
    hl = hl.replace(regex, `${colors.magenta}$1${colors.reset}`);
  }

  // Comments
  hl = hl.replace(/(\/\/.*$|#.*$)/, `${colors.gray}$1${colors.reset}`);

  return hl;
}
