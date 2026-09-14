import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  formatDivergenceResult,
  inspectDivergences,
  parseDivergences,
  REGISTRY_PATH,
} from './check-engine-divergences.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const divergences = parseDivergences(
  readFileSync(path.join(projectRoot, ...REGISTRY_PATH.split('/')), 'utf8'),
);
const fileExists = (file: string) => existsSync(path.join(projectRoot, ...file.split('/')));
const readFile = (file: string) => readFileSync(path.join(projectRoot, ...file.split('/')), 'utf8');
const base = { divergences, fileExists, readFile };

describe('team builder engine divergences', () => {
  it('accepts the record as it stands', () => {
    const result = inspectDivergences(base);

    expect(result.errors).toEqual([]);
    expect(result.total).toBeGreaterThan(3);
    expect(formatDivergenceResult(result)).toContain('still unreviewed');
  });

  it('names at least one difference nobody has decided', () => {
    /*
     * The point of the record is to separate design from drift. If every entry
     * were `deliberate`, it would be describing a codebase where every
     * difference was chosen - which was not true when this was written, and
     * would be a suspiciously tidy claim if it ever became so.
     */
    expect(inspectDivergences(base).unreviewedCount).toBeGreaterThan(0);
  });

  it('goes red when a cited symbol stops existing', () => {
    const result = inspectDivergences({
      ...base,
      readFile: (file) => readFile(file).replaceAll('RumbleTeamSlot', 'RenamedAwayFromTheRecord'),
    });

    expect(result.errors.join('\n')).toContain('no longer contains it');
    expect(result.errors.join('\n')).toContain('outlived the code');
  });

  it('goes red when a cited file is gone', () => {
    const result = inspectDivergences({ ...base, fileExists: () => false });

    expect(result.errors.join('\n')).toContain('no longer exists');
  });

  it('goes red on a deliberate difference with no decision', () => {
    const result = inspectDivergences({
      ...base,
      divergences: divergences.map((divergence) =>
        divergence.id === 'ship-selection' ? { ...divergence, decision: undefined } : divergence,
      ),
    });

    expect(result.errors.join('\n')).toContain('marked deliberate with no decision');
  });

  it('goes red on an unreviewed difference that carries a decision', () => {
    const result = inspectDivergences({
      ...base,
      divergences: divergences.map((divergence) =>
        divergence.status === 'unreviewed'
          ? { ...divergence, decision: 'Somebody decided after all.' }
          : divergence,
      ),
    });

    expect(result.errors.join('\n')).toContain('marked unreviewed but carries a decision');
  });

  it('goes red on a difference with no evidence at all', () => {
    const result = inspectDivergences({
      ...base,
      divergences: divergences.map((divergence, index) =>
        index === 0 ? { ...divergence, evidence: [] } : divergence,
      ),
    });

    expect(result.errors.join('\n')).toContain('cites no evidence');
  });

  it('rejects a placeholder description', () => {
    const result = inspectDivergences({
      ...base,
      divergences: divergences.map((divergence, index) =>
        index === 0 ? { ...divergence, quest: 'it differs' } : divergence,
      ),
    });

    expect(result.errors.join('\n')).toContain('needs a real quest');
  });

  it('reports an unreadable record instead of passing on nothing', () => {
    expect(parseDivergences('export const SOMETHING_ELSE = [];')).toEqual([]);
    expect(inspectDivergences({ ...base, divergences: [] }).errors.join('\n')).toContain(
      'could not be read',
    );
  });

  it('keeps the correction this record was written to make', () => {
    /*
     * The task arrived saying the quest engine does not score. It does - it
     * sorts candidates by `recencyScore`. What it does not do is put a number
     * on the CHOSEN slot or show one. That distinction is the whole entry, and
     * losing it would re-open the argument the record exists to close.
     */
    const scoring = divergences.find(
      (divergence) => divergence.id === 'per-slot-score-shown-to-the-reader',
    );

    expect(scoring?.quest).toContain('recencyScore');
    expect(scoring?.rumble).toContain('export and import');
    expect(scoring?.status).toBe('deliberate');
  });
});
