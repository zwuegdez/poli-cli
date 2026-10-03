// Command: poli config
import { loadConfig, saveConfig, getConfigPath } from '../config.js';
import { colors } from '../ui/theme.js';

export function cmdConfig(subcommand, key, value) {
  const current = loadConfig();

  if (!subcommand || subcommand === 'list') {
    const formatted = Object.entries(current)
      .map(([k, v]) => `${colors.cyan}${k.padEnd(16)}${colors.reset}: ${colors.yellow}${JSON.stringify(v)}${colors.reset}`)
      .join('\n');
    process.stdout.write(`\nConfiguration (${getConfigPath()}):\n\n${formatted}\n\n`);
    return 0;
  }

  if (subcommand === 'get') {
    if (!key) {
      process.stderr.write(`${colors.red}Specify key to get: poli config get <key>${colors.reset}\n`);
      return 1;
    }
    process.stdout.write(`${JSON.stringify(current[key] ?? null)}\n`);
    return 0;
  }

  if (subcommand === 'set') {
    if (!key || value === undefined) {
      process.stderr.write(`${colors.red}Specify key and value: poli config set <key> <value>${colors.reset}\n`);
      return 1;
    }

    let parsedVal = value;
    if (value === 'true') parsedVal = true;
    else if (value === 'false') parsedVal = false;
    else if (!isNaN(Number(value)) && value.trim() !== '') parsedVal = Number(value);

    const updated = saveConfig({ [key]: parsedVal });
    process.stdout.write(`${colors.green}✔ Updated ${key} = ${JSON.stringify(parsedVal)}${colors.reset}\n`);
    return 0;
  }

  process.stderr.write(`Unknown config command: ${subcommand}. Use: list, get, set\n`);
  return 1;
}
