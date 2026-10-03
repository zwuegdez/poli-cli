import { loadConfig, saveConfig } from '../config.js';
import { loadCredentials } from '../auth.js';
import { PoliClient } from '../client.js';
import { style, section } from '../ui/theme.js';
import { Spinner } from '../ui/spinner.js';
import { selectChoice } from '../ui/select.js';

export function modelChoices(models, failures = new Map()) {
  return models.filter(m => m?.id && m.capabilities?.chat !== false && !m.maintenance && !m.deprecated).map(m => ({
    value: m.id,
    label: m.id,
    description: failures.has(m.id) ? `Last request failed · ${failures.get(m.id)}` : `${m.capabilities?.tools === true ? 'Native tools' : m.capabilities?.tools === false ? 'Local tool bridge' : 'Automatic tool detection'}${m.capabilities?.streaming === false ? ' · full response' : ' · streaming'}`,
  }));
}

export async function chooseModel({ client, config, select = selectChoice }) {
  const spinner = new Spinner('Loading models…').start();
  try {
    const models = await client.listModels();
    spinner.stop();
    const choices = modelChoices(models, client.modelFailures);
    if (!choices.length) { console.log('\n' + section('Models', 'No chat models are currently available. Try again later.')); return null; }
    if (!process.stdin.isTTY && select === selectChoice) {
      console.log('\n' + section('Models', choices.map(c => `${c.value === config.model ? '✓' : '·'} ${c.label}\n  ${c.description}`).join('\n')) + '\n');
      return null;
    }
    const id = await select({ title: 'Choose a model', choices, current: config.model });
    return id ? models.find(m => m.id === id) : null;
  } catch (error) {
    spinner.fail(error.message);
    return null;
  }
}

export async function cmdModels(selectModel = null) {
  const config = loadConfig();
  const creds = loadCredentials();
  if (!creds?.apiKey) { console.error('Run "poli login" first.'); return 1; }
  const client = new PoliClient({ baseUrl: config.baseUrl, apiKey: creds.apiKey });
  let model;
  if (selectModel) {
    try {
      const models = await client.listModels();
      model = models.find(m => m.id === selectModel && modelChoices([m]).length);
      if (!model) { console.error(`Model "${selectModel}" is unavailable. Run poli models to choose one.`); return 1; }
    } catch (error) { console.error(error.message); return 1; }
  } else model = await chooseModel({ client, config });
  if (model) {
    saveConfig({ model: model.id });
    console.log(`\n${style.green('✓')} Active model: ${style.bold(model.id)}\n`);
  }
  return 0;
}
