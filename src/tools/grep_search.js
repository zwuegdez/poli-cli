// Tool: grep_search
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const grepSearchDefinition = {
  type: 'function',
  function: {
    name: 'grep_search',
    description: 'Search files in the workspace for text or regex pattern matches.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The regex or string pattern to search for'
        },
        path_pattern: {
          type: 'string',
          description: 'Optional file/directory path or glob to restrict search'
        },
        case_sensitive: {
          type: 'boolean',
          description: 'Whether search is case-sensitive (default: false)'
        }
      },
      required: ['query']
    }
  }
};

export async function executeGrepSearch(args, context = {}) {
  const { workspaceDir = process.cwd() } = context;
  const { query, path_pattern, case_sensitive = false } = args;

  const targetPath = path_pattern
    ? (path.isAbsolute(path_pattern) ? path_pattern : path.resolve(workspaceDir, path_pattern))
    : workspaceDir;

  // Try ripgrep or standard grep
  const caseFlag = case_sensitive ? '' : '-i';
  try {
    const escapedQuery = query.replace(/(["'$`\\])/g, '\\$1');
    const cmd = `grep -rn ${caseFlag} --exclude-dir=node_modules --exclude-dir=.git --exclude="*.lock" --exclude="*.sqlite*" "${escapedQuery}" . | head -n 100`;

    const raw = execSync(cmd, {
      cwd: targetPath,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 2 * 1024 * 1024
    });

    const lines = raw.trim().split('\n').filter(Boolean);
    return {
      query,
      match_count: lines.length,
      matches: lines.slice(0, 80)
    };
  } catch (err) {
    // Exit code 1 means no match found
    if (err.status === 1) {
      return { query, match_count: 0, matches: [] };
    }
    return { error: `Grep failed: ${err.message}` };
  }
}
