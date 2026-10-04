// Tool: view_file
import fs from 'node:fs';
import path from 'node:path';

export const viewFileDefinition = {
  type: 'function',
  function: {
    name: 'view_file',
    description: 'View the contents of a file in the workspace with line numbers and optional line slicing.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The path of the file to view (relative to workspace or absolute)'
        },
        start_line: {
          type: 'integer',
          description: 'Optional 1-indexed starting line number'
        },
        end_line: {
          type: 'integer',
          description: 'Optional 1-indexed ending line number'
        }
      },
      required: ['file_path']
    }
  }
};

export async function executeViewFile(args, context = {}) {
  const { workspaceDir = process.cwd() } = context;
  const filePath = path.isAbsolute(args.file_path)
    ? args.file_path
    : path.resolve(workspaceDir, args.file_path);

  if (!fs.existsSync(filePath)) {
    return { error: `File not found: ${args.file_path}` };
  }

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    return { error: `Path is a directory, not a file: ${args.file_path}. Use list_dir instead.` };
  }

  // Check file size (< 2MB)
  if (stat.size > 2 * 1024 * 1024) {
    return { error: `File is too large (${(stat.size / 1024 / 1024).toFixed(2)} MB) to view completely.` };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (args.start_line != null && args.start_line < 1 || args.end_line != null && args.end_line < 1) return { error: 'Line numbers must be positive and 1-indexed.' };
    const endsWithNewline = content.endsWith('\n');
    const lines = content ? content.split('\n') : [];
    if (endsWithNewline) lines.pop();
    const totalLines = lines.length;

    let start = args.start_line ? Math.max(1, args.start_line) : 1;
    let end = args.end_line ? Math.min(totalLines, args.end_line) : Math.min(totalLines, start + 299);
    if (args.end_line != null && args.end_line < start) return { error: 'end_line must be greater than or equal to start_line.' };

    if (start > totalLines) {
      return {
        file_path: args.file_path,
        total_lines: totalLines,
        ends_with_newline: endsWithNewline,
        content: `[File has only ${totalLines} lines]`
      };
    }

    const slicedLines = lines.slice(start - 1, end);
    const numbered = slicedLines.map((line, idx) => {
      const lineNum = start + idx;
      return `${String(lineNum).padStart(5, ' ')}: ${line}`;
    });

    const numberedContent = numbered.join('\n');
    const clipped = numberedContent.length > 30000;
    const isTruncated = end < totalLines || clipped;

    return {
      file_path: args.file_path,
      start_line: start,
      end_line: end,
      total_lines: totalLines,
      ends_with_newline: endsWithNewline,
      truncated: isTruncated,
      ...(clipped ? { line_output_truncated: true, message: 'File output exceeds 30000 characters. Request a smaller line range; a very long single line may need a shell command under suitable permissions.' } : {}),
      content: numberedContent.slice(0, 30000)
    };
  } catch (err) {
    return { error: `Failed to read file: ${err.message}` };
  }
}
