import { spawn } from 'node:child_process';

// Run Git directly: arguments and patch contents never pass through a shell.
export function runGit(args, context = {}, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd: context.workspaceDir || process.cwd(),
      signal: context.signal,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat' },
    });
    let stdout = '', stderr = '', truncated = false;
    const collect = (chunk, error) => {
      const text = String(chunk);
      const previous = error ? stderr : stdout;
      if (previous.length + text.length > 30000) truncated = true;
      if (error) stderr = (previous + text).slice(0, 30000);
      else stdout = (previous + text).slice(0, 30000);
    };
    child.stdout.on('data', chunk => collect(chunk, false));
    child.stderr.on('data', chunk => collect(chunk, true));
    child.stdin.on('error', () => {});
    const timer = setTimeout(() => child.kill(), 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); resolve({ exit_code: code ?? 1, stdout, stderr, truncated }); });
    child.stdin.end(input);
  });
}
