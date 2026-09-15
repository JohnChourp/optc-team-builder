import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DRIFT_TOLERANCE,
  EARLY_WARNING_SHARE,
  compareWithBaseline,
  parseBudgetOutput,
  parseBudgetSize,
  readAnyComponentStyleBudget,
} from './check-component-style-budget.mjs';

/**
 * 869f135rr. The check's whole value is that it fires BEFORE Angular does, so the
 * tests that matter are the ones about the gap between 70% and 100%.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const BUDGET = { warningBytes: 12_000, errorBytes: 20_000 };

function baselineOf(entries: { file: string; compiledBytes: number }[]) {
  return { stylesheets: entries };
}

describe('parseBudgetOutput', () => {
  it('reads Angular size lines in every unit it prints', () => {
    const measured = parseBudgetOutput(
      [
        '▲ [WARNING] src/app/a.component.scss exceeded maximum budget. Budget 1.00 kB was not met by 65 bytes with a total of 1.06 kB.',
        '▲ [WARNING] src/app/b.component.scss exceeded maximum budget. Budget 1.00 kB was not met by 6 bytes with a total of 900 bytes.',
      ].join('\n'),
    );

    expect(measured).toEqual([
      { file: 'src/app/a.component.scss', compiledBytes: 1060 },
      { file: 'src/app/b.component.scss', compiledBytes: 900 },
    ]);
  });

  it('sorts largest first, so the summary names the file that matters', () => {
    const measured = parseBudgetOutput(
      [
        'src/app/small.component.scss exceeded maximum budget. Budget 1.00 kB was not met by 1 bytes with a total of 1.10 kB.',
        'src/app/large.component.scss exceeded maximum budget. Budget 1.00 kB was not met by 1 bytes with a total of 5.79 kB.',
      ].join('\n'),
    );

    expect(measured[0].file).toBe('src/app/large.component.scss');
  });

  it('ignores a line that is not a stylesheet budget line', () => {
    expect(
      parseBudgetOutput('▲ [WARNING] bundle initial exceeded maximum budget. Budget 1.80 MB was not met by 149.88 kB with a total of 1.95 MB.'),
    ).toEqual([]);
  });

  it('keeps one entry per file when a build reports it twice', () => {
    const line = 'src/app/a.component.scss exceeded maximum budget. Budget 1.00 kB was not met by 1 bytes with a total of 2.00 kB.';

    expect(parseBudgetOutput(`${line}\n${line}`)).toHaveLength(1);
  });
});

describe('parseBudgetSize', () => {
  it('reads the units angular.json accepts', () => {
    expect(parseBudgetSize('12kb')).toBe(12_000);
    expect(parseBudgetSize('20kb')).toBe(20_000);
    expect(parseBudgetSize('1.8mb')).toBe(1_800_000);
    expect(parseBudgetSize('500b')).toBe(500);
  });

  it('refuses a size it does not understand rather than guessing', () => {
    expect(() => parseBudgetSize('twelve')).toThrow(/Unrecognised budget size/u);
  });
});

describe('readAnyComponentStyleBudget', () => {
  /*
   * The budget is read from angular.json rather than copied, so this asserts the
   * real file still holds one - a check that hardcodes the number it guards is
   * the next thing to go stale.
   */
  it('reads the real budget out of angular.json', () => {
    const budget = readAnyComponentStyleBudget(readFileSync(path.join(REPO_ROOT, 'angular.json'), 'utf8'));

    expect(budget.warningBytes).toBeGreaterThan(0);
    expect(budget.errorBytes).toBeGreaterThan(budget.warningBytes);
  });

  it('fails loudly when the budget is gone, instead of measuring against nothing', () => {
    expect(() =>
      readAnyComponentStyleBudget(
        JSON.stringify({
          projects: { 'optc-team-builder': { architect: { build: { configurations: { production: { budgets: [] } } } } } },
        }),
      ),
    ).toThrow(/no anyComponentStyle budget/u);
  });
});

