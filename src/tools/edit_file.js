// Tool: edit_file (search and replace)
import fs from 'node:fs';
import path from 'node:path';
import { renderDiff } from '../ui/diff.js';
import { stripAnsi } from '../ui/theme.js';

export const editFileDefinition = {
  type: 'function',
  function: {
    name: 'edit_file',
    description: 'Replace an exact contiguous block of code (target_content) with new code (replacement_content) in a file.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The path of the file to edit'
        },
        target_content: {
          type: 'string',
          description: 'The exact string/block of code in the file to replace'
        },
        replacement_content: {
          type: 'string',
          description: 'The new replacement code'
        },
        allow_multiple: {
          type: 'boolean',
          description: 'If true, replace all occurrences. Defaults to false.'
        }
      },
      required: ['file_path', 'target_content', 'replacement_content']
    }
  }
};

export async function executeEditFile(args, context = {}) {
  const { workspaceDir = process.cwd(), promptManager, autoApprove = false } = context;
  const filePath = path.isAbsolute(args.file_path)
    ? args.file_path
    : path.resolve(workspaceDir, args.file_path);

  if (!fs.existsSync(filePath)) {
    return { error: `File not found: ${args.file_path}` };
  }

  let original = '';
  try {
    original = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { error: `Cannot read file: ${err.message}` };
  }

  const { target_content, replacement_content, allow_multiple = false } = args;

  if (!original.includes(target_content)) {
    return {
      error: `Could not find exact target_content in ${args.file_path}. Make sure the target text matches precisely including whitespace.`
    };
  }

  // Count occurrences
  const count = original.split(target_content).length - 1;
  if (count > 1 && !allow_multiple) {
    return {
      error: `target_content occurred ${count} times in ${args.file_path}. Provide more surrounding context lines to make it unique, or set allow_multiple: true.`
    };
  }

  const newContent = allow_multiple
    ? original.replaceAll(target_content, replacement_content)
    : original.replace(target_content, replacement_content);

  // Show diff & confirm if interactive
  if (!autoApprove && promptManager) {
    const diff = renderDiff(args.file_path, original, newContent);
    process.stdout.write(`\n${diff}\n\n`);
    const confirmed = await promptManager.confirm(`Apply changes to ${args.file_path}?`, true, { signal: context.signal, onCancel: context.cancelTurn });
    if (!confirmed) {
      return { rejected: true, message: `User rejected edits to ${args.file_path}` };
    }
  }

  if (context.signal?.aborted) return { rejected: true, message: 'Turn stopped.' };
  try {
    fs.writeFileSync(filePath, newContent, 'utf8');
    return {
      success: true,
      file_path: args.file_path,
      ...((autoApprove || !promptManager) ? { diff_preview: stripAnsi(renderDiff(args.file_path, original, newContent)) } : {}),
      replacements_made: allow_multiple ? count : 1
    };
  } catch (err) {
    return { error: `Failed to write edited file: ${err.message}` };
  }
}
