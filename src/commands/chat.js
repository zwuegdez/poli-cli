// Interactive Chat REPL and One-Shot Runner
import { loadConfig, saveConfig, getHistoryPath } from '../config.js';
import { loadCredentials } from '../auth.js';
import { PoliClient } from '../client.js';
import { Session } from '../session.js';
import { PoliAgent } from '../agent.js';
import { getSystemPrompt } from '../system-prompt.js';
import { PromptManager, COMMAND_LIST } from '../ui/prompt.js';
import { ALL_TOOLS } from '../tools/index.js';
import { toolDetails } from '../ui/tool-details.js';
import { renderMarkdown } from '../ui/markdown.js';
import { banner, colors, style, section, chatMessage, wrapText, terminalWidth } from '../ui/theme.js';
import { chooseModel } from './models.js';
import { selectChoice } from '../ui/select.js';
import { cmdConfig } from './config.js';
import { chooseSession } from './resume.js';
import { execSync } from 'node:child_process';

export async function cmdChat(initialPrompt = null, options = {}) {
  const config = loadConfig();

  // Override options
  if (options.model) config.model = options.model;
  if (options.mode) config.mode = options.mode;
  if (options.baseUrl) config.baseUrl = options.baseUrl;
  if (options.yes) config.autoApprove = true;

  const creds = loadCredentials();
  if (!creds?.apiKey) {
    process.stderr.write(`${colors.red}No API key found. Run "poli login" first.${colors.reset}\n`);
    return 1;
  }

  const client = new PoliClient({
    baseUrl: config.baseUrl,
    apiKey: creds.apiKey,
    timeoutMs: config.requestTimeoutMs
  });

  const promptManager = new PromptManager({
    historyFile: getHistoryPath()
  });

  const workspaceDir = process.cwd();
  const session = new Session({ workspaceDir });

  // Get git branch if present
  let gitBranch = '';
  try {
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', {
      cwd: workspaceDir,
      encoding: 'utf8',
      timeout: 1000,
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
  } catch {}

  // Initialize session with rich system prompt
  const sysPrompt = getSystemPrompt({ workspaceDir, model: config.model, mode: config.mode });
  session.addMessage({ role: 'system', content: sysPrompt });

  const agent = new PoliAgent({
    client,
    session,
    config,
    promptManager
  });

  const resume = async id => {
    try {
      const selected = await chooseSession({ session, id });
      if (!selected) return false;
      // Validate before saving or replacing the current conversation.
      Session.read(selected, workspaceDir);
      if (session.messages.some(message => message.role === 'user')) session.save();
      session.restore(selected);
      const currentPrompt = getSystemPrompt({ workspaceDir, model: config.model, mode: config.mode });
      if (session.messages[0]?.role === 'system') session.messages[0].content = currentPrompt;
      else session.messages.unshift({ role: 'system', content: currentPrompt });
      console.log(style.green(`Resumed ${session.id} · ${session.messages.filter(message => message.role === 'user').length} turns`));
      const last = session.messages.findLast(message => message.role === 'assistant' && message.content);
      if (last) console.log(style.bold('poli:') + '\n' + renderMarkdown(String(last.content)) + '\n');
      return true;
    } catch (error) { console.log(style.red(`Could not resume: ${error.message}`)); return false; }
  };

  // If one-shot prompt was provided via command line:
  if (initialPrompt && initialPrompt.trim()) {
    process.stdout.write(chatMessage('user', initialPrompt.trim()) + '\n');
    const result = await agent.runTurn(initialPrompt.trim());
    return result.error ? 1 : result.cancelled ? 130 : 0;
  }

  // Interactive Full-Terminal REPL Mode
  renderFullTerminalHeader({
    model: config.model,
    cwd: workspaceDir,
    endpoint: config.baseUrl,
    autoApprove: config.autoApprove,
    mode: config.mode,
    branch: gitBranch
  });

  if (options.resume && !await resume(options.resume)) return options.resume === true ? 0 : 1;

  while (true) {
    const input = await promptManager.promptUser({
      model: config.model,
      mode: config.mode,
      tokens: session.tokenStats.totalTokens
    });
    const trimmed = input ? input.trim() : '';

    if (!trimmed) continue;

    // Handle Slash Commands
    if (trimmed.startsWith('/') || trimmed === '?') {
      const parts = trimmed.split(' ');
      const rawCmd = parts[0].toLowerCase();
      const arg = parts.slice(1).join(' ').trim();

      // Show command palette for `/`, `/?`, or `/help`
      if (rawCmd === '/' || rawCmd === '/?' || rawCmd === '/help' || rawCmd === '?') {
        printCommandPalette();
        continue;
      }

      if (rawCmd === '/exit' || rawCmd === '/quit' || rawCmd === '/q') {
        process.stdout.write(`${colors.dim}Goodbye!${colors.reset}\n`);
        break;
      }

      if (rawCmd === '/clear') {
        session.clear();
        session.messages[0] = { role: 'system', content: getSystemPrompt({ workspaceDir, model: config.model, mode: config.mode }) };
        process.stdout.write(`\n${colors.green}✔ Conversation context cleared.${colors.reset}\n\n`);
        continue;
      }

      if (rawCmd === '/compact') {
        session.compact();
        process.stdout.write(`\n${colors.green}✔ Context compacted.${colors.reset} Retained: ${session.messages.length} messages\n\n`);
        continue;
      }

      if (rawCmd === '/models' || rawCmd === '/model') {
        const model = await chooseModel({ client, config });
        if (model) {
          config.model = model.id;
          agent.setModel(model);
          saveConfig({ model: model.id });
          session.messages[0] = { role: 'system', content: getSystemPrompt({ workspaceDir, model: model.id, mode: config.mode }) };
          process.stdout.write(`\n${style.green('✓')} Active model: ${style.bold(model.id)}\n\n`);
        }
        continue;
      }

      if (rawCmd === '/mode') {
        const mode = await selectChoice({ title: 'How should poli help?', current: config.mode || 'agent', choices: [
          { value: 'agent', label: 'Agent', description: 'Chat, inspect files, edit code, and run commands with approvals.' },
          { value: 'chat', label: 'Chat', description: 'Conversation only. No workspace tools.' },
        ] });
        if (mode) {
          config.mode = mode;
          saveConfig({ mode });
          session.messages[0] = { role: 'system', content: getSystemPrompt({ workspaceDir, model: config.model, mode }) };
          console.log(`\n${style.green('✓')} ${mode === 'chat' ? 'Chat' : 'Agent'} mode\n`);
        }
        continue;
      }

      if (rawCmd === '/retry' || rawCmd === '/continue') {
        // Continue the pending turn after errors, cancellation, or output truncation.
        const last = session.messages.at(-1);
        await agent.runTurn(last?.role === 'assistant' ? 'Continue your previous answer or unfinished task.' : null);
        continue;
      }

      if (rawCmd === '/tools') {
        printToolsList();
        continue;
      }

      if (rawCmd === '/details') {
        process.stdout.write('\n' + toolDetails(session.messages, arg ? Number(arg) : 1) + '\n\n');
        continue;
      }

      if (rawCmd === '/resume') {
        await resume(arg || true);
        continue;
      }

      if (rawCmd === '/history') {
        printHistory(session);
        continue;
      }

      if (rawCmd === '/diff') {
        showGitDiff(workspaceDir);
        continue;
      }

      if (rawCmd === '/run') {
        if (!arg) {
          process.stdout.write(`\n${colors.red}Usage: /run <command>${colors.reset}\n\n`);
        } else {
          runDirectCommand(arg, workspaceDir);
        }
        continue;
      }

      if (rawCmd === '/status') {
        printSessionStatus(session, config, gitBranch);
        continue;
      }

      if (rawCmd === '/tokens' || rawCmd === '/cost') {
        printTokensBreakdown(session);
        continue;
      }

      if (rawCmd === '/config') {
        const sub = parts[1];
        cmdConfig(sub, parts[2], parts[3]);
        continue;
      }

      // Check aliases in COMMAND_LIST
      const found = COMMAND_LIST.find(c => c.cmd === rawCmd || (c.alias && c.alias.includes(rawCmd)));
      if (!found) {
        process.stdout.write(`\n${colors.red}Unknown command: ${rawCmd}${colors.reset} ${colors.dim}(Type ${colors.yellow}/${colors.dim} or ${colors.yellow}/help${colors.dim} to see all commands)${colors.reset}\n\n`);
        continue;
      }
    }

    // Render user input card
    renderUserCard(trimmed);

    // Agent turn
    await agent.runTurn(trimmed);
  }

  return 0;
}

