// Tool: run_command
import { spawn } from 'node:child_process';
import path from 'node:path';
import { colors } from '../ui/theme.js';
import { watchCancellation } from '../ui/select.js';

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
          description: 'Maximum time to wait before terminating in seconds (default 120; use 0 for no timeout)'
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

  const timeoutMs = (args.timeout_seconds != null ? Math.max(0, args.timeout_seconds) : 120) * 1000;

  // Ask for confirmation unless auto-approved or safe command (like git status, ls)
  const isSafeRead = !/[;&|<>`$\r\n]/.test(args.command) && /^(ls|dir|cat|head|tail|git status|git diff|pwd|echo|which|grep|find)\b/.test(args.command.trim());
  if (!autoApprove && !isSafeRead && promptManager) {
    process.stdout.write(`\n${colors.dim}Command:${colors.reset} ${colors.yellow}${args.command}${colors.reset}\n`);
    process.stdout.write(`${colors.dim}Directory:${colors.reset} ${colors.gray}${targetCwd}${colors.reset}\n\n`);
    const confirmed = await promptManager.confirm(`Execute this shell command?`, true, { signal: context.signal, onCancel: context.cancelTurn });
    if (!confirmed) {
      return { rejected: true, message: `User declined command execution: ${args.command}` };
    }
  }

  if (context.signal?.aborted) return { rejected: true, message: 'Turn stopped.' };
  return new Promise((resolve) => {
    const cleanupInput = context.controller && !context.turnInput?.active ? watchCancellation(context.controller) : () => {};
    let stdout = '', stderr = '', truncated = false, timedOut = false, settled = false;
    let timeout, killTimer;
    const child = spawn(args.command, {
      cwd: targetCwd, shell: true, detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PAGER: 'cat' },
    });
    const stopProcess = () => {
      try { process.platform === 'win32' ? child.kill('SIGTERM') : process.kill(-child.pid, 'SIGTERM'); } catch {}
      if (!killTimer) {
        killTimer = setTimeout(() => {
          try { process.platform === 'win32' ? child.kill('SIGKILL') : process.kill(-child.pid, 'SIGKILL'); } catch {}
        }, 1000);
        killTimer.unref?.();
      }
    };
    const finish = (code, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(killTimer);
      cleanupInput();
      context.signal?.removeEventListener('abort', stopProcess);
      resolve({
        ...(context.signal?.aborted ? { rejected: true, message: 'Command stopped.' } : {}),
        ...(error ? { error: error.message } : {}),
        command: args.command, cwd: targetCwd, exit_code: code ?? 1,
        timed_out: timedOut, truncated, stdout, stderr,
      });
    };
    const collect = (data, isError) => {
      const text = String(data);
      const current = isError ? stderr : stdout;
      if (current.length + text.length > 30000) truncated = true;
      if (isError) stderr = (current + text).slice(0, 30000);
      else stdout = (current + text).slice(0, 30000);
      context.onOutput?.(text);
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => collect(data, false));
    child.stderr.on('data', data => collect(data, true));
    child.once('spawn', () => context.onStart?.());
    child.once('error', error => finish(1, error));
    child.once('close', code => finish(code));
    if (timeoutMs > 0) timeout = setTimeout(() => { timedOut = true; stopProcess(); }, timeoutMs);
    context.signal?.addEventListener('abort', stopProcess, { once: true });
    if (context.signal?.aborted) stopProcess();
  });
}
