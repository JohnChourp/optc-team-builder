#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { inspectPickerDismissal } from './lib/shared-picker-dismissal.mjs';

/**
 * 869f138pv. Every shared picker closes the same way.
 *
 * The contract, and what it deliberately leaves alone, are in
 * `scripts/lib/shared-picker-dismissal.mjs`.
 *
 * Run: npm run shared:picker-dismissal
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHARED_ROOT = path.join(APP_ROOT, 'src/app/shared');

export function inspectSharedPickerDismissal({ sharedRoot = SHARED_ROOT } = {}) {
  const findings = [];
  let pickerCount = 0;

  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith('.html') || entry.name.includes('.spec.')) {
        continue;
      }

      const template = readFileSync(entryPath, 'utf8');

      if (!template.includes('<ion-modal')) {
        continue;
      }

      pickerCount += 1;

      const componentPath = entryPath.replace(/\.html$/u, '.ts');
      const source = existsSync(componentPath) ? readFileSync(componentPath, 'utf8') : '';

      findings.push(
        ...inspectPickerDismissal({
          filePath: path.relative(APP_ROOT, entryPath),
          template,
          source,
        }),
      );
    }
  };

  walk(sharedRoot);

  return { ok: findings.length === 0, findings, pickerCount };
}

export function formatSharedPickerDismissalResult(result) {
  const lines = ['# Shared picker dismissal check', ''];

  lines.push(`Checked ${result.pickerCount} shared picker(s).`, '');

  if (result.ok) {
    lines.push(
      'Status: passed - every shared picker treats a backdrop close exactly as Cancel, and an explicit close once.',
    );
  } else {
    lines.push('Status: FAILED');

    for (const finding of result.findings) {
      lines.push(`- [${finding.kind}] ${finding.filePath} - ${finding.detail}`);
    }
  }

  return lines.join('\n');
}

function main() {
  const result = inspectSharedPickerDismissal();

  console.log(formatSharedPickerDismissalResult(result));
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
