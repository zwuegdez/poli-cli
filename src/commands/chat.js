// Interactive Chat REPL and One-Shot Runner
import { loadConfig, saveConfig, getHistoryPath } from '../config.js';
import { loadCredentials } from '../auth.js';
import { PoliClient } from '../client.js';
import { Session } from '../session.js';
import { PoliAgent } from '../agent.js';
import { getSystemPrompt } from '../system-prompt.js';
import { PromptManager } from '../ui/prompt.js';
import { banner, colors, style, box } from '../ui/theme.js';
import { cmdModels } from './models.js';
import { execSync } from 'node:child_process';

export async function cmdChat(initialPrompt = null, options = {}) {
  const config = loadConfig();

  // Override options
  if (options.model) config.model = options.model;
  if (options.baseUrl) config.baseUrl = options.baseUrl;
  if (options.yes) config.autoApprove = true;

  const creds = loadCredentials();
  if (!creds?.apiKey) {
    process.stderr.write(`${colors.red}No API key found. Run "poli login" first.${colors.reset}\n`);
    return 1;
  }

  const client = new PoliClient({
    baseUrl: config.baseUrl,
    apiKey: creds.apiKey
  });

  const promptManager = new PromptManager({
    historyFile: getHistoryPath()
  });

  const workspaceDir = process.cwd();
  const session = new Session({ workspaceDir });

  // Initialize session with rich system prompt
  const sysPrompt = getSystemPrompt({ workspaceDir, model: config.model });
  session.addMessage({ role: 'system', content: sysPrompt });

  const agent = new PoliAgent({
    client,
    session,
    config,
    promptManager
  });

  // If one-shot prompt was provided via command line:
  if (initialPrompt && initialPrompt.trim()) {
    process.stdout.write(`\n${colors.brightCyan}✦ poli${colors.reset} ${colors.dim}› ${initialPrompt}${colors.reset}\n\n`);
    await agent.runTurn(initialPrompt.trim());
    return 0;
  }

  // Interactive REPL Mode
  process.stdout.write('\n' + banner({
    model: config.model,
    cwd: workspaceDir,
    proxy: 'poli-proxy',
    status: 'connected'
  }) + '\n');

  while (true) {
    const input = await promptManager.promptUser({ model: config.model });
    const trimmed = input ? input.trim() : '';

    if (!trimmed) continue;

    // Handle Slash Commands
    if (trimmed.startsWith('/')) {
      const parts = trimmed.split(' ');
      const cmd = parts[0].toLowerCase();
      const arg = parts.slice(1).join(' ').trim();

      if (cmd === '/exit' || cmd === '/quit' || cmd === '/q') {
        process.stdout.write(`\n${colors.dim}Goodbye! Happy coding with Poli.${colors.reset}\n\n`);
        break;
      }

      if (cmd === '/help' || cmd === '/?') {
        printReplHelp();
        continue;
      }

      if (cmd === '/clear') {
        session.clear();
        session.addMessage({ role: 'system', content: getSystemPrompt({ workspaceDir, model: config.model }) });
        process.stdout.write(`\n${colors.green}✔ Conversation context cleared.${colors.reset}\n\n`);
        continue;
      }

      if (cmd === '/compact') {
        session.compact();
        process.stdout.write(`\n${colors.green}✔ Context compacted.${colors.reset} Messages retained: ${session.messages.length}\n\n`);
        continue;
      }

      if (cmd === '/model') {
        if (!arg) {
          process.stdout.write(`\nCurrent model: ${colors.bold}${colors.brightGreen}${config.model}${colors.reset}\n`);
          process.stdout.write(`Use ${colors.cyan}/model <name>${colors.reset} or ${colors.cyan}/models${colors.reset} to switch.\n\n`);
        } else {
          config.model = arg;
          saveConfig({ model: arg });
          process.stdout.write(`\n${colors.green}✔ Active model switched to:${colors.reset} ${colors.bold}${colors.brightCyan}${arg}${colors.reset}\n\n`);
        }
        continue;
      }

      if (cmd === '/models') {
        await cmdModels();
        continue;
      }

      if (cmd === '/history') {
        printHistory(session);
        continue;
      }

      if (cmd === '/diff') {
        showGitDiff(workspaceDir);
        continue;
      }

      if (cmd === '/run') {
        if (!arg) {
          process.stdout.write(`${colors.red}Usage: /run <command>${colors.reset}\n`);
        } else {
          runDirectCommand(arg, workspaceDir);
        }
        continue;
      }

      if (cmd === '/status') {
        printSessionStatus(session, config);
        continue;
      }

      process.stdout.write(`${colors.red}Unknown command: ${cmd}. Type /help for available commands.${colors.reset}\n`);
      continue;
    }

    // Agent turn
    process.stdout.write('\n');
    await agent.runTurn(trimmed);
  }

  return 0;
}

