import { banner, chatMessage, toolCard, accent, style } from '../src/ui/theme.js';
import { renderMarkdown } from '../src/ui/markdown.js';
import { renderDiff } from '../src/ui/diff.js';
import { PromptManager } from '../src/ui/prompt.js';

console.log('\n' + banner({ cwd: '~/projects/poli-cli', branch: 'main' }));
console.log('\n' + chatMessage('user', 'Make the onboarding easier to understand.') + '\n');
console.log(style.bold('poli:'));
console.log(renderMarkdown('I’ll simplify the first-run experience and check the result.\n\n1. Clarify the welcome screen.\n2. Keep the next action visible.'));
console.log(toolCard({ name: 'view_file', args: { file_path: 'src/onboarding.js' }, status: 'success', result: { total_lines: 68 }, elapsedMs: 12 }));
console.log(toolCard({ name: 'edit_file', args: { file_path: 'src/onboarding.js' }, status: 'success', result: { replacements_made: 1 }, elapsedMs: 142 }));
console.log(renderDiff('src/onboarding.js', 'const title = "Welcome";\nshow(title);', 'const title = "What are we building?";\nshow(title);'));
console.log(toolCard({ name: 'run_command', args: { command: 'npm test' }, status: 'success', result: { stdout: 'Tests passed\n52 tests\n0 failures\n0 skipped\nReady to use\nDone', exit_code: 0 }, elapsedMs: 1200 }));
console.log('\n' + renderMarkdown('### Ready to try\n\nThe welcome screen now has one clear starting point.\n\n```sh\nnpm start\n```'));
if (process.stdin.isTTY) {
  console.log(style.dim('\nUI preview · Try /, arrow keys, Tab, or pasting text. Enter exits.'));
  await new PromptManager().promptUser({ tokens: 1240 });
}
