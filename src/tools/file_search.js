// Tool: file_search
import fs from 'node:fs';
import path from 'node:path';

export const fileSearchDefinition = {
  type: 'function',
  function: {
    name: 'file_search',
    description: 'Find files in the workspace matching a name pattern or extension.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Filename pattern, extension (e.g. "*.js", "config", "test")'
        },
        max_results: {
          type: 'integer',
          description: 'Maximum number of results to return (default: 50)'
        }
      },
      required: ['pattern']
    }
  }
};

export async function executeFileSearch(args, context = {}) {
  const { workspaceDir = process.cwd() } = context;
  const { pattern, max_results = 50 } = args;

  const results = [];
  const cleanPat = pattern.toLowerCase().replace(/^\*+/, '').replace(/\*+$/, '');

  function walk(currentDir) {
    if (results.length >= max_results) return;

    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= max_results) break;

      const name = entry.name;
      // Skip common hidden/huge dirs
      if (name === 'node_modules' || name === '.git' || name === '.next' || name === 'dist') continue;

      const fullPath = path.join(currentDir, name);
      const relPath = path.relative(workspaceDir, fullPath);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (cleanPat === '' || name.toLowerCase().includes(cleanPat)) {
          results.push(relPath);
        }
      }
    }
  }

  walk(workspaceDir);

  return {
    pattern,
    total_found: results.length,
    files: results
  };
}
