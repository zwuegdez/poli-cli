// Public CLI entrypoint. Do not load authentication, tools, or model clients.
import { showComingSoon } from './release-status.js';

export async function runCli() {
  return showComingSoon();
}
