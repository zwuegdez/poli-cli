// Tool: list_dir
import fs from 'node:fs';
import path from 'node:path';

export const listDirDefinition = {
  type: 'function',
  function: {
    name: 'list_dir',
    description: 'List contents of a directory in the workspace with file types and sizes.',
    parameters: {
      type: 'object',
      properties: {
        dir_path: {
          type: 'string',
          description: 'The directory path (relative to workspace or absolute). Defaults to current workspace directory.'
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to list recursively up to 2 levels deep (default: false)'
        }
      }
    }
  }
};

export async function executeListDir(args, context = {}) {
  const { workspaceDir = process.cwd() } = context;
  const targetDir = args.dir_path
    ? (path.isAbsolute(args.dir_path) ? args.dir_path : path.resolve(workspaceDir, args.dir_path))
    : workspaceDir;

  if (!fs.existsSync(targetDir)) {
    return { error: `Directory not found: ${args.dir_path || '.'}` };
  }

  const stat = fs.statSync(targetDir);
  if (!stat.isDirectory()) {
    return { error: `Path is a file, not a directory: ${args.dir_path}. Use view_file instead.` };
  }

  const maxItems = 150;
  const items = [];

  function readDirItems(dir, depth = 0) {
    if (items.length >= maxItems) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (items.length >= maxItems) break;
        if (e.name === 'node_modules' || e.name === '.git') continue;

        const fullPath = path.join(dir, e.name);
        const rel = path.relative(workspaceDir, fullPath);

        let size = null;
        if (e.isFile()) {
          try { size = fs.statSync(fullPath).size; } catch {}
        }

        items.push({
          name: e.name,
          path: rel || '.',
          type: e.isDirectory() ? 'directory' : 'file',
          size_bytes: size
        });

        if (args.recursive && e.isDirectory() && depth < 2) {
          readDirItems(fullPath, depth + 1);
        }
      }
    } catch (err) {
      // ignore
    }
  }

  readDirItems(targetDir, 0);

  return {
    dir_path: args.dir_path || '.',
    total_items: items.length,
    items
  };
}
