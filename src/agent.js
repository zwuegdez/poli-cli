// Agentic loop orchestrator
import { ALL_TOOLS, executeTool } from './tools/index.js';
import { Spinner } from './ui/spinner.js';
import { colors, style, symbols, toolCard } from './ui/theme.js';
import { renderMarkdown } from './ui/markdown.js';

export class PoliAgent {
  constructor({ client, session, config, promptManager }) {
    this.client = client;
    this.session = session;
    this.config = config;
    this.promptManager = promptManager;
    this.maxSteps = 25; // Prevent runaway loops
  }

  async runTurn(userInput) {
    if (userInput) {
      this.session.addMessage({ role: 'user', content: userInput });
    }

    let step = 0;
    const spinner = new Spinner();

    while (step < this.maxSteps) {
      step++;
      let streamedAssistantText = '';
      let isFirstChunk = true;
      let streamedRawLines = 0;

      // Call LLM via Router
      spinner.start(`Thinking (${this.config.model})...`);

      let response;
      try {
        response = await this.client.createChatCompletion({
          model: this.config.model,
          messages: this.session.messages,
          tools: ALL_TOOLS,
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
          stream: true,
          onChunk: (chunk) => {
            if (chunk.type === 'content') {
              if (isFirstChunk) {
                spinner.stop();
                isFirstChunk = false;
              }
              process.stdout.write(chunk.text);
              streamedAssistantText += chunk.text;
              if (chunk.text.includes('\n')) {
                streamedRawLines += (chunk.text.match(/\n/g) || []).length;
              }
            }
          }
        });
      } catch (err) {
        spinner.fail(`Router request failed: ${err.message}`);
        return { error: err.message };
      }

      spinner.stop();
      if (streamedAssistantText) {
        // Clear raw stream output if it fits, else just append
        const terminalHeight = process.stdout.rows || 24;
        const totalLines = streamedRawLines + (streamedAssistantText.length / 80);
        if (totalLines < terminalHeight - 3) {
          // erase up the number of lines
          // wait, erase up is tricky if line wrap happened. Let's just print the markdown directly!
          // Actually, it's safer to just print a small separator
        }
        
        // We will just clear line by line for streamedRawLines (rough approx)
        if (totalLines < terminalHeight - 3) {
          process.stdout.write(`\x1b[${Math.floor(totalLines)}A\x1b[0J`);
        } else {
          process.stdout.write('\n\n'); // Fallback separator
        }

        const formatted = renderMarkdown(streamedAssistantText);
        const boxLines = [
          `\n${colors.dim}╭─ ${colors.bold}${colors.brightCyan}✦ poli-code${colors.reset} ${colors.dim}(${this.config.model}) ${'─'.repeat(Math.max(2, 50))}╮${colors.reset}`,
          ...formatted.split('\n').map(l => `${colors.dim}│${colors.reset} ${l}`),
          `${colors.dim}╰${'─'.repeat(Math.max(2, 70))}╯${colors.reset}\n`
        ];
        process.stdout.write(boxLines.join('\n') + '\n');
      }

      const { message, usage } = response;
      if (usage) {
        this.session.recordUsage(usage);
      }

      // Check if model called tools
      const toolCalls = message?.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        // No tool calls - turn finished!
        this.session.addMessage({
          role: 'assistant',
          content: message.content || streamedAssistantText || ''
        });
        this.session.save();
        break;
      }

      // Record assistant message with tool calls
      this.session.addMessage({
        role: 'assistant',
        content: message.content || (streamedAssistantText ? streamedAssistantText : null),
        tool_calls: toolCalls
      });

      // Execute each tool call
      for (const tc of toolCalls) {
        const fnName = tc.function?.name;
        let fnArgs = {};
        try {
          fnArgs = JSON.parse(tc.function?.arguments || '{}');
        } catch {
          fnArgs = { raw: tc.function?.arguments };
        }

        const toolStart = Date.now();
        const toolSpinner = new Spinner(`Executing ${fnName}...`).start();

        const toolContext = {
          workspaceDir: this.session.workspaceDir,
          promptManager: this.promptManager,
          autoApprove: this.config.autoApprove
        };

        const result = await executeTool(fnName, fnArgs, toolContext);
        const elapsed = Date.now() - toolStart;

        if (result?.error) {
          toolSpinner.fail(`${fnName} error: ${result.error}`);
        } else if (result?.rejected) {
          toolSpinner.info(`${fnName} cancelled by user`);
        } else {
          toolSpinner.succeed(`${fnName} completed (${elapsed}ms)`);
        }

        // Output clean tool summary card
        const card = toolCard({
          name: fnName,
          args: fnArgs,
          status: result?.error ? 'error' : 'success',
          elapsedMs: elapsed
        });
        process.stdout.write(`\n${card}\n\n`);

        // Add tool result to session messages
        this.session.addMessage({
          role: 'tool',
          tool_call_id: tc.id,
          name: fnName,
          content: JSON.stringify(result)
        });
      }

      // Loop continues with tool results fed back to LLM!
    }

    if (step >= this.maxSteps) {
      process.stdout.write(`\n${colors.yellow}⚠️ Step limit reached (${this.maxSteps} steps).${colors.reset}\n`);
    }

    this.session.save();
  }
}
