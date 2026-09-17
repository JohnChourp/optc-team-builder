#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { inspectModalLabels } from './lib/modal-dialog-labels.mjs';

/**
 * 869f138q3. No `<ion-modal>` ships without a name a screen reader can read.
 *
 * The rule and the measurement that produced it are in `scripts/lib/modal-dialog-labels.mjs`.
 *
 * Run: npm run a11y:modal-labels
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = path.join(APP_ROOT, 'src/app');

/** Inline `template:` in a component, so a modal declared there is checked the same way. */
function readInlineTemplate(source) {
  const marker = /template:\s*`/u.exec(source);

  if (!marker) {
    return null;
  }

  const start = marker.index + marker[0].length;
  const end = source.indexOf('`', start);

  return end < 0 ? null : source.slice(start, end);
}

export function inspectModalDialogLabels({ sourceRoot = SOURCE_ROOT } = {}) {
  const files = [];

  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  };

  walk(sourceRoot);

  const findings = [];
  let modalCount = 0;

  for (const filePath of files.sort()) {
    if (filePath.includes('.spec.')) {
      continue;
    }

    const relativePath = path.relative(APP_ROOT, filePath);

    if (filePath.endsWith('.html')) {
      const template = readFileSync(filePath, 'utf8');

      if (!template.includes('<ion-modal')) {
        continue;
      }

      const componentPath = filePath.replace(/\.html$/u, '.ts');
      const source = existsSync(componentPath) ? readFileSync(componentPath, 'utf8') : '';
      const result = inspectModalLabels({ filePath: relativePath, template, source });

      modalCount += (template.match(/<ion-modal\b/gu) ?? []).length;
      findings.push(...result);
      continue;
    }

    if (!filePath.endsWith('.ts')) {
      continue;
    }

    const source = readFileSync(filePath, 'utf8');

    if (!source.includes('<ion-modal')) {
      continue;
    }

    const template = readInlineTemplate(source);

    if (template === null || !template.includes('<ion-modal')) {
      continue;
    }

    modalCount += (template.match(/<ion-modal\b/gu) ?? []).length;
    findings.push(...inspectModalLabels({ filePath: relativePath, template, source }));
  }

  return { ok: findings.length === 0, findings, modalCount };
}

export function formatModalDialogLabelResult(result) {
  const lines = ['# Modal dialog label check', ''];

  lines.push(`Checked ${result.modalCount} <ion-modal> element(s).`, '');

  if (result.ok) {
    lines.push('Status: passed - every modal names its own dialog when it is presented.');
  } else {
    lines.push('Status: FAILED');

    for (const finding of result.findings) {
      lines.push(`- [${finding.kind}] ${finding.filePath}:${finding.line} - ${finding.detail}`);
    }
  }

  return lines.join('\n');
}

function main() {
  const result = inspectModalDialogLabels();

  console.log(formatModalDialogLabelResult(result));
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
