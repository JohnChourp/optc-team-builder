#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { inspectAccessibleNames } from './lib/ionic-accessible-names.mjs';

/**
 * 869f13gaw / 869f13gbk. An Ionic control never hides a derived value behind a static label, and
 * never carries an aria-describedby that Ionic will silently discard.
 *
 * The two rules, and the measurement of Ionic's own source that produced them, are in
 * `scripts/lib/ionic-accessible-names.mjs`.
 *
 * Run: npm run a11y:accessible-names
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = path.join(APP_ROOT, 'src/app');

/**
 * Inline `template:` in a component. #595 repaired a checker that read only `.html` and so
 * undercounted five shared components for as long as their templates had been inline; this one
 * reads both from the start.
 */
function readInlineTemplate(source) {
  const marker = /template:\s*`/u.exec(source);

  if (!marker) {
    return null;
  }

  const start = marker.index + marker[0].length;
  const end = source.indexOf('`', start);

  return end < 0 ? null : source.slice(start, end);
}

export function inspectIonicAccessibleNames({ sourceRoot = SOURCE_ROOT } = {}) {
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
  let templateCount = 0;

  for (const filePath of files.sort()) {
    if (filePath.includes('.spec.')) {
      continue;
    }

    const relativePath = path.relative(APP_ROOT, filePath);

    if (filePath.endsWith('.html')) {
      templateCount += 1;
      findings.push(
        ...inspectAccessibleNames({ filePath: relativePath, template: readFileSync(filePath, 'utf8') }),
      );
      continue;
    }

    if (!filePath.endsWith('.ts')) {
      continue;
    }

    const template = readInlineTemplate(readFileSync(filePath, 'utf8'));

    if (template === null) {
      continue;
    }

    templateCount += 1;
    findings.push(...inspectAccessibleNames({ filePath: relativePath, template }));
  }

  return { ok: findings.length === 0, findings, templateCount };
}

export function formatAccessibleNameResult(result) {
  const lines = ['# Ionic accessible name check', ''];

  lines.push(`Checked ${result.templateCount} template(s), inline templates included.`, '');

  if (result.ok) {
    lines.push(
      'Status: passed - no Ionic control hides a derived value behind a static label, and none ' +
        'carries an aria-describedby Ionic would discard.',
    );
  } else {
    lines.push('Status: FAILED', '');

    for (const finding of result.findings) {
      lines.push(`- [${finding.rule}] ${finding.filePath} - ${finding.detail}`);
    }
  }

  return lines.join('\n');
}

function main() {
  const result = inspectIonicAccessibleNames();

  console.log(formatAccessibleNameResult(result));
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
