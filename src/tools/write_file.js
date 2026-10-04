// Tool: write_file
import fs from 'node:fs';
import path from 'node:path';
import { renderDiff } from '../ui/diff.js';
import { stripAnsi } from '../ui/theme.js';

export const writeFileDefinition = {
  type: 'function',
  function: {
    name: 'write_file',
    description: 'Create a new file or completely overwrite an existing file with the provided content.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The path of the file to write (relative to workspace or absolute)'
        },
        content: {
          type: 'string',
          description: 'The complete text content to write into the file'
        }
      },
      required: ['file_path', 'content']
    }
  }
};

export async function executeWriteFile(args, context = {}) {
  const { workspaceDir = process.cwd(), promptManager, autoApprove = false } = context;
  const filePath = path.isAbsolute(args.file_path)
    ? args.file_path
    : path.resolve(workspaceDir, args.file_path);

  const fileExists = fs.existsSync(filePath);
  let oldContent = '';
  if (fileExists) {
    try {
      oldContent = fs.readFileSync(filePath, 'utf8');
    } catch {
      // ignore
    }
  }

  // Interactive confirmation if not auto-approved
  if (!autoApprove && promptManager) {
    const diff = renderDiff(args.file_path, oldContent, args.content);
    const actionDesc = fileExists ? `Overwrite ${args.file_path}?` : `Create ${args.file_path}?`;
    const confirmed = await promptManager.confirm(actionDesc, true, { signal: context.signal, onCancel: context.cancelTurn, preview: diff });
    if (!confirmed) {
      return { rejected: true, message: `User declined creating/overwriting ${args.file_path}` };
    }
  }

  if (context.signal?.aborted) return { rejected: true, message: 'Turn stopped.' };
  try {
    if (fs.existsSync(filePath) !== fileExists || fileExists && fs.readFileSync(filePath, 'utf8') !== oldContent) return { error: 'File changed while awaiting approval. Read it again before overwriting.' };
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, args.content, 'utf8');
    return {
      success: true,
      file_path: args.file_path,
      created: !fileExists,
      ...((autoApprove || !promptManager) ? { diff_preview: stripAnsi(renderDiff(args.file_path, oldContent, args.content)) } : {}),
      bytes_written: Buffer.byteLength(args.content, 'utf8')
    };
  } catch (err) {
    return { error: `Failed to write file: ${err.message}` };
  }
}
