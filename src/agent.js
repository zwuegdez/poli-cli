import { SubagentManager } from './subagents.js';
import crypto from 'node:crypto';
import { modelMessages } from './context-handoff.js';
import { contextSnapshot, contextLimit, contextError, fitContext } from './context-window.js';
import { permissionLevel } from './permissions.js';
import { ALL_TOOLS, executeTool, normalizeToolCall } from './tools/index.js';
import { Spinner } from './ui/spinner.js';
import { toolDetails } from './ui/tool-details.js';
import { toolCard, toolActivity, chatMessage, style } from './ui/theme.js';
import { MarkdownStream } from './ui/markdown.js';
import { watchCancellation } from './ui/select.js';
import { TurnInput } from './ui/turn-input.js';
import { parseBridgeCalls, chatMessages, bridgeInstructions, combineToolCalls, unsupportedTools } from './tool-bridge.js';
import { withSignal } from './async-utils.js';
import { handleSessionControl } from './commands/session-controls.js';
import { saveConfig } from './config.js';

export class PoliAgent {
  constructor({ client, session, config, promptManager, execute = executeTool, createTurnInput = options => new TurnInput(options) }) {
    Object.assign(this, { client, session, config, promptManager, execute, createTurnInput });
    this.modelInfo = null;
    this.bridgeModels = new Set();
    this.lastTurnFailed = false;
    this.previousModel = config.model;
    this.handoff = false;
    this.historyBudgetTokens = null;
    this.subagents = new SubagentManager(this);
  }

  setModel(model) {
    if (this.previousModel !== model.id) { this.handoff = true; this.historyBudgetTokens = null; }
    this.previousModel = model.id;
    this.modelInfo = model;
  }

