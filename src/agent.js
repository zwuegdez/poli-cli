import { ALL_TOOLS, executeTool, normalizeToolCall } from './tools/index.js';
import { Spinner } from './ui/spinner.js';
import { toolDetails } from './ui/tool-details.js';
import { toolCard, toolActivity, chatMessage, style } from './ui/theme.js';
import { MarkdownStream } from './ui/markdown.js';
import { watchCancellation } from './ui/select.js';
import { TurnInput } from './ui/turn-input.js';
import { parseBridgeCalls, chatMessages } from './tool-bridge.js';

export class PoliAgent {
  constructor({ client, session, config, promptManager, execute = executeTool, createTurnInput = options => new TurnInput(options) }) {
    Object.assign(this, { client, session, config, promptManager, execute, createTurnInput });
    this.modelInfo = null;
    this.bridgeModels = new Set();
    this.lastTurnFailed = false;
  }

  setModel(model) { this.modelInfo = model; }

  async runTurn(userInput, { signal } = {}) {
    if (userInput) this.session.addMessage({ role: 'user', content: userInput });
    if (!this.session.messages.some(m => m.role === 'user')) {
      console.log(style.dim('\nSend a task first.')); return {};
    }
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal?.aborted) cancel();
    signal?.addEventListener('abort', cancel, { once: true });
    process.on('SIGINT', cancel);
    const started = Date.now();
    let actions = 0, formatRepaired = false;
    const spinner = new Spinner('', process.stdout);
    this.lastTurnFailed = false;
    const turnInput = this.createTurnInput({ model: this.config.model, mode: this.config.mode, controller, onDetails: () => process.stdout.write('\n' + toolDetails(this.session.messages) + '\n\n'), onSubmit: message => this.promptManager?.saveHistory(message) });
    turnInput.start();
    const watch = () => turnInput.active ? () => {} : watchCancellation(controller);
    const appendQueued = () => {
      const messages = turnInput.drain();
      for (const content of messages) {
        this.session.addMessage({ role: 'user', content });
        process.stdout.write(chatMessage('user', content, { queued: true }) + '\n');
      }
      return messages.length;
    };
    let activeToolSpinner;
    const toolsPrompt = this.promptManager ? Object.create(this.promptManager) : null;
    if (toolsPrompt) toolsPrompt.confirm = async (...args) => {
      activeToolSpinner?.stop();
      turnInput.suspend();
      try { return await this.promptManager.confirm(...args); }
      finally { if (!controller.signal.aborted) { turnInput.start(); activeToolSpinner?.start(); } }
    };
    if (this.modelInfo?.id !== this.config.model && typeof this.client.listModels === 'function') {
      spinner.start('Connecting…');
      const stopWatching = watch();
      try { this.modelInfo = (await this.client.listModels({ signal: controller.signal })).find(m => m.id === this.config.model) || null; }
      catch { /* Requests still work when a router does not expose a catalog. */ }
      finally { stopWatching(); spinner.stop(); }
    }
    try {
      // Continue until the model finishes or the user stops the turn. No step cap.
      while (!controller.signal.aborted) {
        const agentMode = this.config.mode !== 'chat';
        let bridge = agentMode && (this.modelInfo?.capabilities?.tools === false || this.bridgeModels.has(this.config.model));
        let streamed = '', first = true;
        const output = new MarkdownStream(text => process.stdout.write(text), {
          transform: text => bridge ? parseBridgeCalls(text).content : text,
        });
        const beginResponse = () => {
          if (!first) return;
          first = false;
          if (turnInput.active) spinner.update('Replying…');
          else spinner.stop();
          process.stdout.write('\n' + style.poliBrand() + '\n');
        };
        const chunks = chunk => {
          if (chunk.type === 'content') {
            streamed += chunk.text;
            beginResponse();
            output.push(chunk.text);
          } else if (first && chunk.type === 'reasoning') spinner.update('Preparing reply…');
          else if (first && chunk.type === 'tool') spinner.update('Preparing action…');
        };
        const request = () => this.client.createChatCompletion({
          model: this.config.model,
          messages: bridge || !agentMode ? chatMessages(this.session.messages, bridge, { workspaceDir: this.session.workspaceDir }) : this.session.messages,
          tools: agentMode && !bridge ? ALL_TOOLS : null,
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
          stream: this.modelInfo?.capabilities?.streaming !== false,
          onChunk: chunks,
          signal: controller.signal,
        });
        spinner.start('Replying…');
        let response;
        const stopWatching = watch();
        try {
          try { response = await request(); }
          catch (error) {
            // Retry only an explicit unsupported-tools rejection, before any text.
            if (!streamed && agentMode && !bridge && (error.code === 'model_does_not_support_tools' || error.status === 400 && /(?:tools?|function.call).*(?:not support|unsupported)|(?:not support|unsupported).*tools?/i.test(error.message))) {
              bridge = true;
              this.bridgeModels.add(this.config.model);
              spinner.update('Using local tool bridge · Ctrl+C / Esc stop');
              response = await request();
            } else if (!streamed && (error.code === 'context_length_exceeded' || error.status === 400 && /context.{0,30}(?:length|limit|exceed|too long)/i.test(error.message)) && this.session.compact?.()) {
              spinner.update('Trimming older conversation · Ctrl+C / Esc stop');
              response = await request();
            } else throw error;
          }
        } catch (error) {
          output.end();
          if (streamed) this.session.addMessage({ role: 'assistant', content: streamed });
          throw error;
        } finally { stopWatching(); spinner.stop(); }
        if (!streamed && response.message?.content) { beginResponse(); output.push(response.message.content); }
        output.end();
        if (response.usage) this.session.recordUsage(response.usage);
        const message = response.message || {};
        let content = message.content || streamed || '';
        let calls = message.tool_calls || [];
        if (bridge) {
          const parsed = parseBridgeCalls(content);
          content = parsed.content;
          calls = [...calls, ...parsed.calls];
        }
        if (!agentMode) calls = [];
        if (bridge && !calls.length && !formatRepaired && /tool\s*call\s*:\s*(?:view_file|list_dir|run_command|edit_file|write_file|grep_search|file_search)\b|(?:can't|cannot|don't|do not|no).{0,50}(?:access.{0,30}(?:file|tool|workspace)|read.{0,20}(?:local|file))|(?:cannot|can't|don't|do not).{0,30}(?:read|edit|execute|run).{0,25}(?:files?|commands?)/i.test(content)) {
          formatRepaired = true;
          this.session.addMessage({ role: 'assistant', content });
          this.session.addMessage({ role: 'user', content: 'Local tool protocol error: your attempted tool call was NOT executed because it used the wrong format. Emit a dedicated ```poli-tool fenced block containing {"name":"tool_name","arguments":{...}} with the exact schema parameter names from the system instructions. Then wait for the tool result. Do not ask the user to execute it.' });
          continue;
        }
        if (!calls.length) {
          this.session.addMessage({ role: 'assistant', content });
          if (!content.trim()) {
            this.lastTurnFailed = true;
            console.log(style.yellow('No answer returned. Try /retry or choose another model with /models.'));
          }
          if (response.finishReason === 'length') console.log(style.dim('Response reached the model output limit. Use /retry to continue.'));
          if (appendQueued()) continue;
          break;
        }
        calls = calls.map(call => {
          try {
            const normalized = normalizeToolCall(call.function?.name, JSON.parse(call.function?.arguments || '{}'));
            return { ...call, function: { name: normalized.name, arguments: JSON.stringify(normalized.args) } };
          } catch { return call; }
        });
        this.session.addMessage({ role: 'assistant', content: content || null, tool_calls: calls });
        for (const call of calls) {
          const name = call.function?.name;
          let args, result;
          try { args = JSON.parse(call.function?.arguments || '{}'); }
          catch { result = { error: 'Invalid JSON tool arguments. Send a valid arguments object.' }; args = {}; }
          const toolStart = Date.now();
          const toolSpinner = new Spinner(toolActivity(name, args), process.stdout);
          activeToolSpinner = toolSpinner;
          if (controller.signal.aborted) result = { rejected: true, message: 'User stopped the turn. This tool was not executed.' };
          else if (!result) {
            toolSpinner.start();
            try {
              result = await this.execute(name, args, {
                workspaceDir: this.session.workspaceDir,
                promptManager: toolsPrompt,
                turnInput,
                autoApprove: this.config.autoApprove,
                controller,
                signal: controller.signal,
                cancelTurn: cancel,
                onStart: () => toolSpinner.start(toolActivity(name, args)),

              });
            } catch (error) { result = { error: error.message }; }
            finally { toolSpinner.stop(); }
          }
          actions++;
          if (result == null) result = { error: 'Tool returned no result. Try the tool again with valid arguments.' };
          const status = result?.rejected ? 'rejected' : result?.error || result?.exit_code > 0 || result?.timed_out ? 'error' : 'success';
          process.stdout.write(`\n${toolCard({ name, args, status, result, elapsedMs: Date.now() - toolStart })}\n`);
          this.session.addMessage({ role: 'tool', tool_call_id: call.id, name, content: JSON.stringify(result ?? { error: 'Tool returned no result.' }) });
          this.session.save();
        }
        appendQueued();
      }
      if (controller.signal.aborted) console.log(style.yellow('\nStopped. Your conversation is kept. Send a new task or use /retry.'));
      else if (actions) console.log(style.dim(`${actions} ${actions === 1 ? 'tool call' : 'tool calls'} · ${((Date.now() - started) / 1000).toFixed(1)}s`));
      return { cancelled: controller.signal.aborted };
    } catch (error) {
      spinner.stop();
      this.lastTurnFailed = true;
      if (controller.signal.aborted) { console.log(style.yellow('\nStopped. Send a new message or use /retry.')); return { cancelled: true }; }
      console.log(style.red(`\n${error.message}`));
      console.log(style.dim('Use /retry to try again, /models to change model, or keep chatting.\n'));
      return { error: error.message };
    } finally {
      spinner.stop();
      // Keep submitted follow-ups even when the active request fails or is stopped.
      appendQueued();
      if (this.promptManager) this.promptManager.draft = turnInput.draft();
      turnInput.close();
      signal?.removeEventListener('abort', cancel);
      process.removeListener('SIGINT', cancel);
      this.session.save();
    }
  }
}
