import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AUTO_TEAM_BUILDER_AXES,
  findAxesByRelaxationField,
  findAxisById,
  listAxisReportRowKeys,
  NON_AXIS_RELAXATION_FIELDS,
} from './auto-team-builder-axes.registry';

/*
 * 869f127ec. The engine reasons in numbered axes and nothing listed them - one comment said "Axis
 * 7, same shape as axes 6, 9 and 10" and there was no place that said what 6, 9 or 10 were.
 *
 * The registry is a MAPPING, not a rewrite, so these tests are not about behaviour. They are about
 * the list staying complete: an eleventh axis cannot be added to the engine without appearing here,
 * an entry cannot name a field that was renamed away, and a relaxable axis cannot exist without a
 * report row to say it bent.
 */

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

/** The field names declared on `AutoBuildRelaxationSummary`, read from the model itself. */
function readRelaxationFields(): string[] {
  const source = readSource('src/app/core/models/auto-team-builder.models.ts');
  const start = source.indexOf('interface AutoBuildRelaxationSummary');
  const end = source.indexOf('}', start);
  const block = source.slice(start, end);

  return [...block.matchAll(/^\s{2}(\w+)\??:/gmu)].map((match) => match[1]!);
}

describe('the axis registry is complete', () => {
  it('covers EVERY relaxation the engine can report', () => {
    /*
     * This is the test the subtask asked for. The engine writes its concessions into
     * `AutoBuildRelaxationSummary`; every field there except the summary flag must belong to an
     * axis, or the list has a hole and the next reader learns the axes by imitation again.
     */
    const declared = readRelaxationFields();
    const covered = new Set([
      ...AUTO_TEAM_BUILDER_AXES.flatMap((axis) => axis.relaxationFields),
      ...NON_AXIS_RELAXATION_FIELDS,
    ]);
    const uncovered = declared.filter((field) => !covered.has(field as never));

    expect(declared.length).toBeGreaterThan(5);
    expect(uncovered).toEqual([]);
  });

  it('names no relaxation field the model does not declare', () => {
    const declared = new Set(readRelaxationFields());
    const invented = AUTO_TEAM_BUILDER_AXES.flatMap((axis) => axis.relaxationFields).filter(
      (field) => !declared.has(field),
    );

    expect(invented).toEqual([]);
  });

  it('gives every relaxable axis a Final team report row', () => {
    // A rule that can bend with nowhere to say so is how a relaxation becomes invisible.
    const silent = AUTO_TEAM_BUILDER_AXES.filter(
      (axis) => axis.relaxable && axis.reportRowKey === null,
    );

    expect(silent).toEqual([]);
  });

  it('uses report rows the page actually builds', () => {
    /*
     * The page names a row two ways: five are written out as `report.rules.<key>.<state>`, and the
     * selected-filter families are built through `buildSelectedFilterReportRow('<key>', ...)` with
     * the key interpolated - so the literal path never appears in the source for those. Asserting
     * only the literal path failed on `characterNames`, which is present and correct. Both shapes
     * count, because both are the page referring to that row.
     */
    const page = readSource('src/app/pages/auto-team-builder/auto-team-builder.page.ts');

    for (const key of listAxisReportRowKeys()) {
      const referenced = page.includes(`report.rules.${key}.`) || page.includes(`'${key}',`);

      expect(referenced, `report row ${key} is referenced by the page`).toBe(true);
    }
  });

  it('uses report rows the translations actually define, in both languages', () => {
    for (const language of ['en', 'el']) {
      const rules = JSON.parse(readSource(`public/i18n/auto-team-builder/${language}.json`)).report
        .rules as Record<string, unknown>;

      for (const key of listAxisReportRowKeys()) {
        expect(Object.keys(rules), `${language} report row ${key}`).toContain(key);
      }
    }
  });
});

describe('the axis registry is coherent', () => {
  it('numbers every axis once', () => {
    const numbers = AUTO_TEAM_BUILDER_AXES.map((axis) => axis.axis);

    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('ids every axis once', () => {
    const ids = AUTO_TEAM_BUILDER_AXES.map((axis) => axis.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the numbering the engine comment already used', () => {
    // A reader who finds "Axis 7, same shape as axes 6, 9 and 10" must land here and recognise it.
    expect(findAxisById('captainAbilityCoverage')?.axis).toBe(7);
    expect(AUTO_TEAM_BUILDER_AXES.find((axis) => axis.axis === 6)?.id).toBe('leaderSuperEffectScope');
    expect(AUTO_TEAM_BUILDER_AXES.find((axis) => axis.axis === 9)?.id).toBe(
      'leaderSuperSpecialCriteria',
    );
    expect(AUTO_TEAM_BUILDER_AXES.find((axis) => axis.axis === 10)?.id).toBe('superTandemCriteria');
  });

  it('points every axis at a family', () => {
    for (const axis of AUTO_TEAM_BUILDER_AXES) {
      expect(['candidatePool', 'leaderScope', 'leaderAbility']).toContain(axis.family);
    }
  });
});

describe('the registry can be asked questions', () => {
  it('finds an axis by id', () => {
    expect(findAxisById('selectedTypes')?.axis).toBe(1);
    expect(findAxisById('notAnAxis')).toBeUndefined();
  });

  it('finds every axis that writes one relaxation field', () => {
    // `ignoredCaptainAbilityCoverage` is written for two different requested constraints, which is
    // exactly the kind of many-to-one the prose could not express.
    const axes = findAxesByRelaxationField('ignoredCaptainAbilityCoverage');

    expect(axes.map((axis) => axis.id)).toEqual([
      'captainAbilityCoverage',
      'bothLeadersCaptainAbilityCoverage',
    ]);
  });

  it('lists the report rows without repeating a shared one', () => {
    const keys = listAxisReportRowKeys();

    expect(new Set(keys).size).toBe(keys.length);
    // Three axes speak through the leader Super scope row; it appears once.
    expect(keys).toContain('leaderSuperScope');
  });
});
