// OpenAI-compatible transport. Handles SSE, JSON-only routers, and cancellation.
import crypto from 'node:crypto';
export class ApiError extends Error {
  constructor(message, status = 0, code = '') { super(message); this.name = 'ApiError'; this.status = status; this.code = code; }
}

function requestScope(signal, timeoutMs) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Request timed out. Try again or choose another model with /models.')), timeoutMs);
  timer.unref?.();
  return { signal: controller.signal, close() { clearTimeout(timer); signal?.removeEventListener('abort', abort); } };
}

function resultFromJson(data) {
  if (data.error) throw new ApiError(data.error.message || String(data.error), 0, data.error.code);
  const choice = data.choices?.[0];
  if (!choice?.message) throw new ApiError('The router returned no assistant message. Try /models or /retry.');
  checkProviderMessage(choice.message);
  return { message: choice.message, usage: data.usage || null, finishReason: choice.finish_reason, meta: data.poliai || null };
}

function checkProviderMessage(message) {
  if (!message?.tool_calls?.length && typeof message?.content === 'string' && /^\[No response generated[\s\S]*service may be having issues[\s\S]*\]$/i.test(message.content.trim())) {
    throw new ApiError('The provider returned an unavailable-service placeholder instead of an answer. Use /retry or choose another model with /models.', 503, 'provider_empty_response');
  }
}

export class PoliClient {
  constructor({ baseUrl, apiKey, timeoutMs = 120000 }) {
    this.baseUrl = (baseUrl || 'https://router.poliai.qzz.io/v1').replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.modelFailures = new Map();
  }

  async request(path, options, scope) {
    const response = await fetch(`${this.baseUrl}${path}`, { ...options, signal: scope.signal,
      headers: { Authorization: `Bearer ${this.apiKey}`, ...options.headers } });
    if (!response.ok) {
      const raw = await response.text();
      let detail;
      try { detail = JSON.parse(raw).error; } catch {}
      throw new ApiError(detail?.message || `Router request failed (HTTP ${response.status}). ${raw.slice(0, 300)}`, response.status, detail?.code || '');
    }
    return response;
  }

  async listModels({ signal } = {}) {
    const scope = requestScope(signal, 15000);
    try {
      const res = await this.request('/models', { method: 'GET', headers: { Accept: 'application/json' } }, scope);
      const data = await res.json();
      return (Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : []).filter(m => typeof m?.id === 'string');
    } catch (error) { if (scope.signal.aborted) throw scope.signal.reason; throw error; }
    finally { scope.close(); }
  }

  async createChatCompletion({ model, messages, tools = null, temperature = 0.2, maxTokens = 4096, stream = false, onChunk = null, signal }) {
    const scope = requestScope(signal, this.timeoutMs);
    const body = { model, messages, max_tokens: maxTokens, stream: Boolean(stream) };
    if (temperature != null) body.temperature = temperature;
    if (tools?.length) { body.tools = tools; body.tool_choice = 'auto'; }
    let reader;
    try {
      const res = await this.request('/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: stream ? 'text/event-stream' : 'application/json' }, body: JSON.stringify(body),
      }, scope);
      onChunk?.({ type: 'connected' });
      if (!stream || res.headers.get('content-type')?.includes('application/json')) {
        const result = resultFromJson(await res.json());
        if (stream && result.message.content) onChunk?.({ type: 'content', text: result.message.content });
        this.modelFailures.delete(model);
        return result;
      }
      if (!res.body) throw new ApiError('The router returned an empty response body.');
      reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', content = '', usage = null, finishReason = null, ended = false, received = false;
      const calls = new Map();
      const handleLine = line => {
        if (!line.startsWith('data:')) return;
        const raw = line.slice(5).trim();
        if (!raw) return;
        if (raw === '[DONE]') { ended = true; return; }
        let data;
        try { data = JSON.parse(raw); } catch { throw new ApiError('The router sent an invalid streaming event. Try /retry.'); }
        if (data.error) throw new ApiError(data.error.message || 'Router streaming error', 0, data.error.code);
        if (data.usage) usage = data.usage;
        const choice = data.choices?.[0];
        if (!choice) return;
        received = true;
        if (choice.finish_reason) finishReason = choice.finish_reason;
        const delta = choice.delta || choice.message || {};
        if (typeof delta.content === 'string' && delta.content) { content += delta.content; onChunk?.({ type: 'content', text: delta.content }); }
        const reasoning = delta.reasoning_content || delta.reasoning;
        if (reasoning) onChunk?.({ type: 'reasoning', text: reasoning });
        for (const part of delta.tool_calls || []) {
          const index = part.index ?? 0;
          if (!calls.has(index)) calls.set(index, { id: part.id || `call_${crypto.randomBytes(8).toString('hex')}`, type: 'function', function: { name: '', arguments: '' } });
          const call = calls.get(index);
          if (part.id) call.id = part.id;
          if (part.function?.name && part.function.name !== call.function.name) call.function.name = part.function.name.startsWith(call.function.name) ? part.function.name : call.function.name + part.function.name;
          if (part.function?.arguments) call.function.arguments += part.function.arguments;
          onChunk?.({ type: 'tool', name: call.function.name });
        }
      };
      while (!ended) {
        const { done, value } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        let newline;
        while (!ended && (newline = buffer.indexOf('\n')) !== -1) { handleLine(buffer.slice(0, newline).replace(/\r$/, '')); buffer = buffer.slice(newline + 1); }
        if (done) { if (!ended && buffer.trim()) handleLine(buffer.replace(/\r$/, '')); break; }
      }
      const toolCalls = [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call);
      if (!received || !content && !toolCalls.length) throw new ApiError('The model returned no text or tool calls. Choose another model with /models or use /retry.');
      if (!ended && !finishReason) throw new ApiError('The response stream ended before completion. Use /retry to try again.');
      if (toolCalls.some(call => !call.function.name)) throw new ApiError('The model returned an incomplete tool call. Use /retry.');
      checkProviderMessage({content,tool_calls:toolCalls});
      this.modelFailures.delete(model);
      return { message: { role: 'assistant', content: content || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }, usage, finishReason };
    } catch (error) {
      if (!signal?.aborted) this.modelFailures.set(model, scope.signal.aborted ? scope.signal.reason?.message : error.message);
      if (scope.signal.aborted) throw scope.signal.reason;
      throw error;
    }
    finally { await reader?.cancel().catch(() => {}); reader?.releaseLock(); scope.close(); }
  }
}
