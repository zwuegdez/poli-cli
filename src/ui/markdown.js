import { colors, style, cellWidth, messageText, plainText, terminalWidth, truncate, wrapText } from './theme.js';
import { marked } from 'marked';
import { highlight, supportsLanguage } from 'cli-highlight';

// marked 12 uses positional renderer arguments.
const renderer = new marked.Renderer();
function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (raw, value) => {
    if (value[0] === '#') {
      const point = value[1].toLowerCase() === 'x' ? parseInt(value.slice(2), 16) : parseInt(value.slice(1), 10);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : raw;
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[value.toLowerCase()] || raw;
  });
}
renderer.text = text => decodeEntities(text);
renderer.code = (code, language = '') => {
  let formatted = code;
  const syntax = language.split(/\s/)[0];
  if (colors.reset && syntax && supportsLanguage(syntax)) {
    try { formatted = highlight(code, { language: syntax, ignoreIllegals: true }); } catch {}
  }
  const width = terminalWidth();
  const contentWidth = Math.max(1, width - 4);
  const label = language ? `code · ${language}` : 'code';
  const lines = wrapText(formatted.replace(/\n$/, ''), contentWidth);
  return '\n' + style.dim(`  ${truncate(label, width - 2)}`) + '\n' + lines.map(line => `  ${style.dim('│')} ${line}`).join('\n') + '\n\n';
};
renderer.heading = (text, level) => `\n${style.bold(level < 3 ? style.brightCyan(text) : text)}\n\n`;
renderer.paragraph = text => text + '\n\n';
renderer.strong = text => style.bold(text);
renderer.em = text => style.italic(text);
renderer.codespan = text => style.yellow(text);
renderer.del = text => style.dim(text);
renderer.link = (href, title, text) => `${style.underline(text)}${href === text ? '' : style.dim(' (' + href + ')')}`;
renderer.image = (href, title, text) => `[${text || 'image'}] (${href})`;
renderer.br = () => '\n';
renderer.html = html => html.replace(/<[^>]*>/g, '');
renderer.hr = () => '\n';
renderer.blockquote = quote => quote.trim().split('\n').map(line => `${style.dim('>')} ${line}`).join('\n') + '\n\n';
renderer.list = (body, ordered, start = 1) => {
  let index = start;
  return body.split('\u0000').filter(Boolean).map(item => {
    const prefix = ordered ? `${index++}. ` : '• ';
    const lines = item.trim().split('\n');
    return '  ' + style.cyan(prefix) + lines.join('\n    ') + '\n';
  }).join('') + '\n';
};
renderer.listitem = text => text + '\u0000';
renderer.tablecell = (content, { header }) => JSON.stringify({ text: content, header }) + '\u0000';
renderer.tablerow = content => JSON.stringify(content.split('\u0000').filter(Boolean).map(cell => JSON.parse(cell))) + '\n';
renderer.table = (header, body) => {
  const rows = (header + body).trim().split('\n').map(row => JSON.parse(row));
  const headings = rows[0] || [];
  const width = terminalWidth();
  const widths = headings.map((_, index) => Math.max(...rows.map(row => cellWidth(row[index]?.text || ''))));
  if (widths.reduce((sum, size) => sum + size, 0) + Math.max(0, widths.length - 1) * 3 <= width) {
    return rows.map(row => row.map((cell, index) => {
      const text = cell.header ? style.bold(cell.text) : cell.text;
      return text + ' '.repeat(Math.max(0, widths[index] - cellWidth(cell.text)));
    }).join('   ').trimEnd()).join('\n') + '\n\n';
  }
  return rows.slice(1).map(row => row.map((cell, index) => {
    const label = plainText(headings[index]?.text || `Column ${index + 1}`);
    return wrapText(`${style.bold(label)}: ${cell.text}`, width).join('\n');
  }).join('\n')).join('\n\n') + '\n\n';
};

export function renderMarkdown(markdown = '') {
  if (!markdown) return '';
  markdown = plainText(markdown);
  try {
    const rendered = marked.parse(markdown, { renderer });
    return messageText(wrapText(rendered.trim(), terminalWidth()).join('\n'));
  } catch { return markdown; }
}

// Flush complete blocks during streaming. Never erase or duplicate scrollback.
export class MarkdownStream {
  constructor(write = text => process.stdout.write(text), { transform = text => text } = {}) {
    this.write = write;
    this.transform = transform;
    this.pending = '';
    this.block = '';
    this.fence = null;
  }
  push(text) {
    this.pending += text;
    let end;
    while ((end = this.pending.indexOf('\n')) >= 0) {
      const line = this.pending.slice(0, end + 1);
      this.pending = this.pending.slice(end + 1);
      this.block += line;
      const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (marker) {
        if (!this.fence) this.fence = marker[1];
        else if (marker[1][0] === this.fence[0] && marker[1].length >= this.fence.length) { this.fence = null; this.flush(); }
      } else if (!this.fence && !line.trim()) this.flush();
    }
  }
  flush() {
    const visible = this.transform(this.block);
    if (visible.trim()) this.write(renderMarkdown(visible) + '\n\n');
    this.block = '';
  }
  end() { this.block += this.pending; this.pending = ''; this.flush(); }
}