function renderFullTerminalHeader(info = {}) {
  process.stdout.write('\n' + banner(info) + '\n\n');
}

function renderUserCard(text) {
  process.stdout.write(chatMessage('user', text) + '\n');
}

export function printCommandPalette() {
  const rows = [];

  // Group by category
  const categories = {};
  for (const c of COMMAND_LIST) {
    if (!categories[c.category]) categories[c.category] = [];
    categories[c.category].push(c);
  }

  for (const [cat, items] of Object.entries(categories)) {
    rows.push(style.dim(cat));
    for (const item of items) {
      const cmdStr = `${colors.bold}${colors.brightCyan}${item.cmd}${colors.reset}` + (item.args ? ` ${colors.dim}${item.args}${colors.reset}` : '');
      const label = item.cmd + (item.args ? ' ' + item.args : '');
      if (terminalWidth() >= 65) rows.push(`  ${cmdStr}${' '.repeat(Math.max(2, 26 - label.length))}${style.dim(item.desc)}`);
      else {
        rows.push(`  ${cmdStr}`);
        rows.push(...wrapText(item.desc, Math.max(1, terminalWidth() - 8)).map(line => `    ${style.dim(line)}`));
      }
    }
    rows.push('');
  }

  rows.push(`${colors.dim}Type any slash command directly in the prompt or use arrow keys when typing / to select.${colors.reset}`);

  process.stdout.write('\n' + section('Slash Commands', rows.join('\n')) + '\n\n');
}

