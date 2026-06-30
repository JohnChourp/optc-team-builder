#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

import { loadQuarantineConfig } from './lib/playwright-quarantine.mjs';

export async function runCli(io = console) {
  const result = await loadQuarantineConfig();

  if (result.failures.length > 0) {
    io.error(`[e2e:quarantine] found ${result.failures.length} quarantine metadata issue(s):`);
    for (const failure of result.failures) {
      io.error(`- ${failure}`);
    }
    return 1;
  }

  io.log(`[e2e:quarantine] ${result.entries.length} active quarantine entr${result.entries.length === 1 ? 'y' : 'ies'} validated.`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(`[e2e:quarantine] ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
