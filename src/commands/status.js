// Command: poli status
import { loadConfig } from '../config.js';
import { loadCredentials, maskKey, getCredentialsPath } from '../auth.js';
import { colors, style, box } from '../ui/theme.js';

export async function cmdStatus() {
  const config = loadConfig();
  const creds = loadCredentials();

  let routerOnline = false;
  let modelsAvailable = 0;

  try {
    const modelsUrl = `${config.baseUrl}/models`;
    const res = await fetch(modelsUrl, {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
      signal: AbortSignal.timeout(3500)
    });
    if (res.ok) {
      routerOnline = true;
      const body = await res.json().catch(() => ({}));
      modelsAvailable = Array.isArray(body?.data) ? body.data.length : (Array.isArray(body) ? body.length : 0);
    }
  } catch {}

  const lines = [
    `${colors.bold}${colors.brightCyan}Poli-code System Status${colors.reset}`,
    ``,
    `${colors.dim}Router Endpoint:${colors.reset}    ${colors.bold}${colors.cyan}${config.baseUrl}${colors.reset}`,
    `${colors.dim}Router Health:${colors.reset}      ${routerOnline ? colors.green + '● Online & Ready' : colors.yellow + '○ Checking / Standby'}${colors.reset}`,
    `${colors.dim}Active Model:${colors.reset}       ${colors.brightGreen}${config.model}${colors.reset}`,
    `${colors.dim}Catalog:${colors.reset}            ${colors.yellow}${modelsAvailable}${colors.reset} ${colors.dim}frontier models available${colors.reset}`,
    `${colors.dim}API Key Status:${colors.reset}     ${creds?.apiKey ? colors.green + 'Configured' : colors.yellow + 'Not set'} ${colors.dim}[${maskKey(creds?.apiKey)}]${colors.reset}`,
    `${colors.dim}Credentials File:${colors.reset}   ${colors.gray}${creds?.source || getCredentialsPath()}${colors.reset}`,
    `${colors.dim}Auto-approve:${colors.reset}       ${config.autoApprove ? colors.yellow + 'Enabled (-y)' : colors.gray + 'Disabled (interactive prompts)'}${colors.reset}`,
    `${colors.dim}Workspace:${colors.reset}          ${colors.gray}${process.cwd()}${colors.reset}`
  ];

  process.stdout.write('\n' + box('System Status', lines.join('\n'), { borderColor: colors.brightCyan }) + '\n\n');
  return 0;
}
