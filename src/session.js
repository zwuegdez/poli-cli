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
    // If messages length is high, summarize or retain system + recent turns
    if (this.messages.length <= 10) return;

    const firstMsg = this.messages[0]?.role === 'system' ? this.messages[0] : null;
    const recent = this.messages.slice(-8);

    const summaryTurn = {
      role: 'system',
      content: `[Context compacted: Earlier ${this.messages.length - 8} turns have been consolidated to preserve context window]`
    };

    this.messages = firstMsg ? [firstMsg, summaryTurn, ...recent] : [summaryTurn, ...recent];
  }

  clear() {
    const firstMsg = this.messages[0]?.role === 'system' ? this.messages[0] : null;
    this.messages = firstMsg ? [firstMsg] : [];
  }
}
