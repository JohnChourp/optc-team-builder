import { describe, expect, it } from 'vitest';

import { buildDocument } from './generate-import-pipeline.mjs';
import {
  READERLESS_DATA_FILE_REASONS,
  findUnexplainedDataFiles,
  readDataFileReaders,
  readImportStages,
  stripComments,
} from './lib/import-pipeline.mjs';

/**
 * 869f138r4. The census must not read itself.
 *
 * `READERLESS_DATA_FILE_REASONS` names the very files it explains, so without excluding the census's
 * own source every readerless file quietly becomes read - which is exactly what the first run
 * reported: zero readerless files, against one that is genuinely read by nobody. That case has its
 * own test because it is invisible in the output when it is wrong.
 */

describe('readImportStages', () => {
  const SOURCE = `
    function helperOne() {}
    async function helperTwo() {}
    function unused() {}

    async function main() {
      helperOne();
      const x = await helperTwo();
      JSON.parse(x);
    }
  `;

  it('lists the importer functions main calls, and nothing else', () => {
    expect(readImportStages(SOURCE)).toEqual(['helperOne', 'helperTwo']);
  });

  it('does not list a function declared but never called by main', () => {
    expect(readImportStages(SOURCE)).not.toContain('unused');
  });

  it('does not list a built-in that is not an importer stage', () => {
    expect(readImportStages(SOURCE)).not.toContain('JSON');
    expect(readImportStages(SOURCE)).not.toContain('parse');
  });

  it('returns nothing when there is no main to read', () => {
    expect(readImportStages('function other() {}')).toEqual([]);
  });
});

describe('findUnexplainedDataFiles', () => {
  it('says nothing when every file has a reader', () => {
    expect(
      findUnexplainedDataFiles({
        dataFiles: [{ name: 'a.json', readerCount: 2, readerlessReason: null }],
      } as never),
    ).toEqual([]);
  });

  it('says nothing when a readerless file has a recorded reason', () => {
    expect(
      findUnexplainedDataFiles({
        dataFiles: [{ name: 'a.json', readerCount: 0, readerlessReason: 'a person reads it' }],
      } as never),
    ).toEqual([]);
  });

  it('catches a readerless file nobody has explained', () => {
    const [finding] = findUnexplainedDataFiles({
      dataFiles: [{ name: 'orphan.json', readerCount: 0, readerlessReason: null }],
    } as never);

    expect(finding.kind).toBe('data-file-with-no-reader');
    expect(finding.name).toBe('orphan.json');
  });
});

describe('the real census', () => {
  it('does not count a mention inside a comment as a reader', () => {
    /*
     * The second thing this got wrong: ci-check-routing.mjs explains in a COMMENT why the template
     * is readerless, and the census counted that comment as a reader - so the guard would have
     * stopped firing the moment somebody documented it.
     */
    expect(stripComments("const a = 1; // reads manual-character-template.json")).not.toContain(
      'manual-character-template.json',
    );
    expect(stripComments("/* manual-character-template.json */ const b = 2;")).not.toContain(
      'manual-character-template.json',
    );
    expect(stripComments("readFile('manual-character-template.json')")).toContain(
      'manual-character-template.json',
    );
  });

  it('keeps a URL intact rather than mistaking it for a comment', () => {
    expect(stripComments("const url = 'https://example.com/a.json';")).toContain('https://example.com/a.json');
  });

  it('does not count its own explanation as a reader', () => {
    const files = readDataFileReaders('.');
    const template = files.find((file) => file.name === 'manual-character-template.json');

    /*
     * The bug this test exists for: the reasons map names this file, so a census that scanned its
     * own source would report it as read and the guard would never fire again.
     */
    expect(template?.readers).toEqual([]);
  });

  it('finds the readers of a file that really has them', () => {
    const files = readDataFileReaders('.');
    const manual = files.find((file) => file.name === 'manual-characters.json');

    expect(manual?.readers.length).toBeGreaterThan(1);
    expect(manual?.readers.some((reader) => reader.startsWith('scripts/'))).toBe(true);
  });

  it('explains the one file no code reads', () => {
    const document = buildDocument();

    expect(document.readerlessDataFileCount).toBe(1);
    expect(READERLESS_DATA_FILE_REASONS['manual-character-template.json']).toContain('by hand');
    expect(findUnexplainedDataFiles(document)).toEqual([]);
  });

  it('records the format decision instead of leaving it to be re-opened', () => {
    const document = buildDocument();

    expect(document.formatDecision).toContain('diffable');
    expect(document.formatDecision).toContain('869f138q7');
  });

  it('matches the committed document', async () => {
    const { readFile } = await import('node:fs/promises');
    const committed = JSON.parse(await readFile('docs/import-pipeline.json', 'utf8'));

    expect(committed).toEqual(JSON.parse(JSON.stringify(buildDocument())));
  });

  it('lists stages the importer really declares', async () => {
    const { readFile } = await import('node:fs/promises');
    const importer = await readFile('scripts/import-optc-data.mjs', 'utf8');
    const document = buildDocument();

    expect(document.stages.length).toBeGreaterThan(10);

    for (const stage of document.stages) {
      expect(importer).toMatch(new RegExp(`function\\s+${stage}\\s*\\(`, 'u'));
    }
  });
});
