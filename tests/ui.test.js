import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { box, banner, cellWidth, chatMessage, messageText, stripAnsi, toolCard, truncateMiddle, wrapText } from '../src/ui/theme.js';
import { renderMarkdown, MarkdownStream } from '../src/ui/markdown.js';
import { PromptManager, matchCommands } from '../src/ui/prompt.js';

for (const width of [20, 40, 80, 120]) {
  test(`output fits ${width}-column terminals, including ANSI and Unicode`, () => {
    const previous = process.stdout.columns;
    process.stdout.columns = width;
    try {
      const samples = [box('A long title for a small terminal', '\x1b[32m日本語 👩‍💻 café\x1b[0m\n' + 'x'.repeat(200)), banner({ cwd: '/a/very/long/workspace/path', branch: 'feature/long-name' }), toolCard({ name: 'run_command', args: { command: 'npm test\nsecond line' }, status: 'rejected' })];
      for (const sample of samples) {
        const lines = sample.split('\n');
        assert.ok(lines.every(line => cellWidth(line) <= Math.min(width, 96)), sample);
        if (sample === samples[0]) assert.ok(lines.slice(1, -1).every(line => stripAnsi(line).endsWith('│')));
        else assert.doesNotMatch(stripAnsi(sample), /[╭╮╰╯│]/);
      }
    } finally { process.stdout.columns = previous; }
  });
}
test('word wrapping keeps phrases together and avoids leading spaces on continuation lines', () => {
  const text = 'The quick brown fox jumps over a lazy dog.';
  const rows = wrapText(text, 16);
  assert.ok(rows.every(line => cellWidth(line) <= 16));
  assert.ok(rows.slice(1).every(line => !line.startsWith(' ')));
  assert.equal(rows.join(' ').replace(/\s+/g, ' ').trim(), text);
  const colored = wrapText('\x1b[32mThis is a long styled line\x1b[0m', 9);
  assert.equal(colored.map(stripAnsi).join(' ').replace(/\s+/g, ' ').trim(), 'This is a long styled line');
  const path = truncateMiddle('/really/long/workspace/project', 14);
  assert.ok(cellWidth(path) <= 14);
  assert.ok(path.startsWith('/really'));
  assert.ok(path.endsWith('roject'));
});

test('welcome banner adapts without losing workspace and session context', () => {
  const previous = process.stdout.columns;
  try {
    for (const width of [8, 20, 40, 80]) {
      process.stdout.columns = width;
      const output = banner({ cwd: '/home/dev/work/project', branch: 'feature/accessible-cli', model: 'custom-model', mode: 'chat' });
      assert.ok(output.split('\n').every(line => cellWidth(line) <= width), output);
      if (width === 20) {
        const plain = stripAnsi(output);
        assert.match(plain, /workspace|dir/);
        assert.match(plain, /chat/);
        assert.match(plain, /git/);
        assert.match(plain, /approvals/);
        assert.match(plain, /custom/);
      }
    }
  } finally { process.stdout.columns = previous; }
});

test('conversation styling reserves color for speaker cues, not every word', () => {
  assert.equal(stripAnsi(chatMessage('user', 'Fix the failing test')), '› Fix the failing test');
  assert.equal(messageText('A calm, readable answer.'), 'A calm, readable answer.');
  assert.match(stripAnsi(chatMessage('assistant', 'A clear answer.')), /✦ poli\n  A clear answer\./);
});

