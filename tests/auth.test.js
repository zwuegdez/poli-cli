import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'poli-auth-test-'));
  t.after(() => fs.rmSync(home, {recursive: true, force: true}));
  const env = {...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), POLI_CODE_HOME: path.join(home, 'poli'), NO_COLOR: '1'};
  delete env.POLIAI_API_KEY;
  delete env.POLI_API_KEY;
  return {home, env};
}
function evaluate(env, source) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: new URL('..', import.meta.url), env, encoding: 'utf8', timeout: 10000
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('a clean source checkout cannot authenticate with a bundled shared key', t => {
  const {env} = fixture(t);
  const credentials = evaluate(env, "import {loadCredentials} from './src/auth.js'; console.log(JSON.stringify(loadCredentials()));");
  assert.equal(credentials.apiKey, '');
  const result = spawnSync(process.execPath, ['bin/poli.js', '--chat', 'hello'], {
    cwd: new URL('..', import.meta.url), env, encoding: 'utf8', timeout: 10000
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No API key found/);
});

test('user-supplied environment credentials take precedence over stored credentials', t => {
  const {env} = fixture(t);
  fs.mkdirSync(env.POLI_CODE_HOME, {recursive: true});
  fs.writeFileSync(path.join(env.POLI_CODE_HOME, 'credentials.json'), JSON.stringify({apiKey: 'stored-dummy-key'}));
  const source = "import {loadCredentials} from './src/auth.js'; console.log(JSON.stringify(loadCredentials()));";
  assert.equal(evaluate({...env, POLI_API_KEY: ' secondary-dummy-key '}, source).apiKey, 'secondary-dummy-key');
  assert.equal(evaluate({...env, POLI_API_KEY: 'secondary-dummy-key', POLIAI_API_KEY: ' primary-dummy-key '}, source).apiKey, 'primary-dummy-key');
});

test('local credentials are private and clearing them does not restore shared access', t => {
  const {env} = fixture(t);
  const result = evaluate(env, `
    import fs from 'node:fs';
    import {saveCredentials, loadCredentials, clearCredentials} from './src/auth.js';
    const file = saveCredentials({apiKey: 'private-dummy-key', baseUrl: 'https://example.test/v1/'});
    const loaded = loadCredentials();
    const permissions = fs.statSync(file).mode & 0o777;
    clearCredentials();
    console.log(JSON.stringify({loaded, permissions, remaining: loadCredentials()}));
  `);
  assert.equal(result.loaded.apiKey, 'private-dummy-key');
  assert.equal(result.loaded.baseUrl, 'https://example.test/v1');
  if (process.platform !== 'win32') assert.equal(result.permissions, 0o600);
  assert.equal(result.remaining.apiKey, '');
});
