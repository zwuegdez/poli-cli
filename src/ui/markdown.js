import { colors, style, box } from './theme.js';
import { marked } from 'marked';
import { highlight } from 'cli-highlight';

const renderer = new marked.Renderer();

renderer.code = function(code, lang) {
  let highlighted;
  try {
    highlighted = highlight(code.text || code, { language: lang || 'txt', ignoreIllegals: true });
  } catch {
    highlighted = code.text || code;
  }
  
  const title = lang ? ` ${lang} ` : ' code ';
  const width = Math.min(process.stdout.columns || 80, 80);
  const border = colors.dim + '─'.repeat(Math.max(2, width - title.length - 10)) + colors.reset;
  
  const lines = highlighted.split('\n');
  const framed = lines.map(l => `${colors.dim}│${colors.reset} ${l}`).join('\n');
  
  return `\n${colors.dim}╭──${colors.reset}${colors.bold}${colors.cyan}${title}${colors.reset}${border}\n${framed}\n${colors.dim}╰${'─'.repeat(width - 2)}${colors.reset}\n`;
};

renderer.blockquote = function(quote) {
  return (quote.text || quote).trim().split('\n').map(l => `${colors.magenta}│${colors.reset} ${colors.italic}${colors.dim}${l}${colors.reset}`).join('\n') + '\n';
};

renderer.html = function(html) { return html.text || html; };

renderer.heading = function(heading) {
  const text = heading.text || heading;
  const level = heading.depth || 1;
  const prefix = '#'.repeat(level);
  let color = colors.brightCyan;
  if (level === 2) color = colors.cyan;
  if (level >= 3) color = colors.blue;
  
  return `\n${colors.bold}${color}${text}${colors.reset}\n`;
};

renderer.hr = function() {
  const width = Math.min(process.stdout.columns || 80, 80);
  return `\n${colors.dim}${'─'.repeat(width)}${colors.reset}\n`;
};

renderer.list = function(list) {
  return (list.body || list) + '\n';
};

renderer.listitem = function(item) {
  const text = (item.text || item).trim();
  // We can't know if it's ordered easily without context in older marked, but let's assume bullet
  return `  ${colors.cyan}•${colors.reset} ${text}\n`;
};

renderer.paragraph = function(p) {
  return (p.text || p) + '\n';
};

renderer.table = function(table) {
  return (table.header || table) + '\n' + (table.body || '') + '\n';
};

renderer.strong = function(strong) { return `${colors.bold}${strong.text || strong}${colors.reset}`; };
renderer.em = function(em) { return `${colors.italic}${em.text || em}${colors.reset}`; };
renderer.codespan = function(codespan) { return `${colors.yellow}${codespan.text || codespan}${colors.reset}`; };
renderer.del = function(del) { return `${colors.dim}${del.text || del}${colors.reset}`; };
renderer.link = function(link) { return `${colors.underline}${colors.blue}${link.text || link.href}${colors.reset}`; };

marked.setOptions({ renderer });

export function renderMarkdown(markdown = '') {
  if (!markdown) return '';
  try {
    return marked.parse(markdown).trim();
  } catch (err) {
    return markdown;
  }
}
