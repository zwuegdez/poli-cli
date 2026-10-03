// Auth and Credentials Manager
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { getPoliHomeDir } from './config.js';

// Default preconfigured local proxy key for seamless out-of-the-box operation
const EMBEDDED_PROXY_KEY = 'sk-poli-50a889c714038b8e9df36fb3f82c10f3dde8ae95c61a0b071ad2b120ac981269';

export function getCredentialsPath() {
  return path.join(getPoliHomeDir(), 'credentials.json');
}

export function maskKey(key) {
  if (!key) return '(none)';
  const s = String(key).trim();
  if (s.length <= 10) return '••••••';
  return `${s.slice(0, 10)}…${s.slice(-6)}`;
}

export function loadCredentials() {
  // 1. Environment variables take highest precedence
  if (process.env.POLIAI_API_KEY) {
    return {
      apiKey: process.env.POLIAI_API_KEY.trim(),
      source: 'env (POLIAI_API_KEY)'
    };
  }
  if (process.env.POLI_API_KEY) {
    return {
      apiKey: process.env.POLI_API_KEY.trim(),
      source: 'env (POLI_API_KEY)'
    };
  }

  // 2. ~/.poli-code/credentials.json
  const localCredsPath = getCredentialsPath();
  if (fs.existsSync(localCredsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(localCredsPath, 'utf8'));
      if (data?.apiKey) {
        return {
          apiKey: data.apiKey,
          baseUrl: data.baseUrl,
          loginMethod: data.loginMethod || 'stored',
          source: localCredsPath
        };
      }
    } catch {}
  }

  // 3. System Poliai credentials (~/.config/poliai/credentials.json or ~/.poliai/credentials.json)
  const xdgDir = process.env.XDG_CONFIG_HOME
    ? path.join(process.env.XDG_CONFIG_HOME, 'poliai')
    : path.join(os.homedir(), '.config', 'poliai');
  const legacyDir = path.join(os.homedir(), '.poliai');

  for (const dir of [xdgDir, legacyDir]) {
    const credFile = path.join(dir, 'credentials.json');
    if (fs.existsSync(credFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(credFile, 'utf8'));
        if (data?.apiKey) {
          return {
            apiKey: data.apiKey,
            baseUrl: data.baseUrl,
            loginMethod: data.loginMethod || 'poliai-system',
            source: credFile
          };
        }
      } catch {}
    }
  }

  // 4. Default embedded proxy key
  return {
    apiKey: EMBEDDED_PROXY_KEY,
    source: 'poli-proxy default key',
    loginMethod: 'auto-proxy'
  };
}

export function saveCredentials({ apiKey, baseUrl, loginMethod = 'api_key' }) {
  const credsPath = getCredentialsPath();
  const dir = path.dirname(credsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const payload = {
    apiKey: apiKey.trim(),
    baseUrl: baseUrl ? baseUrl.trim().replace(/\/+$/, '') : undefined,
    loginMethod,
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync(credsPath, JSON.stringify(payload, null, 2), { mode: 0o600 });
  return credsPath;
}

export function clearCredentials() {
  const credsPath = getCredentialsPath();
  if (fs.existsSync(credsPath)) {
    fs.unlinkSync(credsPath);
    return true;
  }
  return false;
}
