// CLI Argument Parser and Command Router
import { cmdChat } from './commands/chat.js';
import { cmdLogin } from './commands/login.js';
import { cmdLogout } from './commands/logout.js';
import { cmdStatus } from './commands/status.js';
import { cmdModels } from './commands/models.js';
import { cmdConfig } from './commands/config.js';
import { colors, style } from './ui/theme.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

export function printHelp() {
  process.stdout.write(`
${colors.bold}${colors.brightCyan}poli-code${colors.reset} — Agentic AI Coding Assistant CLI powered by ${colors.brightMagenta}poli-proxy${colors.reset}
Version: ${pkg.version}

${colors.bold}USAGE:${colors.reset}
  poli [command] [options]
  poli "your coding task prompt"
  poli -p "refactor server.js"

${colors.bold}COMMANDS:${colors.reset}
  ${colors.yellow}(default)${colors.reset}        Launch interactive agentic coding REPL
  ${colors.yellow}login${colors.reset}            Sign in or set your PoliAI proxy key and inference URL
  ${colors.yellow}logout${colors.reset}           Clear stored PoliAI credentials
  ${colors.yellow}status${colors.reset}           Check connection, proxy health, and configuration
  ${colors.yellow}models${colors.reset} [name]    List models from proxy or switch active model
  ${colors.yellow}config${colors.reset}           View or modify local configuration settings

${colors.bold}OPTIONS:${colors.reset}
  ${colors.cyan}-m, --model <name>${colors.reset}       Set model for this session (e.g. gpt-6.1-sol, claude-fable-5-1, grok-4.7)
  ${colors.cyan}-p, --prompt <text>${colors.reset}      Execute a single instruction and exit
  ${colors.cyan}-y, --yes${colors.reset}                Auto-approve file changes and shell command executions
  ${colors.cyan}--base-url <url>${colors.reset}        Set custom proxy base URL
  ${colors.cyan}-v, --version${colors.reset}            Show version number
  ${colors.cyan}-h, --help${colors.reset}               Show this help message

${colors.bold}EXAMPLES:${colors.reset}
  poli                                     Start interactive session
  poli "find and fix memory leaks in src"  Autonomous coding task
  poli -m grok-4.7                         Start session with Grok model
  poli models                              List all available models on proxy
  poli status                              Verify proxy health and API keys
`);
}

export function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {
    model: null,
    prompt: null,
    baseUrl: null,
    yes: false,
    help: false,
    version: false
  };
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];

    if (a === '-h' || a === '--help') {
      flags.help = true;
    } else if (a === '-v' || a === '--version') {
      flags.version = true;
    } else if (a === '-y' || a === '--yes') {
      flags.yes = true;
    } else if (a === '-m' || a === '--model') {
      flags.model = args[++i];
    } else if (a.startsWith('--model=')) {
      flags.model = a.slice('--model='.length);
    } else if (a === '-p' || a === '--prompt') {
      flags.prompt = args[++i];
    } else if (a.startsWith('--prompt=')) {
      flags.prompt = a.slice('--prompt='.length);
    } else if (a === '--base-url') {
      flags.baseUrl = args[++i];
    } else if (a.startsWith('--base-url=')) {
      flags.baseUrl = a.slice('--base-url='.length);
    } else if (a.startsWith('-')) {
      throw new Error(`Unknown option: ${a}`);
    } else {
      positional.push(a);
    }
  }

  return { flags, positional };
}

export async function runCli(argv = process.argv) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${colors.red}Error: ${err.message}${colors.reset}\n`);
    printHelp();
    return 1;
  }

  const { flags, positional } = parsed;

  if (flags.version) {
    process.stdout.write(`poli-code v${pkg.version}\n`);
    return 0;
  }

  if (flags.help) {
    printHelp();
    return 0;
  }

  const primary = positional[0];

  switch (primary) {
    case 'login':
      return await cmdLogin({ baseUrl: flags.baseUrl });
    case 'logout':
      return cmdLogout();
    case 'status':
      return await cmdStatus();
    case 'models':
      return await cmdModels(positional[1]);
    case 'config':
      return cmdConfig(positional[1], positional[2], positional[3]);
    case 'help':
      printHelp();
      return 0;
    default:
      // If positional arguments exist, treat them as a prompt!
      const prompt = flags.prompt || (positional.length > 0 ? positional.join(' ') : null);
      return await cmdChat(prompt, {
        model: flags.model,
        baseUrl: flags.baseUrl,
        yes: flags.yes
      });
  }
}
