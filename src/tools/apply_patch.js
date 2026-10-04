import { runGit } from './git_process.js';
import { plainText } from '../ui/theme.js';

export const applyPatchDefinition = {
  type: 'function',
  function: {
    name: 'apply_patch',
    description: 'Apply a standard unified diff to workspace files. Validates all hunks before changing files; supports multiple files, additions, and deletions. Use a/file and b/file paths, not special Begin Patch syntax.',
    parameters: { type: 'object', properties: { patch: { type: 'string', description: 'Complete unified diff, including --- a/path, +++ b/path and @@ hunk headers.' } }, required: ['patch'] },
  },
};

export async function executeApplyPatch({ patch }, context = {}) {
  if (!patch.trim()) return { error: 'Patch must not be empty.' };
  if (Buffer.byteLength(patch) > 1000000) return { error: 'Patch exceeds 1 MB. Split it into smaller changes.' };
  if (!patch.endsWith('\n')) patch += '\n';
  const check = await runGit(['apply', '--check', '-'], context, patch);
  if (check.exit_code !== 0) return { error: 'Patch validation failed. Read the current files and correct the diff.', ...check };
  if (!context.autoApprove) {
    if (!context.promptManager) return { rejected: true, message: 'Patch approval required. Run interactively or select Full access.' };
    const confirmed = await context.promptManager.confirm('Apply these file changes?', false, { signal: context.signal, onCancel: context.cancelTurn, preview: plainText(patch) });
    if (!confirmed) return { rejected: true, message: 'User declined patch application.' };
  }
  if (context.signal?.aborted) return { rejected: true, message: 'Turn stopped.' };
  const result = await runGit(['apply', '-'], context, patch);
  if (result.exit_code !== 0) return { error: 'Patch could not be applied. No partial changes were applied.', ...result };
  return { success: true, ...result, diff_preview: patch.slice(0, 30000), truncated: patch.length > 30000 };
}
