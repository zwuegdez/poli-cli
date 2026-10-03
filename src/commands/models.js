// Command: poli models
import { loadConfig, saveConfig } from '../config.js';
import { loadCredentials } from '../auth.js';
import { PoliClient } from '../client.js';
import { colors, style } from '../ui/theme.js';
import { Spinner } from '../ui/spinner.js';

export async function cmdModels(selectModel = null) {
  const config = loadConfig();
  const creds = loadCredentials();

  if (!creds?.apiKey) {
    process.stderr.write(`${colors.red}Error: No API key found. Run "poli login" first.${colors.reset}\n`);
    return 1;
  }

  const client = new PoliClient({ baseUrl: config.baseUrl, apiKey: creds.apiKey });
  const spinner = new Spinner('Fetching models from proxy...').start();

  let models;
  try {
    models = await client.listModels();
    spinner.succeed(`Fetched ${models.length} model(s) from ${config.baseUrl}`);
  } catch (err) {
    spinner.fail(`Failed to fetch models: ${err.message}`);
    return 1;
  }

  if (selectModel) {
    const exists = models.some(m => m.id === selectModel);
    if (!exists) {
      process.stderr.write(`\n${colors.yellow}Warning: "${selectModel}" was not returned in the models list, but setting it anyway.${colors.reset}\n`);
    }
    saveConfig({ model: selectModel });
    process.stdout.write(`\n${colors.green}✔ Active model set to:${colors.reset} ${colors.bold}${colors.brightCyan}${selectModel}${colors.reset}\n\n`);
    return 0;
  }

  process.stdout.write(`\n${colors.bold}Available Models on ${config.baseUrl}:${colors.reset}\n\n`);

  for (const m of models) {
    const isCurrent = m.id === config.model;
    const marker = isCurrent ? `${colors.brightGreen}➜ [ACTIVE]${colors.reset}` : '          ';
    const nameStr = `${colors.bold}${m.id}${colors.reset}`;
    const providerStr = m.provider?.name ? `${colors.dim}(${m.provider.name})${colors.reset}` : '';
    const caps = [];
    if (m.capabilities?.streaming) caps.push('stream');
    if (m.capabilities?.tools) caps.push('tools');
    const capStr = caps.length ? `${colors.gray}[${caps.join(', ')}]${colors.reset}` : '';

    process.stdout.write(`  ${marker} ${nameStr} ${providerStr} ${capStr}\n`);
  }

  process.stdout.write(`\n${colors.dim}To switch model: ${colors.cyan}poli models <model_name>${colors.reset} ${colors.dim}or inside chat type ${colors.yellow}/model <name>${colors.reset}\n\n`);
  return 0;
}
