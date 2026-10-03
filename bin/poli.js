#!/usr/bin/env node

// Poli-code CLI entrypoint
import { runCli } from '../src/cli.js';

runCli(process.argv)
  .then((code) => {
    process.exit(code ?? 0);
  })
  .catch((err) => {
    process.stderr.write(`\nFatal error: ${err?.stack || err}\n`);
    process.exit(1);
  });
