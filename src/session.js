// Session and conversation history manager
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getSessionsDir } from './config.js';

export class Session {
  constructor({ id = null, workspaceDir = process.cwd() } = {}) {
    if (id && !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid session ID.');
    this.id = id || crypto.randomBytes(8).toString('hex');
    this.workspaceDir = workspaceDir;
    this.createdAt = new Date().toISOString();
    this.messages = [];
    this.tokenStats = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    };
  }

  addMessage(msg) {
    this.messages.push(msg);
  }

  static read(id, workspaceDir = process.cwd()) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid session ID.');
    const record = JSON.parse(fs.readFileSync(path.join(getSessionsDir(), `session_${id}.json`), 'utf8'));
    if (record.id !== id || typeof record.workspaceDir !== 'string' || path.resolve(record.workspaceDir) !== path.resolve(workspaceDir)) throw new Error('Session belongs to a different workspace.');
    if (!Array.isArray(record.messages) || !record.messages.every(message => message && ['system', 'user', 'assistant', 'tool'].includes(message.role) && (message.tool_calls == null || Array.isArray(message.tool_calls) && message.tool_calls.every(call => typeof call?.id === 'string' && typeof call.function?.name === 'string')))) throw new Error('Session contains invalid messages.');
    return record;
  }

  static list(workspaceDir = process.cwd()) {
    let files;
    try { files = fs.readdirSync(getSessionsDir()); } catch { return []; }
    const records = [];
    for (const filename of files) {
      const id = filename.match(/^session_([a-zA-Z0-9_-]+)\.json$/)?.[1];
      if (!id) continue;
      try {
        const record = Session.read(id, workspaceDir);
        const users = record.messages.filter(message => message.role === 'user');
        if (!users.length) continue;
        const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : typeof record.createdAt === 'string' ? record.createdAt : '';
        records.push({ id, updatedAt, turns: users.length, preview: String(users.at(-1).content || 'Conversation') });
      } catch { /* Skip damaged files and sessions from other workspaces. */ }
    }
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  restore(id) {
    const record = Session.read(id, this.workspaceDir);
    this.id = record.id;
    this.createdAt = typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString();
    this.messages = [];
    const pending = new Map();
    const closePending = () => {
      for (const [id, name] of pending) this.messages.push({ role: 'tool', tool_call_id: id, name, content: JSON.stringify({ rejected: true, message: 'Previous run stopped before this tool returned. Inspect the workspace before retrying.' }) });
      pending.clear();
    };
    for (const message of record.messages) {
      if (message.role !== 'tool') closePending();
      this.messages.push(message);
      if (message.role === 'assistant') for (const call of message.tool_calls || []) pending.set(call.id, call.function?.name);
      if (message.role === 'tool') pending.delete(message.tool_call_id);
    }
    closePending();
    for (const key of Object.keys(this.tokenStats)) {
      const value = record.tokenStats?.[key];
      this.tokenStats[key] = Number.isFinite(value) && value >= 0 ? value : 0;
    }
  }

  recordUsage(usage) {
    if (!usage) return;
    this.tokenStats.promptTokens += usage.prompt_tokens || 0;
    this.tokenStats.completionTokens += usage.completion_tokens || 0;
    this.tokenStats.totalTokens += usage.total_tokens || 0;
  }

  save() {
    try {
      const dir = getSessionsDir();
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const filePath = path.join(dir, `session_${this.id}.json`);
      const payload = {
        id: this.id,
        workspaceDir: this.workspaceDir,
        createdAt: this.createdAt,
        updatedAt: new Date().toISOString(),
        tokenStats: this.tokenStats,
        messages: this.messages
      };
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), { mode: 0o600 });
    } catch {}
  }

  compact() {
    // Keep whole user turns so tool requests and results are never separated.
    const starts = this.messages.map((m, i) => m.role === 'user' ? i : -1).filter(i => i >= 0);
    if (starts.length <= 4) return false;
    const cut = starts.at(-4);
    const first = this.messages[0]?.role === 'system' ? this.messages[0] : null;
    this.messages = [
      ...(first ? [first] : []),
      { role: 'system', content: `[Earlier conversation omitted to save context. ${starts.length - 4} older user turns were removed; their contents are not available.]` },
      ...this.messages.slice(cut),
    ];
    return true;
  }

  clear() {
    const firstMsg = this.messages[0]?.role === 'system' ? this.messages[0] : null;
    this.messages = firstMsg ? [firstMsg] : [];
  }
}
