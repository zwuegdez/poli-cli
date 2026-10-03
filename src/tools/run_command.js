// Tool: run_command
import { exec } from 'node:child_process';
import path from 'node:path';
import { colors, style } from '../ui/theme.js';

export const runCommandDefinition = {
  type: 'function',
  function: {
    name: 'run_command',
    description: 'Execute a shell command in the workspace directory (e.g., git, npm, tests, build).',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute'
        },
        cwd: {
          type: 'string',
          description: 'Optional working directory (relative to workspace or absolute)'
        },
        timeout_seconds: {
          type: 'integer',
          description: 'Maximum time to wait before terminating in seconds (default 30)'
        }
      },
      required: ['command']
    }
  }
};

export async function executeRunCommand(args, context = {}) {
  const { workspaceDir = process.cwd(), promptManager, autoApprove = false } = context;
  const targetCwd = args.cwd
    ? (path.isAbsolute(args.cwd) ? args.cwd : path.resolve(workspaceDir, args.cwd))
    : workspaceDir;

  const timeoutMs = (args.timeout_seconds ? Math.max(1, args.timeout_seconds) : 45) * 1000;

  // Ask for confirmation unless auto-approved or safe command (like git status, ls)
  const isSafeRead = /^(ls|dir|cat|head|tail|git status|git diff|pwd|echo|which|grep|find)\b/.test(args.command.trim());
  if (!autoApprove && !isSafeRead && promptManager) {
    process.stdout.write(`\n${colors.dim}Command:${colors.reset} ${colors.yellow}${args.command}${colors.reset}\n`);
    process.stdout.write(`${colors.dim}Directory:${colors.reset} ${colors.gray}${targetCwd}${colors.reset}\n\n`);
    const confirmed = await promptManager.confirm(`Execute this shell command?`, true);
    if (!confirmed) {
      return { rejected: true, message: `User declined command execution: ${args.command}` };
    }
  }

  return new Promise((resolve) => {
    const child = exec(
      args.command,
      {
        cwd: targetCwd,
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, PAGER: 'cat' }
      },
      (error, stdout, stderr) => {
        const exitCode = error ? (error.code ?? 1) : 0;
        const timedOut = error?.killed && error.signal === 'SIGTERM';

        const maxLen = 30000;
        let outStr = stdout || '';
        let errStr = stderr || '';
        let truncated = false;

        if (outStr.length > maxLen) {
          outStr = outStr.slice(0, maxLen) + `\n... [output truncated at ${maxLen} characters] ...`;
          truncated = true;
        }

        if (errStr.length > maxLen) {
          errStr = errStr.slice(0, maxLen) + `\n... [error output truncated at ${maxLen} characters] ...`;
          truncated = true;
        }

        resolve({
          command: args.command,
          cwd: targetCwd,
          exit_code: exitCode,
          timed_out: timedOut,
          truncated,
          stdout: outStr,
          stderr: errStr
        });
      }
    );
  });
}
