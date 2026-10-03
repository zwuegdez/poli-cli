// CLI Argument Parser and Command Router
import { cmdChat } from './commands/chat.js';
import { cmdLogin } from './commands/login.js';
import { cmdLogout } from './commands/logout.js';
import { cmdStatus } from './commands/status.js';
import { cmdModels } from './commands/models.js';
import { cmdConfig } from './commands/config.js';
import { colors, style, section } from './ui/theme.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

export function printHelp() {
  const content = [
    'Your coding assistant, right in the terminal.',
    '',
    `${style.bold('Start')}        poli`,
    `${style.bold('Ask')}          poli "fix the failing tests"`,
    '',
    style.bold('Commands'),
    'login         Sign in or configure an API key',
    'logout        Clear stored credentials',
    'models [name] Browse models or choose a default',
    'resume [id]   Continue a saved conversation',
    'status        Check your connection',
    'config        View or update settings',
    '',
    style.bold('Options'),
    '-m, --model <name>  Choose a model for this session',
    '-p, --prompt <text> Run one task and exit',
    '--chat              Chat without workspace tools',
    '--agent             Use workspace tools (default)',
    '-y, --yes           Automatically approve actions',
    '--base-url <url>    Use a custom endpoint',
    '-v, --version       Show version',
    '-h, --help          Show help',
    '',
    style.dim('Inside a session: / commands · ↑↓ history · Tab complete'),
  ].join('\n');
  process.stdout.write('\n' + section(`poli / v${pkg.version}`, content) + '\n\n');
}

export function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {
    model: null,
    mode: null,
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
    } else if (a === '--chat' || a === '--agent') {
      flags.mode = a.slice(2);
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
    process.stdout.write(`poli v${pkg.version}\n`);
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
    case 'resume':
      return await cmdChat(null, { resume: positional[1] || true, model: flags.model, mode: flags.mode, baseUrl: flags.baseUrl, yes: flags.yes });
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
        mode: flags.mode,
        baseUrl: flags.baseUrl,
        yes: flags.yes
      });
  }
}
