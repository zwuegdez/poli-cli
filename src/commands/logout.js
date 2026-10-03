// Command: poli logout
import { clearCredentials, getCredentialsPath } from '../auth.js';
import { colors } from '../ui/theme.js';

export function cmdLogout() {
  const cleared = clearCredentials();
  if (cleared) {
    process.stdout.write(`\n${colors.green}✔ Credentials cleared at ${getCredentialsPath()}${colors.reset}\n\n`);
  } else {
    process.stdout.write(`\n${colors.yellow}No active credentials file found to remove.${colors.reset}\n\n`);
  }
  return 0;
}
