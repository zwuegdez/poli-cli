import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { COMING_SOON_MESSAGE } from '../src/release-status.js';

function execute(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {...options, stdio: ['pipe', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Paused launcher did not exit')); }, 5000);
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', code => { clearTimeout(timeout); resolve({code, stdout, stderr}); });
    child.stdin.end('hello\n');
  });
}

test('public launchers from a dependency-free checkout cannot start chat, log in, or change configuration', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poli-paused-checkout-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  for (const name of ['package.json', 'bin/poli.js', 'src/cli.js', 'src/index.js', 'src/release-status.js', 'scripts/preview-ui.js']) {
    const target = path.join(dir, name);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(new URL('../' + name, import.meta.url), target);
  }
  const home = path.join(dir, 'private-home');
  fs.mkdirSync(home);
  let requests = 0;
  const server = http.createServer((req, res) => { requests++; res.writeHead(503); res.end('Access should not be attempted'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
  fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify({baseUrl: endpoint, model: 'fake-model'}));
  fs.writeFileSync(path.join(home, 'credentials.json'), JSON.stringify({apiKey: 'fake-existing-key'}));
  fs.writeFileSync(path.join(home, 'history.txt'), 'existing history');
  const snapshot = () => fs.readdirSync(home).sort().map(name => [name, fs.readFileSync(path.join(home, name), 'utf8')]);
  const before = snapshot();
  const env = {...process.env, HOME: home, POLI_CODE_HOME: home, npm_config_cache: path.join(dir, 'npm-cache'), npm_config_update_notifier: 'false', POLI_API_KEY: 'fake-env-key', POLIAI_BASE_URL: endpoint, POLI_BASE_URL: endpoint};
  for (const args of [[], ['--chat', 'hello'], ['--agent', '--yes', 'run commands'], ['login'], ['models'], ['resume'], ['status'], ['config', 'set', 'model', 'changed'], ['--version'], ['--help'], ['--base-url', endpoint, 'hello']]) {
    const result = await execute(process.execPath, ['bin/poli.js', ...args], {cwd: dir, env});
    assert.equal(result.code, 0, JSON.stringify(result));
    assert.equal(result.stdout, COMING_SOON_MESSAGE);
    assert.equal(result.stderr, '');
  }
  for (const entry of ['src/cli.js', 'src/index.js']) {
    const result = await execute(process.execPath, ['--input-type=module', '-e', `import {runCli} from './${entry}'; await runCli(['node', 'poli', '--yes', 'hello']);`], {cwd: dir, env});
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, COMING_SOON_MESSAGE);
  }
  const preview = await execute(process.execPath, ['scripts/preview-ui.js'], {cwd: dir, env});
  assert.equal(preview.stdout, COMING_SOON_MESSAGE);
  assert.equal(preview.code, 0);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  for (const script of ['start', 'ui:preview']) {
    const result = await execute(npm, ['run', '--silent', script], {cwd: dir, env});
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, COMING_SOON_MESSAGE);
  }
  assert.equal(requests, 0, 'Paused launchers must not contact the endpoint');
  assert.deepEqual(snapshot(), before, 'Paused launchers must preserve user state');
  assert.equal(fs.existsSync(path.join(dir, 'node_modules')), false, 'Paused launchers must not install dependencies');
});
