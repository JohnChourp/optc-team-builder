import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  compareVersionsDescending,
  formatWhatsNewResult,
  inspectWhatsNew,
  parseEntries,
} from './check-whats-new.mjs';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

function entry(overrides: Record<string, unknown> = {}) {
  return {
    version: '1.0.0',
    date: '2026-01-01',
    userVisible: true,
    headline: { en: 'A thing', el: 'Κάτι' },
    summaryEn: 'A sentence long enough to count as a real summary for a player.',
    summaryEl: 'Μια πρόταση αρκετά μεγάλη ώστε να μετράει ως πραγματική περίληψη.',
    added: [{ en: 'Added a thing', el: 'Προστέθηκε κάτι' }],
    improved: [],
    fixed: [],
    ...overrides,
  };
}

async function makeRoot(entries: unknown[], version = '1.0.0') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'optc-whats-new-'));
  tempDirs.push(root);
  await mkdir(path.join(root, 'src/app/core/data'), { recursive: true });
  await writeFile(
    path.join(root, 'src/app/core/data/whats-new.data.ts'),
    `export const WHATS_NEW_ENTRIES: readonly WhatsNewEntry[] = ${JSON.stringify(entries, null, 2)};\n`,
  );
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ version }));

  return root;
}

describe('check-whats-new', () => {
  it('accepts a complete, newest-first history', async () => {
    const appRoot = await makeRoot([entry({ version: '1.0.1' }), entry({ version: '1.0.0' })], '1.0.1');

    const result = inspectWhatsNew({ appRoot });

    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.entryCount).toBe(2);
  });

  /* The failure this guard exists for: a release that forgot its entry. */
  it('rejects a released version with no entry', async () => {
    const appRoot = await makeRoot([entry({ version: '1.0.0' })], '1.0.1');

    const result = inspectWhatsNew({ appRoot });

    expect(result.ok).toBe(false);
    expect(result.findings[0]?.kind).toBe('missing-released-version');
  });

  it('rejects entries that are not newest-first', async () => {
    const appRoot = await makeRoot([entry({ version: '1.0.0' }), entry({ version: '1.0.1' })], '1.0.1');

    const result = inspectWhatsNew({ appRoot });

    expect(result.findings.map((f) => f.kind)).toContain('out-of-order');
  });

  it('rejects an entry that speaks only one language', async () => {
    const appRoot = await makeRoot([entry({ summaryEl: '' })]);

    const result = inspectWhatsNew({ appRoot });

    expect(result.findings.map((f) => f.kind)).toContain('missing-copy');
  });

  it('rejects a bullet missing its Greek or English half', async () => {
    const appRoot = await makeRoot([entry({ added: [{ en: 'Only English', el: '' }] })]);

    const result = inspectWhatsNew({ appRoot });

    expect(result.findings.map((f) => f.kind)).toContain('missing-bullet-language');
  });

  it('rejects invented value on a release that changed nothing visible', async () => {
    const appRoot = await makeRoot([entry({ userVisible: false })]);

    const result = inspectWhatsNew({ appRoot });

    expect(result.findings.map((f) => f.kind)).toContain('quiet-release-with-bullets');
  });

  it('rejects a visible release that lists nothing a player would notice', async () => {
    const appRoot = await makeRoot([entry({ added: [], improved: [], fixed: [] })]);

    const result = inspectWhatsNew({ appRoot });

    expect(result.findings.map((f) => f.kind)).toContain('visible-release-without-bullets');
  });

  it('parses the array past its type annotation', () => {
    const source =
      'export const WHATS_NEW_ENTRIES: readonly WhatsNewEntry[] = [{"version":"1.0.0"}];\n';

    expect(parseEntries(source)).toEqual([{ version: '1.0.0' }]);
  });

  it('orders versions numerically, not as strings', () => {
    expect(['0.1.9', '0.1.20', '0.1.10'].sort(compareVersionsDescending)).toEqual([
      '0.1.20',
      '0.1.10',
      '0.1.9',
    ]);
  });

  it('reports what it checked', async () => {
    const appRoot = await makeRoot([entry()]);

    expect(formatWhatsNewResult(inspectWhatsNew({ appRoot }))).toContain('Status: passed');
  });
});
