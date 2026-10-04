import { contextHandoff } from './context-handoff.js';
// Session and conversation history manager
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getSessionsDir } from './config.js';

const validMessage = message => message && ['system', 'user', 'assistant', 'tool'].includes(message.role) && (message.tool_calls == null || Array.isArray(message.tool_calls) && message.tool_calls.every(call => typeof call?.id === 'string' && typeof call.function?.name === 'string'));

export class Session {
  constructor({ id = null, workspaceDir = process.cwd() } = {}) {
    if (id && !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid session ID.');
    this.id = id || crypto.randomBytes(8).toString('hex');
    this.workspaceDir = workspaceDir;
    this.createdAt = new Date().toISOString();
    this.messages = [];
    this.archivedMessages = [];
    this.contextUsage = null;
    this.subagentRecords = [];
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
    if (!Array.isArray(record.messages) || !record.messages.every(validMessage) || record.archivedMessages != null && (!Array.isArray(record.archivedMessages) || !record.archivedMessages.every(validMessage))) throw new Error('Session contains invalid messages.');
    if (record.subagentRecords != null && (!Array.isArray(record.subagentRecords) || !record.subagentRecords.every(agent => typeof agent?.agent_id === 'string' && Array.isArray(agent.messages) && agent.messages.every(validMessage)))) throw new Error('Session contains invalid subagent records.');
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
        const users = [...(record.archivedMessages || []), ...record.messages].filter(message => message.role === 'user');
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
    this.archivedMessages = Array.isArray(record.archivedMessages) ? record.archivedMessages.filter(message => message && ['user', 'assistant', 'tool'].includes(message.role)) : [];
    this.createdAt = typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString();
    this.contextUsage = record.contextUsage && typeof record.contextUsage.model === 'string' && Number.isFinite(record.contextUsage.promptTokens) && record.contextUsage.promptTokens >= 0 ? record.contextUsage : null;
    this.subagentRecords = record.subagentRecords || [];
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

  history() { return [...this.archivedMessages, ...this.messages]; }
  searchableHistory() {
    return [...this.history(), ...this.subagentRecords.flatMap(agent=>agent.messages.map(message=>({...message,scope:{agent_id:agent.agent_id,label:agent.label,model:agent.model}})))];
  }
  recordSubagent(record) {
    const at=this.subagentRecords.findIndex(agent=>agent.agent_id===record.agent_id);
    if(at>=0)this.subagentRecords[at]=record;else this.subagentRecords.push(record);
  }

  recordUsage(usage) {
    if (!usage) return;
    const valid = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
    const prompt = valid(usage.prompt_tokens), completion = valid(usage.completion_tokens);
    this.tokenStats.promptTokens += prompt;
    this.tokenStats.completionTokens += completion;
    this.tokenStats.totalTokens += valid(usage.total_tokens) || prompt + completion;
  }

  recordContextUsage(usage, model) {
    if (!Number.isFinite(usage?.prompt_tokens) || usage.prompt_tokens < 0) return;
    this.contextUsage = { model, promptTokens: usage.prompt_tokens, completionTokens: Number.isFinite(usage.completion_tokens) && usage.completion_tokens >= 0 ? usage.completion_tokens : null };
  }

  save() {
    let temporary;
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
        archivedMessages: this.archivedMessages,
        contextUsage: this.contextUsage,
        subagentRecords: this.subagentRecords,
        messages: this.messages
      };
      temporary = filePath + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
      fs.writeFileSync(temporary, JSON.stringify(payload, null, 2), { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, filePath);
      this.saveError = null;
      return true;
    } catch (error) {
      this.saveError = error.message;
      if (temporary) try { fs.unlinkSync(temporary); } catch {}
      return false;
    }
  }

  compact() {
    // Keep whole user turns so tool requests and results are never separated.
    const starts = this.messages.map((m, i) => m.role === 'user' ? i : -1).filter(i => i >= 0);
    if (starts.length <= 4) return false;
    const cut = starts.at(-4);
    const first = this.messages[0]?.role === 'system' ? this.messages[0] : null;
    this.archivedMessages.push(...this.messages.slice(0, cut).filter(message => message.role !== 'system'));
    this.messages = [
      ...(first ? [first] : []),
      { role: 'system', content: `Earlier conversation was compacted. Recorded handoff:\n${contextHandoff(this.archivedMessages)}` },
      ...this.messages.slice(cut),
    ];
    return true;
  }

  clear() {
    this.archivedMessages = [];
    this.contextUsage = null;
    this.subagentRecords = [];
    const firstMsg = this.messages[0]?.role === 'system' ? this.messages[0] : null;
    this.messages = firstMsg ? [firstMsg] : [];
  }
}
