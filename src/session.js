// Session and conversation history manager
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getSessionsDir } from './config.js';

export class Session {
  constructor({ id = null, workspaceDir = process.cwd() } = {}) {
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
