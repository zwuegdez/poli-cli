// Agentic loop orchestrator
import { ALL_TOOLS, executeTool } from './tools/index.js';
import { Spinner } from './ui/spinner.js';
import { colors, style, symbols } from './ui/theme.js';
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

      // Call LLM
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
            }
          }
        });
      } catch (err) {
        spinner.fail(`LLM Request failed: ${err.message}`);
        return { error: err.message };
      }

      spinner.stop();
      if (streamedAssistantText && !streamedAssistantText.endsWith('\n')) {
        process.stdout.write('\n');
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

        const argsSummary = Object.entries(fnArgs)
          .map(([k, v]) => `${k}=${typeof v === 'string' ? (v.length > 25 ? v.slice(0, 22) + '...' : v) : JSON.stringify(v)}`)
          .join(', ');

        process.stdout.write(`\n${style.badge('TOOL', colors.bgMagenta)} ${colors.bold}${fnName}${colors.reset} ${colors.dim}(${argsSummary})${colors.reset}\n`);

        const toolSpinner = new Spinner(`Executing ${fnName}...`).start();

        const toolContext = {
          workspaceDir: this.session.workspaceDir,
          promptManager: this.promptManager,
          autoApprove: this.config.autoApprove
        };

        const result = await executeTool(fnName, fnArgs, toolContext);

        if (result?.error) {
          toolSpinner.fail(`${fnName} error: ${result.error}`);
        } else if (result?.rejected) {
          toolSpinner.info(`${fnName} cancelled by user`);
        } else {
          toolSpinner.succeed(`${fnName} done`);
        }

        // Add tool result to session messages
        this.session.addMessage({
          role: 'tool',
          tool_call_id: tc.id,
          name: fnName,
          content: JSON.stringify(result)
        });
      }

      // After tool execution, the loop continues to feed tool results back to LLM!
    }

    if (step >= this.maxSteps) {
      process.stdout.write(`\n${colors.yellow}⚠️ Step limit reached (${this.maxSteps} steps).${colors.reset}\n`);
    }

    this.session.save();
  }
}
