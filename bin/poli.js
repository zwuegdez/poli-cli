#!/usr/bin/env node

// Poli-code CLI entrypoint
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const entryFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(entryFile), '..');
const REPAIR_FLAG = 'POLI_DEP_REPAIR_ATTEMPTED';

// "Cannot find package 'x'" => missing/stale node_modules.
// "Cannot find module '/…'" (a relative file) is a real bug, not repairable here.
function missingPackageName(err) {
  if (!err || err.code !== 'ERR_MODULE_NOT_FOUND') return null;
  const match = /Cannot find package '([^']+)'/.exec(err.message || '');
  return match ? match[1] : null;
}

function installDependencies() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['install', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: rootDir,
    stdio: 'inherit'
  });
  return !result.error && result.status === 0;
}

function adviseAndExit(err) {
  if (err) process.stderr.write(`\npoli: dependencies are still broken: ${err.message}\n`);
  process.stderr.write(
    '\npoli could not repair its runtime dependencies automatically.\n\n' +
    'Fix it manually with:\n' +
    `  cd "${rootDir}" && npm install\n\n` +
    'The public installer is temporarily unavailable (Coming soon).\n\n'
  );
  process.exit(1);
}

function reexecSelf() {
  // Node caches failed module resolutions per process, so retrying the import
  // here would fail again — relaunch with identical arguments instead.
  const result = spawnSync(process.execPath, [...process.execArgv, entryFile, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, [REPAIR_FLAG]: '1' }
  });
  if (result.error) adviseAndExit(result.error);
  process.exit(result.status ?? 0);
}

async function loadCli() {
  try {
    return await import('../src/cli.js');
  } catch (err) {
    const pkg = missingPackageName(err);
    if (!pkg) throw err;
    // Guard against a re-exec loop: if a repair was already attempted in a
    // parent process and the dependency is still missing, stop and advise.
    if (process.env[REPAIR_FLAG]) adviseAndExit(err);
    process.stderr.write(
      `\npoli: missing runtime dependency '${pkg}' — running npm install in ${rootDir} ...\n`
    );
    if (!installDependencies()) adviseAndExit(null);
    reexecSelf();
  }
}

try {
  const { runCli } = await loadCli();
  const code = await runCli(process.argv);
  process.exit(code ?? 0);
} catch (err) {
  process.stderr.write(`\nFatal error: ${err?.stack || err}\n`);
  process.exit(1);
}