test('Markdown retains link text, ordered lists, tables, and fenced code', () => {
  const result = stripAnsi(renderMarkdown('## Plan\n\n1. First\n2. Second\n\n[Docs](https://example.test)\n\n| Name | Value |\n| --- | --- |\n| hello | 42 |\n\n```js\nconst x = 1;\n```'));
  assert.match(result, /1\. First/);
  assert.match(result, /2\. Second/);
  assert.match(result, /Docs \(https:\/\/example.test\)/);
  assert.match(result, /hello/);
  assert.match(result, /42/);
  assert.match(result, /const x = 1;/);
  assert.match(result, /code · js/);
  assert.match(result, /│ const x = 1;/);
  assert.doesNotMatch(result, /<td>|undefined|\[object Object\]/);
});
test('streaming across arbitrary chunks emits each complete block once', () => {
  let result = '';
  const stream = new MarkdownStream(text => { result += text; });
  const text = 'Hello **world**.\n\n```js\nconst x = 1;\n\nconsole.log(x);\n```\n\nFinal answer.';
  for (const char of text) stream.push(char);
  stream.end();
  const plain = stripAnsi(result);
  assert.equal(plain.match(/Hello/g).length, 1);
  assert.equal(plain.match(/const x/g).length, 1);
  assert.equal(plain.match(/Final answer/g).length, 1);
  assert.doesNotMatch(result, /\x1b\[\d+A|\x1b\[0J/);
});
test('history works without a persistence file', () => {
  const prompt = new PromptManager();
  prompt.saveHistory('first task');
  assert.deepEqual(prompt.history, ['first task']);
});
test('agent renders text once and reports failed shell commands', () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { PoliAgent } from './src/agent.js';
    const messages = [];
    let requests = 0;
    const session = { messages, workspaceDir: process.cwd(), addMessage: m => messages.push(m), recordUsage() {}, save() {} };
    const agent = new PoliAgent({ session, config: { model: 'test', autoApprove: true }, client: {
      async createChatCompletion({ onChunk }) {
        if (requests++ === 0) {
          onChunk({ type: 'content', text: 'Checking now.\\n\\n' });
          return { message: { content: 'Checking now.', tool_calls: [{ id: '1', function: { name: 'run_command', arguments: JSON.stringify({ command: 'exit 7' }) } }] } };
        }
        return { message: { content: 'Finished.' } };
      }
    } });
    await agent.runTurn('test');
  `], { encoding: 'utf8', cwd: new URL('..', import.meta.url), env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(child.status, 0, child.stderr);
  const result = stripAnsi(child.stdout);
  assert.equal(result.match(/Checking now/g).length, 1);
  assert.match(result, /Failed/);
  assert.match(result, /Exit 7/);
  assert.match(result, /Finished/);
});

test('exact slash commands take priority over longer prefixes', () => {
  assert.equal(matchCommands('/mode')[0].cmd, '/mode');
  assert.equal(matchCommands('/models')[0].cmd, '/models');
  assert.equal(matchCommands('/model')[0].cmd, '/models');
  assert.equal(matchCommands('/run echo hello').length, 0);
});
test('Markdown renders escaped punctuation as readable text', () => {
  assert.match(renderMarkdown("I don't know & can't guess."), /don't know & can't guess/);
});

test('internal tool blocks are filtered before highlighting even beside prose', () => {
  const reply = 'Looking at the project.\n\n```poli-tool\n{"name":"list_directory","arguments":{"path":"."}}\n```\n';
  const script = `
    import { MarkdownStream } from './src/ui/markdown.js';
    import { parseBridgeCalls } from './src/tool-bridge.js';
    const stream = new MarkdownStream(text => process.stdout.write(text), { transform: text => parseBridgeCalls(text).content });
    const reply = ${JSON.stringify(reply)};
    for (const chunk of reply) stream.push(chunk);
    stream.end();
  `;
  const env = { ...process.env, FORCE_COLOR: '1' }; delete env.NO_COLOR;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', cwd: new URL('..', import.meta.url), env });
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /Looking at the project/);
  assert.doesNotMatch(child.stdout, /poli-tool|list_directory|arguments/);
  assert.doesNotMatch(child.stderr, /Could not find the language/);
});

test('Markdown tables align columns and become labeled rows on narrow terminals', () => {
  const previous = process.stdout.columns;
  try {
    const table='| Name | Description |\n| --- | --- |\n| A | Short |\n| Longer | A detailed description |';
    process.stdout.columns=80;
    const wide=stripAnsi(renderMarkdown(table)).split('\n');
    assert.equal(wide[0].indexOf('Description'),wide[1].indexOf('Short'));
    process.stdout.columns=20;
    const narrow=stripAnsi(renderMarkdown(table));
    assert.match(narrow,/Name: A/);
    assert.match(narrow,/Description:/);
    assert.ok(narrow.split('\n').every(line=>cellWidth(line)<=20));
    assert.doesNotMatch(narrow,/\[object Object\]|"header"/);
  } finally { process.stdout.columns=previous; }
});
