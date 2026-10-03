// Command: poli models
import { loadConfig, saveConfig } from '../config.js';
import { loadCredentials } from '../auth.js';
import { PoliClient } from '../client.js';
import { colors, style, box } from '../ui/theme.js';
import { Spinner } from '../ui/spinner.js';

export async function cmdModels(selectModel = null) {
  const config = loadConfig();
  const creds = loadCredentials();

  if (!creds?.apiKey) {
    process.stderr.write(`${colors.red}Error: No API key found. Run "poli login" first.${colors.reset}\n`);
    return 1;
  }

  const client = new PoliClient({ baseUrl: config.baseUrl, apiKey: creds.apiKey });
  const spinner = new Spinner('Fetching available models from router...').start();

  let models;
  try {
    models = await client.listModels();
    spinner.succeed(`Retrieved ${models.length} available model(s)`);
  } catch (err) {
    spinner.fail(`Failed to fetch models: ${err.message}`);
    return 1;
  }

  // Sanitize: providers are strictly private
  const sanitizedModels = models.map(m => {
    const { provider, ...clean } = m;
    return clean;
  });

  if (selectModel) {
    const exists = sanitizedModels.some(m => m.id === selectModel);
    if (!exists) {
      process.stderr.write(`\n${colors.yellow}Notice: "${selectModel}" was not in the catalog, but setting it anyway.${colors.reset}\n`);
    }
    saveConfig({ model: selectModel });
    process.stdout.write(`\n${colors.green}✔ Active model set to:${colors.reset} ${colors.bold}${colors.brightCyan}${selectModel}${colors.reset}\n\n`);
    return 0;
  }

  const rows = [];
  rows.push(`${colors.bold}Available Frontier Models${colors.reset}\n`);

  for (const m of sanitizedModels) {
    const isCurrent = m.id === config.model;
    const marker = isCurrent ? `${colors.brightGreen}➜ [ACTIVE]${colors.reset} ` : '           ';
    const nameStr = `${colors.bold}${colors.brightCyan}${m.id.padEnd(28)}${colors.reset}`;

    const caps = [];
    if (m.capabilities?.streaming) caps.push('streaming');
    if (m.capabilities?.tools) caps.push('agent-tools');
    const capStr = caps.length ? `${colors.dim}(${caps.join(', ')})${colors.reset}` : '';

    rows.push(`  ${marker}${nameStr} ${capStr}`);
  }

  rows.push('');
  rows.push(`${colors.dim}To switch model: ${colors.cyan}poli models <name>${colors.reset} ${colors.dim}or inside chat type ${colors.yellow}/model <name>${colors.reset}`);

  process.stdout.write('\n' + box('Model Catalog', rows.join('\n'), { borderColor: colors.brightCyan }) + '\n\n');
  return 0;
}
