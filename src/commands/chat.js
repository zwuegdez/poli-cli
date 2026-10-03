// Interactive Chat REPL and One-Shot Runner
import { loadConfig, saveConfig, getHistoryPath } from '../config.js';
import { loadCredentials } from '../auth.js';
import { PoliClient } from '../client.js';
import { Session } from '../session.js';
import { PoliAgent } from '../agent.js';
import { getSystemPrompt } from '../system-prompt.js';
import { PromptManager, COMMAND_LIST } from '../ui/prompt.js';
import { ALL_TOOLS } from '../tools/index.js';
import { banner, colors, style, box } from '../ui/theme.js';
import { cmdModels } from './models.js';
import { cmdConfig } from './config.js';
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
    process.stdout.write(`\n${colors.bold}${colors.brightCyan}✦ poli${colors.reset} ${colors.dim}› ${initialPrompt}${colors.reset}\n\n`);
    await agent.runTurn(initialPrompt.trim());
    return 0;
  }

  // Interactive REPL Mode
  process.stdout.write('\n' + banner({
    model: config.model,
    cwd: workspaceDir,
    proxy: 'poli-proxy',
    status: 'connected',
    branch: gitBranch
  }) + '\n');

  while (true) {
    const input = await promptManager.promptUser({
      model: config.model,
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
        process.stdout.write(`\n${colors.dim}Goodbye! Happy coding with Poli.${colors.reset}\n\n`);
        break;
      }

      if (rawCmd === '/clear') {
        session.clear();
        session.addMessage({ role: 'system', content: getSystemPrompt({ workspaceDir, model: config.model }) });
        process.stdout.write(`\n${colors.green}✔ Conversation context cleared.${colors.reset}\n\n`);
        continue;
      }

      if (rawCmd === '/compact') {
        session.compact();
        process.stdout.write(`\n${colors.green}✔ Context compacted.${colors.reset} Retained: ${session.messages.length} messages\n\n`);
        continue;
      }

      if (rawCmd === '/model') {
        if (!arg) {
          process.stdout.write(`\n${colors.dim}Current model:${colors.reset} ${colors.bold}${colors.brightGreen}${config.model}${colors.reset}\n`);
          process.stdout.write(`${colors.dim}Switch model:${colors.reset}  ${colors.cyan}/model <name>${colors.reset} ${colors.dim}or type${colors.reset} ${colors.yellow}/models${colors.reset}\n\n`);
        } else {
          config.model = arg;
          saveConfig({ model: arg });
          process.stdout.write(`\n${colors.green}✔ Active model switched to:${colors.reset} ${colors.bold}${colors.brightCyan}${arg}${colors.reset}\n\n`);
        }
        continue;
      }

      if (rawCmd === '/models') {
        await cmdModels();
        continue;
      }

      if (rawCmd === '/tools') {
        printToolsList();
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

    // Agent turn
    process.stdout.write('\n');
    await agent.runTurn(trimmed);
  }

  return 0;
}

export function printCommandPalette() {
  const width = Math.min(process.stdout.columns || 80, 80);
  const h = '─';

  const rows = [];
  rows.push(`${colors.bold}${colors.brightCyan}✦ POLI-CODE COMMAND PALETTE${colors.reset}\n`);

  // Group by category
  const categories = {};
  for (const c of COMMAND_LIST) {
    if (!categories[c.category]) categories[c.category] = [];
    categories[c.category].push(c);
  }

  for (const [cat, items] of Object.entries(categories)) {
    rows.push(`${colors.bold}${colors.yellow}${cat.toUpperCase()}${colors.reset}`);
    for (const item of items) {
      const cmdStr = `${colors.bold}${colors.brightCyan}${item.cmd}${colors.reset}` + (item.args ? ` ${colors.dim}${item.args}${colors.reset}` : '');
      const pad = 30 - item.cmd.length - (item.args ? item.args.length + 1 : 0);
      const padding = ' '.repeat(Math.max(2, pad));
      const aliasStr = item.alias ? ` ${colors.gray}(alias: ${item.alias.join(', ')})${colors.reset}` : '';
      rows.push(`  ${cmdStr}${padding}${colors.white}${item.desc}${colors.reset}${aliasStr}`);
    }
    rows.push('');
  }

  rows.push(`${colors.dim}Tip: End any prompt line with backslash \\ to type multiple lines before sending.${colors.reset}`);

  process.stdout.write('\n' + box('Slash Commands', rows.join('\n'), { borderColor: colors.brightCyan }) + '\n\n');
}

function printToolsList() {
  const rows = [
    `${colors.bold}Active Agent Tools in Poli-code:${colors.reset}\n`
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

  process.stdout.write('\n' + box('Agentic Tools', rows.join('\n')) + '\n\n');
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
    `${colors.dim}Active Model:${colors.reset}      ${colors.brightGreen}${config.model}${colors.reset}`,
    `${colors.dim}Inference Base:${colors.reset}    ${colors.cyan}${config.baseUrl}${colors.reset}`,
    `${colors.dim}Workspace:${colors.reset}         ${session.workspaceDir}`,
    `${colors.dim}Git Branch:${colors.reset}        ${branch || '(none)'}`,
    `${colors.dim}Auto-approve:${colors.reset}      ${config.autoApprove ? colors.yellow + 'Yes (-y)' : colors.gray + 'No'}${colors.reset}`,
    `${colors.dim}Total Messages:${colors.reset}    ${session.messages.length}`,
    `${colors.dim}Total Tokens:${colors.reset}      ${colors.bold}${session.tokenStats.totalTokens.toLocaleString()}${colors.reset}`
  ].join('\n');

  process.stdout.write('\n' + box('Session Overview', content) + '\n\n');
}

function printTokensBreakdown(session) {
  const stats = session.tokenStats;
  const content = [
    `${colors.dim}Prompt Tokens:${colors.reset}     ${stats.promptTokens.toLocaleString()}`,
    `${colors.dim}Completion Tokens:${colors.reset} ${stats.completionTokens.toLocaleString()}`,
    `${colors.dim}Total Tokens:${colors.reset}      ${colors.bold}${colors.brightCyan}${stats.totalTokens.toLocaleString()}${colors.reset}`,
    ``,
    `${colors.dim}Estimated Cost:${colors.reset}    ${colors.green}$0.00 (included with poli-proxy)${colors.reset}`
  ].join('\n');

  process.stdout.write('\n' + box('Token Metrics', content) + '\n\n');
}