function printReplHelp() {
  const content = [
    `${colors.bold}Available Commands:${colors.reset}`,
    `  ${colors.yellow}/help${colors.reset}           Show this help menu`,
    `  ${colors.yellow}/model [name]${colors.reset}   View or switch the active LLM model`,
    `  ${colors.yellow}/models${colors.reset}         List all available models from proxy`,
    `  ${colors.yellow}/clear${colors.reset}          Clear current conversation history`,
    `  ${colors.yellow}/compact${colors.reset}        Compress and summarize conversation context`,
    `  ${colors.yellow}/status${colors.reset}         Show token usage and session statistics`,
    `  ${colors.yellow}/diff${colors.reset}           View uncommitted workspace git diff`,
    `  ${colors.yellow}/run <cmd>${colors.reset}      Execute a shell command directly`,
    `  ${colors.yellow}/exit, /quit${colors.reset}    Exit Poli-code`,
    ``,
    `${colors.dim}Tips: End a line with backslash \\ to type multiple lines before sending.${colors.reset}`
  ].join('\n');

  process.stdout.write('\n' + box('Commands', content) + '\n\n');
}

function printHistory(session) {
  process.stdout.write(`\n${colors.bold}Conversation History (${session.messages.length} messages):${colors.reset}\n\n`);
  for (const m of session.messages) {
    if (m.role === 'system') continue;
    const roleColor = m.role === 'user' ? colors.brightCyan : (m.role === 'assistant' ? colors.brightGreen : colors.magenta);
    const content = typeof m.content === 'string' ? (m.content.slice(0, 100) + (m.content.length > 100 ? '...' : '')) : '[tool calls/output]';
    process.stdout.write(`  ${roleColor}${m.role.toUpperCase().padEnd(10)}${colors.reset} ${content}\n`);
  }
  process.stdout.write('\n');
}

function showGitDiff(cwd) {
  try {
    const diff = execSync('git diff', { cwd, encoding: 'utf8', timeout: 5000 });
    if (!diff.trim()) {
      process.stdout.write(`\n${colors.green}Working directory is clean. No git changes.${colors.reset}\n\n`);
    } else {
      process.stdout.write(`\n${diff}\n\n`);
    }
  } catch (err) {
    process.stderr.write(`Failed to get git diff: ${err.message}\n`);
  }
}

function runDirectCommand(cmd, cwd) {
  try {
    process.stdout.write(`\n${colors.dim}$ ${cmd}${colors.reset}\n`);
    const output = execSync(cmd, { cwd, encoding: 'utf8', stdio: 'inherit' });
  } catch (err) {
    // stdio inherit already prints output
  }
  process.stdout.write('\n');
}

function printSessionStatus(session, config) {
  const content = [
    `${colors.dim}Session ID:${colors.reset}        ${session.id}`,
    `${colors.dim}Model:${colors.reset}             ${config.model}`,
    `${colors.dim}Workspace:${colors.reset}         ${session.workspaceDir}`,
    `${colors.dim}Total Messages:${colors.reset}    ${session.messages.length}`,
    `${colors.dim}Prompt Tokens:${colors.reset}     ${session.tokenStats.promptTokens.toLocaleString()}`,
    `${colors.dim}Completion Tokens:${colors.reset} ${session.tokenStats.completionTokens.toLocaleString()}`,
    `${colors.dim}Total Tokens:${colors.reset}      ${session.tokenStats.totalTokens.toLocaleString()}`
  ].join('\n');

  process.stdout.write('\n' + box('Session Info', content) + '\n\n');
}
