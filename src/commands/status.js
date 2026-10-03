// Command: poli status
import { loadConfig } from '../config.js';
import { loadCredentials, maskKey, getCredentialsPath } from '../auth.js';
import { colors, style, box } from '../ui/theme.js';

export async function cmdStatus() {
  const config = loadConfig();
  const creds = loadCredentials();

  let proxyHealthy = false;
  let modelsAvailable = 0;
  let activeService = 'unknown';

  try {
    const healthUrl = config.baseUrl.replace(/\/v1$/, '') + '/health';
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      proxyHealthy = true;
      activeService = data.service || 'poli-proxy';
    }
  } catch {}

  if (creds?.apiKey) {
    try {
      const modelsUrl = `${config.baseUrl}/models`;
      const res = await fetch(modelsUrl, {
        headers: { Authorization: `Bearer ${creds.apiKey}` },
        signal: AbortSignal.timeout(4000)
      });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        modelsAvailable = Array.isArray(body?.data) ? body.data.length : (Array.isArray(body) ? body.length : 0);
      }
    } catch {}
  }

  const lines = [
    `${colors.bold}Poli-code Status${colors.reset}`,
    ``,
    `${colors.dim}Active Model:${colors.reset}       ${colors.brightGreen}${config.model}${colors.reset}`,
    `${colors.dim}Inference Base:${colors.reset}     ${colors.cyan}${config.baseUrl}${colors.reset}`,
    `${colors.dim}Proxy Service:${colors.reset}      ${proxyHealthy ? colors.green + '● Online' : colors.red + '○ Offline'} ${colors.gray}(${activeService})${colors.reset}`,
    `${colors.dim}API Key Status:${colors.reset}     ${creds?.apiKey ? colors.green + 'Configured' : colors.yellow + 'Not set'} ${colors.dim}[${maskKey(creds?.apiKey)}]${colors.reset}`,
    `${colors.dim}Credentials File:${colors.reset}   ${colors.gray}${creds?.source || getCredentialsPath()}${colors.reset}`,
    `${colors.dim}Available Models:${colors.reset}   ${colors.yellow}${modelsAvailable}${colors.reset} ${colors.dim}models ready${colors.reset}`,
    `${colors.dim}Auto-approve:${colors.reset}       ${config.autoApprove ? colors.yellow + 'Enabled (-y)' : colors.gray + 'Disabled (prompt for changes)'}${colors.reset}`,
    `${colors.dim}Workspace:${colors.reset}          ${colors.gray}${process.cwd()}${colors.reset}`
  ];

  process.stdout.write('\n' + box('System Status', lines.join('\n')) + '\n\n');
  return 0;
}
