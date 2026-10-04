// Test-only runner for the unreleased implementation. Public launchers stay paused.
import { runInternalCli } from '../../src/cli-runtime.js';

try {
  process.exitCode = await runInternalCli(process.argv);
} catch (error) {
  process.stderr.write(`Fatal error: ${error.message}\n`);
  process.exitCode = 1;
}
