// Poli-proxy client for OpenAI-compatible chat completions and streaming
import { colors } from './ui/theme.js';

export class PoliClient {
  constructor({ baseUrl, apiKey }) {
    this.baseUrl = (baseUrl || 'http://127.0.0.1:8000/v1').replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  async listModels() {
    const url = `${this.baseUrl}/models`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Failed to list models (HTTP ${res.status}): ${errText}`);
    }

    const data = await res.json();
    return Array.isArray(data.data) ? data.data : [];
  }

  async createChatCompletion({
    model,
    messages,
    tools = null,
    temperature = 0.2,
    maxTokens = 4096,
    stream = false,
    onChunk = null
  }) {
    const url = `${this.baseUrl}/chat/completions`;
    const body = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: Boolean(stream)
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': stream ? 'text/event-stream' : 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      let errBody = '';
      try {
        const json = await res.json();
        errBody = json.error?.message || JSON.stringify(json);
      } catch {
        errBody = await res.text().catch(() => `HTTP ${res.status}`);
      }
      throw new Error(`Proxy error (${res.status}): ${errBody}`);
    }

    if (!stream) {
      const data = await res.json();
      return {
        message: data.choices?.[0]?.message || { role: 'assistant', content: '' },
        usage: data.usage || null,
        meta: data.poliai || null
      };
    }

    // Handle Server-Sent Events (SSE) streaming
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedContent = '';
    const toolCallsMap = new Map();
    let usage = null;
    let finishReason = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed === 'data: [DONE]') {
          continue;
        }

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6).trim();
          try {
            const parsed = JSON.parse(jsonStr);
            const choice = parsed.choices?.[0];
            if (choice?.finish_reason) {
              finishReason = choice.finish_reason;
            }
            if (parsed.usage) {
              usage = parsed.usage;
            }

            const delta = choice?.delta;
            if (delta) {
              // Text chunk
              if (delta.content) {
                accumulatedContent += delta.content;
                if (onChunk) onChunk({ type: 'content', text: delta.content });
              }

              // Tool calls chunk
              if (Array.isArray(delta.tool_calls)) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!toolCallsMap.has(idx)) {
                    toolCallsMap.set(idx, {
                      id: tc.id || `call_${idx}`,
                      type: 'function',
                      function: {
                        name: tc.function?.name || '',
                        arguments: tc.function?.arguments || ''
                      }
                    });
                  } else {
                    const existing = toolCallsMap.get(idx);
                    if (tc.id) existing.id = tc.id;
                    if (tc.function?.name) existing.function.name += tc.function.name;
                    if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                  }
                }
              }
            }
          } catch (e) {
            // ignore partial JSON parse error
          }
        }
      }
    }

    const toolCalls = Array.from(toolCallsMap.values()).filter(tc => tc.function.name);

    return {
      message: {
        role: 'assistant',
        content: accumulatedContent || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined
      },
      usage,
      finishReason
    };
  }
}
