// Command: poli login
import readline from 'node:readline';
import { saveCredentials, maskKey, getCredentialsPath } from '../auth.js';
import { loadConfig, saveConfig, DEFAULT_REMOTE_BASE_URL, DEFAULT_LOCAL_BASE_URL } from '../config.js';
import { colors, style } from '../ui/theme.js';

function promptLine(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function promptHidden(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Mute stdout for hidden input
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdout.write(promptText);

    let input = '';
    const onData = (char) => {
      char = char + '';
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.removeListener('data', onData);
          break;
        case '\u0003':
          process.exit();
          break;
        default:
          input += char;
          break;
      }
    };

    stdin.on('data', onData);

    rl.question('', () => {
      stdout.write('\n');
      rl.close();
      resolve(input.trim());
    });
  });
}

export async function cmdLogin(flags = {}) {
  process.stdout.write(`\n${colors.bold}${colors.brightCyan}✦ Poli-code Authentication${colors.reset}\n\n`);

  let apiKey = flags.apiKey || process.env.POLIAI_API_KEY || '';

  if (!apiKey) {
    apiKey = await promptHidden(`${colors.yellow}Enter your PoliAI API Key (hidden):${colors.reset} `);
  }

  if (!apiKey) {
    process.stderr.write(`${colors.red}Error: No API key provided.${colors.reset}\n`);
    return 1;
  }

  let baseUrl = flags.baseUrl;
  if (!baseUrl) {
    const cur = loadConfig().baseUrl || DEFAULT_LOCAL_BASE_URL;
    const ans = await promptLine(`${colors.dim}Inference Base URL [${cur}]:${colors.reset} `);
    baseUrl = ans || cur;
  }

  const savedPath = saveCredentials({
    apiKey,
    baseUrl,
    loginMethod: 'manual'
  });

  saveConfig({ baseUrl });

  process.stdout.write(`\n${colors.green}✔ Credentials successfully saved!${colors.reset}\n`);
  process.stdout.write(`  ${colors.dim}Key:${colors.reset}  ${maskKey(apiKey)}\n`);
  process.stdout.write(`  ${colors.dim}URL:${colors.reset}  ${baseUrl}\n`);
  process.stdout.write(`  ${colors.dim}File:${colors.reset} ${savedPath}\n\n`);
  process.stdout.write(`You can now run ${colors.cyan}poli${colors.reset} to start coding!\n\n`);

  return 0;
}
