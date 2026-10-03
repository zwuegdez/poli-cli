import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { box, banner, cellWidth, stripAnsi, toolCard } from '../src/ui/theme.js';
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
test('Markdown retains link text, ordered lists, tables, and fenced code', () => {
  const result = stripAnsi(renderMarkdown('## Plan\n\n1. First\n2. Second\n\n[Docs](https://example.test)\n\n| Name | Value |\n| --- | --- |\n| hello | 42 |\n\n```js\nconst x = 1;\n```'));
  assert.match(result, /1\. First/);
  assert.match(result, /2\. Second/);
  assert.match(result, /Docs \(https:\/\/example.test\)/);
  assert.match(result, /hello/);
  assert.match(result, /42/);
  assert.match(result, /const x = 1;/);
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
