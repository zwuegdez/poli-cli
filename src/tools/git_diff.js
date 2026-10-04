import { runGit } from './git_process.js';

export const gitDiffDefinition = {
  type: 'function',
  function: {
    name: 'git_diff',
    description: 'Read tracked workspace changes as a unified diff without running external diff or text conversion programs. New untracked files are not included.',
    parameters: { type: 'object', properties: { staged: { type: 'boolean', description: 'Show staged changes instead of unstaged changes.' }, file_path: { type: 'string', description: 'Optional file to inspect.' } } },
  },
};

export async function executeGitDiff(args, context = {}) {
  const command = ['--no-pager', 'diff', '--no-ext-diff', '--no-textconv', '--color=never'];
  if (args.staged) command.push('--cached');
  command.push('--');
  if (args.file_path) command.push(args.file_path);
  const result = await runGit(command, context);
  return result.exit_code ? { ...result, error: result.stderr || 'Could not read Git diff.' } : { ...result, content: result.stdout || 'No tracked changes.' };
}