describe('compareWithBaseline', () => {
  it('stays quiet on a stylesheet comfortably under the early share', () => {
    const measured = [{ file: 'src/app/a.component.scss', compiledBytes: 5_790 }];
    const result = compareWithBaseline(measured, baselineOf(measured), BUDGET);

    expect(result.nearBudget).toEqual([]);
    expect(result.drifted).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it('fires at the early share, while Angular is still silent', () => {
    const measured = [{ file: 'src/app/a.component.scss', compiledBytes: 9_010 }];
    const result = compareWithBaseline(measured, baselineOf(measured), BUDGET);

    expect(result.nearBudget).toHaveLength(1);
    expect(result.nearBudget[0].share).toBeCloseTo(0.75, 2);
    expect(measured[0].compiledBytes).toBeLessThan(BUDGET.warningBytes);
  });

  it('fires exactly at the share, not one byte past it', () => {
    const atShare = BUDGET.warningBytes * EARLY_WARNING_SHARE;
    const measured = [{ file: 'src/app/a.component.scss', compiledBytes: atShare }];

    expect(compareWithBaseline(measured, baselineOf(measured), BUDGET).nearBudget).toHaveLength(1);
    expect(
      compareWithBaseline(
        [{ file: 'src/app/a.component.scss', compiledBytes: atShare - 1 }],
        baselineOf([{ file: 'src/app/a.component.scss', compiledBytes: atShare - 1 }]),
        BUDGET,
      ).nearBudget,
    ).toEqual([]);
  });

  it('reports growth past the drift tolerance so it lands in a diff', () => {
    const recorded = [{ file: 'src/app/a.component.scss', compiledBytes: 1_000 }];
    const measured = [{ file: 'src/app/a.component.scss', compiledBytes: 1_200 }];
    const result = compareWithBaseline(measured, baselineOf(recorded), BUDGET);

    expect(result.drifted).toHaveLength(1);
    expect(result.drifted[0].recordedBytes).toBe(1_000);
  });

  it('reports SHRINKING past the tolerance too, so the trend cannot silently reset', () => {
    const recorded = [{ file: 'src/app/a.component.scss', compiledBytes: 2_000 }];
    const measured = [{ file: 'src/app/a.component.scss', compiledBytes: 1_000 }];

    expect(compareWithBaseline(measured, baselineOf(recorded), BUDGET).drifted).toHaveLength(1);
  });

  it('tolerates movement inside the tolerance', () => {
    const recorded = [{ file: 'src/app/a.component.scss', compiledBytes: 1_000 }];
    const measured = [{ file: 'src/app/a.component.scss', compiledBytes: 1_000 + 1_000 * DRIFT_TOLERANCE }];

    expect(compareWithBaseline(measured, baselineOf(recorded), BUDGET).drifted).toEqual([]);
  });

  it('reports a stylesheet the baseline has never seen', () => {
    const result = compareWithBaseline(
      [{ file: 'src/app/new.component.scss', compiledBytes: 2_000 }],
      baselineOf([]),
      BUDGET,
    );

    expect(result.drifted).toHaveLength(1);
    expect(result.drifted[0].recordedBytes).toBeNull();
  });

  it('reports a recorded stylesheet the build no longer mentions', () => {
    const result = compareWithBaseline([], baselineOf([{ file: 'src/app/gone.component.scss', compiledBytes: 2_000 }]), BUDGET);

    expect(result.missing).toHaveLength(1);
  });
});

describe('the committed baseline', () => {
  const baseline = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'scripts/data/component-style-budget-baseline.json'), 'utf8'),
  );

  it('records when it was measured and against which budget', () => {
    expect(baseline.measuredOn).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(baseline.budget.warningBytes).toBeGreaterThan(0);
  });

  it('agrees with the thresholds the script enforces', () => {
    expect(baseline.earlyWarningShare).toBe(EARLY_WARNING_SHARE);
    expect(baseline.driftTolerance).toBe(DRIFT_TOLERANCE);
  });

  it('holds no stylesheet already past the early share, or the lane would be red on main', () => {
    const limit = baseline.budget.warningBytes * EARLY_WARNING_SHARE;

    for (const entry of baseline.stylesheets) {
      expect(entry.compiledBytes, `${entry.file} is already past the early share`).toBeLessThan(limit);
    }
  });
});