  requestContext(bridge = this.config.mode !== 'chat' && (this.modelInfo?.capabilities?.tools === false || this.bridgeModels.has(this.config.model)), {shorten = true} = {}) {
    const agentMode = this.config.mode !== 'chat';
    const messages = modelMessages(this.session.messages, { handoff: this.handoff, history: this.session.history?.() || this.session.messages, extraInstructions: agentMode && !bridge ? bridgeInstructions(undefined, { native: true }) : '' });
    const tools = agentMode && !bridge ? ALL_TOOLS : null;
    const limit = contextLimit(this.modelInfo || {id:this.config.model},this.config).tokens;
    const budget = this.historyBudgetTokens || (limit ? Math.max(1024,Math.floor(limit * 0.8) - (this.config.maxTokens || 4096)) : null);
    const shortened = shorten ? fitContext(messages,agentMode?ALL_TOOLS:null,budget) : messages;
    return { messages: bridge || !agentMode ? chatMessages(shortened, bridge, {workspaceDir:this.session.workspaceDir}) : shortened, tools };
  }
  getContext({raw = false} = {}) { return contextSnapshot({session:this.session,model:this.modelInfo,config:this.config,...this.requestContext(undefined,{shorten:!raw})}); }

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
    let approvalActive = false, responsePending = false, approvalOutput = '';
    const write = text => { if (approvalActive) approvalOutput += text; else process.stdout.write(text); };
    const log = text => write(text + '\n');
    let actions = 0, formatRepaired = false;
    const spinner = new Spinner('', process.stdout);
    this.lastTurnFailed = false;
    const turnInput = this.createTurnInput({ model: this.config.model, mode: this.config.mode, controller, onDetails: () => write('\n' + toolDetails(this.session.messages) + '\n\n'), onSubmit: message => this.promptManager?.saveHistory(message), onCommand: input => {
      if (input === '/details') write('\n' + toolDetails(this.session.messages) + '\n\n');
      else if (!handleSessionControl(input, {agent:this,write,saveConfig,busy:true,controller})) write('\nCommands while working: /context · /agents [id|stop <id>|stop all] · /details · /stop\nRun other commands after this task finishes.\n\n');
      turnInput.setContext?.(this.getContext());
      return true;
    } });
    this.subagents.onChange = () => turnInput.setAgents?.(this.subagents.list_agents().agents);
    turnInput.start();
    turnInput.setContext?.(this.getContext());
    const watch = () => turnInput.active ? () => {} : watchCancellation(controller);
    const appendQueued = () => {
      const messages = turnInput.drain();
      for (const content of messages) {
        this.session.addMessage({ role: 'user', content });
        write(chatMessage('user', content, { queued: true }) + '\n');
      }
      return messages.length;
    };
    const catalogController = new AbortController();
    let activeToolSpinner;
    const toolsPrompt = this.promptManager ? Object.create(this.promptManager) : null;
    if (toolsPrompt) toolsPrompt.confirm = (...args) => this.subagents.withApproval(async () => {
      if (args[2]?.signal?.aborted) return false;
      spinner.stop();
      activeToolSpinner?.stop();
      turnInput.suspend();
      approvalActive = true;
      process.stdout.poliApprovalActive = true;
      try { return await this.promptManager.confirm(...args); }
      finally {
        approvalActive = false;
        delete process.stdout.poliApprovalActive;
        if (approvalOutput) { process.stdout.write(approvalOutput); approvalOutput = ''; }
        if (!controller.signal.aborted) { turnInput.start(); if (responsePending) spinner.start(); activeToolSpinner?.start(); }
      }
    });
    // Metadata must never delay inference. Chat does not need a tool catalog.
    if (this.config.mode !== 'chat' && this.modelInfo?.id !== this.config.model && typeof this.client.listModels === 'function') {
      const selectedModel = this.config.model;
      Promise.resolve().then(() => this.client.listModels({ signal: AbortSignal.any([controller.signal, catalogController.signal]) }))
        .then(models => {
          if (!catalogController.signal.aborted && this.config.model === selectedModel) this.modelInfo = models.find(m => m.id === selectedModel) || null;
        }).catch(() => { /* Inference works when the catalog is unavailable. */ });
    }
    try {
      // Continue until the model finishes or the user stops the turn. No step cap.
      while (!controller.signal.aborted) {
        const agentMode = this.config.mode !== 'chat';
        const context = this.getContext({raw:true});
        if (context.limitTokens && context.usedTokens + context.outputReserve > context.limitTokens * 0.85 && this.session.compact?.()) {
          log(style.dim('Compacted older turns · full records remain searchable with search_history.'));
        }
        turnInput.setContext?.(this.getContext());
        let bridge = agentMode && (this.modelInfo?.capabilities?.tools === false || this.bridgeModels.has(this.config.model));
        let streamed = '', first = true, malformedOutput = false;
        const output = new MarkdownStream(write, {
          transform: text => {
            if (!agentMode) return text;
            if (malformedOutput) return '';
            const parsed = parseBridgeCalls(text);
            malformedOutput = parsed.protocolError;
            return parsed.content;
          },
        });
        const beginResponse = () => {
          if (!first) return;
          first = false;
          if (turnInput.active) spinner.update('Responding…');
          else spinner.stop();
          write('\n' + style.poliBrand() + '\n');
        };
        const chunks = chunk => {
          if (chunk.type === 'content') {
            streamed += chunk.text;
            beginResponse();
            output.push(chunk.text);
          } else if (first && chunk.type === 'reasoning') spinner.update('Thinking…');
          else if (first && chunk.type === 'connected') spinner.update('Generating response…');
          else if (first && chunk.type === 'tool') spinner.update('Preparing action…');
        };
        const request = () => this.client.createChatCompletion({
          model: this.config.model,
          ...this.requestContext(bridge),
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
          stream: this.config.stream !== false && this.modelInfo?.capabilities?.streaming !== false,
          onChunk: chunks,
          signal: controller.signal,
        });
        spinner.start('Waiting for model…');
        let response;
        responsePending = true;
        const stopWatching = watch();
        try {
          try { response = await withSignal(request(), controller.signal); }
          catch (error) {
            // Retry only an explicit unsupported-tools rejection, before any text.
            if (!streamed && agentMode && !bridge && unsupportedTools(error)) {
              bridge = true;
              this.bridgeModels.add(this.config.model);
              spinner.update('Using local tool bridge · Ctrl+C / Esc stop');
              response = await withSignal(request(), controller.signal);
            } else if (!streamed && contextError(error)) {
              this.session.compact?.();
              this.historyBudgetTokens = Math.max(2048,Math.floor(this.getContext().usedTokens / 2));
              spinner.update('Shortening earlier results · full history remains searchable');
              response = await withSignal(request(), controller.signal);
            } else throw error;
          }
        } catch (error) {
          output.end();
          if (streamed) this.session.addMessage({ role: 'assistant', content: streamed });
          throw error;
        } finally { responsePending = false; stopWatching(); spinner.stop(); }
        if (!streamed && response.message?.content) { beginResponse(); output.push(response.message.content); }
        output.end();
        if (response.usage) this.session.recordUsage(response.usage);
        this.session.recordContextUsage?.(response.usage, this.config.model);
        const message = response.message || {};
        let content = message.content || streamed || '';
        let calls = message.tool_calls || [];
        let protocolError = false;
        if (agentMode) {
          const parsed = parseBridgeCalls(content);
          content = parsed.content;
          protocolError = parsed.protocolError;
          calls = combineToolCalls(calls, parsed.calls);
        }
        if (!agentMode) calls = [];
        if (agentMode && !calls.length && !formatRepaired && (protocolError || /tool\s*call\s*:\s*(?:view_file|list_dir|run_command|edit_file|write_file|grep_search|file_search)\b|(?:can't|cannot|don't|do not|no).{0,50}(?:access.{0,30}(?:file|tool|workspace)|read.{0,20}(?:local|file))|(?:cannot|can't|don't|do not).{0,30}(?:read|edit|execute|run).{0,25}(?:files?|commands?)/i.test(content))) {
          formatRepaired = true;
          this.bridgeModels.add(this.config.model);
          this.session.addMessage({ role: 'assistant', content });
          this.session.addMessage({ role: 'user', content: 'Local tool protocol error: your attempted tool call was NOT executed because it used the wrong format. Emit a dedicated ```poli-tool fenced block containing {"name":"tool_name","arguments":{...}} with the exact schema parameter names from the system instructions. Then wait for the tool result. Do not ask the user to execute it.' });
          continue;
        }
        if (!calls.length && protocolError) {
          this.lastTurnFailed = true;
          log(style.yellow('The model could not format its tool request. No action was executed. Try /retry or select another model with /models.'));
          this.session.addMessage({ role: 'assistant', content: 'Tool request failed: no action was executed.' });
          break;
        }
        if (!calls.length) {
          this.session.addMessage({ role: 'assistant', content });
          if (!content.trim()) {
            this.lastTurnFailed = true;
            log(style.yellow('No answer returned. Try /retry or choose another model with /models.'));
          }
          if (response.finishReason === 'length') log(style.dim('Response reached the model output limit. Use /retry to continue.'));
          if (this.subagents.unread().length) {
            const id = 'wait_' + crypto.randomBytes(5).toString('hex');
            this.session.addMessage({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'wait_agent', arguments: '{}' } }] });
            const waitSpinner = new Spinner('Waiting for subagents…', process.stdout).start();
            let result;
            try { result = await this.subagents.wait_agent({}, { signal: controller.signal }); }
            catch (error) { result = { rejected: controller.signal.aborted, ...(controller.signal.aborted ? { message: 'Turn stopped before subagent results were collected.' } : { error: error.message }) }; }
            finally { waitSpinner.stop(); }
            this.session.addMessage({ role: 'tool', name: 'wait_agent', tool_call_id: id, content: JSON.stringify(result) });
            write('\n' + toolCard({name:'wait_agent',status:result.rejected?'rejected':result.error?'error':'success',result}) + '\n');
            continue;
          }
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
                session: this.session,
                subagents: this.subagents,
                workspaceDir: this.session.workspaceDir,
                promptManager: toolsPrompt,
                turnInput,
                autoApprove: this.config.autoApprove,
                permission: permissionLevel(this.config),
                controller,
                signal: controller.signal,
                cancelTurn: cancel,
                onStart: () => toolSpinner.start(toolActivity(name, args)),

              });
            } catch (error) { result = { error: error.message }; }
            finally { toolSpinner.stop(); if (activeToolSpinner === toolSpinner) activeToolSpinner = null; }
          }
          actions++;
          if (result == null) result = { error: 'Tool returned no result. Try the tool again with valid arguments.' };
          const status = result?.rejected ? 'rejected' : result?.error || result?.exit_code > 0 || result?.timed_out ? 'error' : 'success';
          write(`\n${toolCard({ name, args, status, result, elapsedMs: Date.now() - toolStart })}\n`);
          this.session.addMessage({ role: 'tool', tool_call_id: call.id, name, content: JSON.stringify(result ?? { error: 'Tool returned no result.' }) });
          this.session.save();
        }
        appendQueued();
      }
      if (controller.signal.aborted) log(style.yellow('\nStopped. Your conversation is kept. Send a new task or use /retry.'));
      else if (actions) log(style.dim(`${actions} ${actions === 1 ? 'tool call' : 'tool calls'} · ${((Date.now() - started) / 1000).toFixed(1)}s`));
      return { cancelled: controller.signal.aborted };
    } catch (error) {
      spinner.stop();
      this.lastTurnFailed = true;
      if (controller.signal.aborted) { log(style.yellow('\nStopped. Send a new message or use /retry.')); return { cancelled: true }; }
      log(style.red(`\n${error.message}`));
      log(style.dim('Use /retry to try again, /models to change model, or keep chatting.\n'));
      return { error: error.message };
    } finally {
      // Tear down pending child approvals before the REPL creates a new input.
      // A finished turn must never restart its old composer from a late callback.
      controller.abort();
      this.subagents.onChange = null;
      this.subagents.cancelRunning();
      if (approvalActive) {
        let timer;
        await Promise.race([this.subagents.approvals,new Promise(resolve=>{timer=setTimeout(resolve,100);})]);
        clearTimeout(timer);
        approvalActive = false;
        delete process.stdout.poliApprovalActive;
        if (approvalOutput) { process.stdout.write(approvalOutput); approvalOutput = ''; }
      }
      catalogController.abort();
      spinner.stop();
      // Keep submitted follow-ups even when the active request fails or is stopped.
      appendQueued();
      if (this.promptManager) this.promptManager.draft = turnInput.draft();
      turnInput.close();
      signal?.removeEventListener('abort', cancel);
      process.removeListener('SIGINT', cancel);
      this.session.save();
      if (this.session.saveError) console.log(style.yellow(`Could not save this conversation: ${this.session.saveError}`));
    }
  }
}