function printToolsList() {
  const rows = [
    `${colors.bold}Available tools:${colors.reset}\n`
  ];

  for (const t of ALL_TOOLS) {
    const fn = t.function;
    rows.push(`  ${colors.bold}${colors.brightMagenta}⚡ ${fn.name}${colors.reset}`);
    rows.push(`     ${colors.dim}${fn.description}${colors.reset}`);
    const params = Object.keys(fn.parameters?.properties || {}).join(', ');
    if (params) {
      rows.push(`     ${colors.gray}Parameters: ${params}${colors.reset}`);
    }
    rows.push('');
  }

  process.stdout.write('\n' + section('Agentic Tools', rows.join('\n')) + '\n\n');
}

function printHistory(session) {
  process.stdout.write(`\n${colors.bold}Conversation History (${session.messages.length} messages):${colors.reset}\n\n`);
  for (const m of session.messages) {
    if (m.role === 'system') continue;
    const roleColor = m.role === 'user'
      ? colors.brightCyan
      : (m.role === 'assistant' ? colors.brightGreen : colors.magenta);
    const roleName = m.role === 'tool' ? `TOOL (${m.name || 'res'})` : m.role.toUpperCase();
    const content = typeof m.content === 'string'
      ? (m.content.slice(0, 120) + (m.content.length > 120 ? '...' : ''))
      : (m.tool_calls ? `[called ${m.tool_calls.map(tc => tc.function?.name).join(', ')}]` : '[structured payload]');

    process.stdout.write(`  ${roleColor}${roleName.padEnd(14)}${colors.reset} ${content}\n`);
  }
  process.stdout.write('\n');
}

function showGitDiff(cwd) {
  try {
    const diff = execSync('git diff', { cwd, encoding: 'utf8', timeout: 5000 });
    if (!diff.trim()) {
      process.stdout.write(`\n${colors.green}✔ Working directory is clean. No uncommitted git changes.${colors.reset}\n\n`);
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
    execSync(cmd, { cwd, encoding: 'utf8', stdio: 'inherit' });
  } catch (err) {
    // stdio inherit already prints
  }
  process.stdout.write('\n');
}

function printSessionStatus(session, config, branch) {
  const content = [
    `${colors.dim}Session ID:${colors.reset}        ${session.id}`,
    `${colors.dim}Mode:${colors.reset}              ${config.mode === 'chat' ? 'Chat' : 'Agent'}`,
    `${colors.dim}Active Model:${colors.reset}      ${colors.brightGreen}${config.model}${colors.reset}`,
    `${colors.dim}Router Endpoint:${colors.reset}   ${colors.cyan}${config.baseUrl}${colors.reset}`,
    `${colors.dim}Workspace:${colors.reset}         ${session.workspaceDir}`,
    `${colors.dim}Git Branch:${colors.reset}        ${branch || '(none)'}`,
    `${colors.dim}Auto-approve:${colors.reset}      ${config.autoApprove ? colors.yellow + 'Yes (-y)' : colors.gray + 'No'}${colors.reset}`,
    `${colors.dim}Total Messages:${colors.reset}    ${session.messages.length}`,
    `${colors.dim}Total Tokens:${colors.reset}      ${colors.bold}${session.tokenStats.totalTokens.toLocaleString()}${colors.reset}`
  ].join('\n');

  process.stdout.write('\n' + section('Session Overview', content) + '\n\n');
}

function printTokensBreakdown(session) {
  const stats = session.tokenStats;
  const content = [
    `${colors.dim}Prompt Tokens:${colors.reset}     ${stats.promptTokens.toLocaleString()}`,
    `${colors.dim}Completion Tokens:${colors.reset} ${stats.completionTokens.toLocaleString()}`,
    `${colors.dim}Total Tokens:${colors.reset}      ${colors.bold}${colors.brightCyan}${stats.totalTokens.toLocaleString()}${colors.reset}`,
    ``,
    `${colors.dim}Usage reported by the router for this session.${colors.reset}`
  ].join('\n');

  process.stdout.write('\n' + section('Token Metrics', content) + '\n\n');
}
