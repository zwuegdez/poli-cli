// Configuration management for poli-code
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Default Router Endpoint as requested
export const DEFAULT_ROUTER_BASE_URL = 'https://router.poliai.qzz.io/v1';
export const DEFAULT_REMOTE_BASE_URL = DEFAULT_ROUTER_BASE_URL;
export const DEFAULT_ACCOUNT_API_BASE = 'https://router.poliai.qzz.io';
export const DEFAULT_LOCAL_BASE_URL = 'http://127.0.0.1:8000/v1';
export const DEFAULT_MODEL = 'gpt-6.1-sol';

export function getPoliHomeDir() {
  const custom = process.env.POLI_CODE_HOME;
  if (custom) return custom;
  return path.join(os.homedir(), '.poli-code');
}

export function getConfigPath() {
  return path.join(getPoliHomeDir(), 'config.json');
}

export function getSessionsDir() {
  return path.join(getPoliHomeDir(), 'sessions');
}

export function getHistoryPath() {
  return path.join(getPoliHomeDir(), 'history.txt');
}

export async function detectDefaultBaseUrl() {
  // If explicitly overridden via env var, use it
  if (process.env.POLIAI_BASE_URL) return process.env.POLIAI_BASE_URL.replace(/\/+$/, '');
  if (process.env.POLI_BASE_URL) return process.env.POLI_BASE_URL.replace(/\/+$/, '');

  // Default to router endpoint
  return DEFAULT_ROUTER_BASE_URL;
}

export function loadConfig() {
  const configPath = getConfigPath();
  const defaults = {
    baseUrl: DEFAULT_ROUTER_BASE_URL,
    accountApiBase: DEFAULT_ACCOUNT_API_BASE,
    model: DEFAULT_MODEL,
    autoApprove: false,
    mode: 'agent',
    requestTimeoutMs: 120000,
    temperature: 0.2,
    maxTokens: 4096,
    stream: true
  };

  if (!fs.existsSync(configPath)) {
    return defaults;
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

export function saveConfig(updates = {}) {
  const current = loadConfig();
  const merged = { ...current, ...updates };
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), { mode: 0o600 });
  return merged;
}
