import { banner, chatMessage, toolCard, style } from '../src/ui/theme.js';
import { renderMarkdown } from '../src/ui/markdown.js';
import { renderDiff } from '../src/ui/diff.js';
import { PromptManager } from '../src/ui/prompt.js';

console.log('\n' + banner({
  cwd: '~/projects/poli-cli',
  branch: 'main',
  model: 'gpt-6.1-sol',
  mode: 'agent',
  autoApprove: false,
}));
console.log('\n' + chatMessage('user', 'Make the onboarding easier to understand.') + '\n');
console.log(style.poliBrand());
console.log(renderMarkdown('I’ll simplify the first-run experience, keep the next action visible, and verify the change.\n\n1. Clarify the welcome screen.\n2. Make the first step obvious.\n3. Run the full test suite.'));
console.log(toolCard({ name: 'view_file', args: { file_path: 'src/onboarding.js' }, status: 'success', result: { total_lines: 68 }, elapsedMs: 12 }));
console.log(toolCard({ name: 'edit_file', args: { file_path: 'src/onboarding.js' }, status: 'success', result: { replacements_made: 1 }, elapsedMs: 142 }));
console.log(renderDiff('src/onboarding.js', 'const title = "Welcome";\nshow(title);', 'const title = "Welcome to Poli";\nshow(title);'));
console.log(toolCard({ name: 'run_command', args: { command: 'npm test' }, status: 'success', result: { stdout: 'Tests passed\n64 tests\n0 failures\nReady to use', exit_code: 0 }, elapsedMs: 1200 }));
console.log('\n' + renderMarkdown('### Ready to try\n\nThe welcome screen now has one clear starting point.\n\n```sh\nnpm start\n```'));
if (process.stdin.isTTY) {
  console.log(style.dim('\nUI preview · Try /, arrow keys, Tab, or pasting text. Enter exits.'));
  await new PromptManager().promptUser({ tokens: 1240 });
}
