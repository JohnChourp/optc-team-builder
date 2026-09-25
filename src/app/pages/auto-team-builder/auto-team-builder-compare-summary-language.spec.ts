import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { type AutoBuildResult } from '../../core/models/auto-team-builder.models';
import { type CharacterDetailRecord, type SavedTeam } from '../../core/models/optc.models';
import {
  AUTO_TEAM_COMPARE_UNNAMED_TEAM_KEYS,
  buildAutoTeamCompareSnapshotFromCurrent,
  buildAutoTeamCompareSnapshotFromImportedSeed,
  buildAutoTeamCompareSnapshotFromSavedTeam,
  parseAutoTeamCompareImportPayload,
  type AutoTeamCompareImportedSeed,
  type AutoTeamCompareSnapshot,
  type AutoTeamCompareSource,
} from './auto-team-builder-team-compare.utils';
import { AutoTeamBuilderPage } from './auto-team-builder.page';

vi.mock('@ionic/angular', () => ({
  AlertController: class {},
  IonCheckbox: class {},
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSegment: class {},
  IonSelect: class {},
  IonTextarea: class {},
  IonToggle: class {},
}));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-footer', () => ({ IonFooter: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-menu-button', () => ({ IonMenuButton: class {} }));
vi.mock('@ionic/angular/ion-segment-button', () => ({ IonSegmentButton: class {} }));
vi.mock('@ionic/angular/ion-select-option', () => ({ IonSelectOption: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

/*
 * 869f6td68. The Compare panel on Auto Team Builder names each side in one summary line, and the
 * name of a team with no name of its own was English inside a translated sentence: the Greek UI
 * read "Current generated team · 3 γεμάτα slots".
 *
 * Every snapshot here comes from the real compare utils, and the line is built by the page's own
 * `compareSideSummary` - on a page with no constructor run, given only what that method reads -
 * against the real copy in both languages.
 */

type Language = 'en' | 'el';

const COPY: Record<Language, Record<string, unknown>> = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), 'public/i18n/auto-team-builder/en.json'), 'utf8')),
  el: JSON.parse(readFileSync(resolve(process.cwd(), 'public/i18n/auto-team-builder/el.json'), 'utf8')),
};

function copy(language: Language, key: string, params: Record<string, unknown> = {}): string | undefined {
  const value = key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
      COPY[language],
    );

  return typeof value === 'string'
    ? value.replace(/\{\{\s*(\w+)\s*\}\}/gu, (placeholder, name: string) =>
        params[name] === undefined ? placeholder : String(params[name]),
      )
    : undefined;
}

function character(id: number): CharacterDetailRecord {
  return {
    id,
    name: `Character ${id}`,
    type: 'STR',
    classes: ['Fighter'],
    primaryClass: 'Fighter',
    secondaryClass: null,
    detail: { builderAbilities: [], captainAbilityCoverage: { entries: [] } },
  } as unknown as CharacterDetailRecord;
}

function savedTeam(name: string, slots: Array<number | null>): SavedTeam {
  return { id: 'team-1', name, notes: '', shipId: null, slots } as unknown as SavedTeam;
}

const CURRENT = buildAutoTeamCompareSnapshotFromCurrent(
  {
    slots: [
      { role: 'captain', character: character(1) },
      { role: 'friendCaptain', character: character(2) },
      { role: 'sub', character: character(3) },
    ],
  } as unknown as AutoBuildResult,
  null,
  [],
);

const IMPORTED_GENERATED_SEED = parseAutoTeamCompareImportPayload(
  JSON.stringify({
    source: 'auto-team-builder',
    exportedAt: '2026-09-24T10:00:00.000Z',
    team: [{ slotIndex: 0, character: character(1) }],
  }),
);
const IMPORTED_GENERATED = buildAutoTeamCompareSnapshotFromImportedSeed(IMPORTED_GENERATED_SEED, new Map(), null, []);

const IMPORTED_SAVED = buildAutoTeamCompareSnapshotFromImportedSeed(
  parseAutoTeamCompareImportPayload(JSON.stringify(savedTeam('  ', [1, 2, null, null, null, null]))),
  new Map([
    [1, character(1)],
    [2, character(2)],
  ]),
  null,
  [],
);

const SAVED = buildAutoTeamCompareSnapshotFromSavedTeam(
  savedTeam('   ', [1, null, null, null, null, null]),
  new Map([[1, character(1)]]),
  null,
  [],
);

/** The page's own summary line for one side, in `language`. */
function summaryLine(
  language: Language,
  source: AutoTeamCompareSource,
  snapshot: AutoTeamCompareSnapshot,
): string {
  const page = Object.create(AutoTeamBuilderPage.prototype) as AutoTeamBuilderPage;
  const payload = { state: { source }, seed: null, snapshot, error: '', loading: false };

  Object.assign(page, {
    compareSidePayloads: () => ({ a: payload, b: payload }),
    currentCompareSnapshot: () => (source === 'current' ? snapshot : null),
    savedTeams: () => [],
    i18n: {
      translate: (key: string, params?: Record<string, unknown>, scope?: string) =>
        scope === 'auto-team-builder' ? (copy(language, key, params) ?? `${scope}.${key}`) : key,
    },
  });

  return page.compareSideSummary('a');
}

const UNNAMED = [
  { name: 'the current generated team', source: 'current', snapshot: CURRENT, key: 'current', filled: 3 },
  { name: 'an imported generated team', source: 'imported', snapshot: IMPORTED_GENERATED, key: 'importedGenerated', filled: 1 },
  { name: 'an imported saved team with no name', source: 'imported', snapshot: IMPORTED_SAVED, key: 'importedSaved', filled: 2 },
  { name: 'a saved team with no name', source: 'saved', snapshot: SAVED, key: 'saved', filled: 1 },
] as const;

/** The English words the four unnamed teams used to carry into the Greek line. */
const ENGLISH_WORDS = /\b(?:Current|Imported|generated|Saved team)\b/u;

describe('the Compare summary names a team with no name of its own in the reader language', () => {
  for (const language of ['en', 'el'] as const) {
    for (const side of UNNAMED) {
      it(`${language}: ${side.name}`, () => {
        const name = copy(language, `compare.unnamedTeam.${side.key}`);

        expect(name, 'a key with no copy behind it').toBeTypeOf('string');
        expect(side.snapshot.labelKey).toBe(AUTO_TEAM_COMPARE_UNNAMED_TEAM_KEYS[side.key]);

        const line = summaryLine(language, side.source, side.snapshot);

        expect(line).toBe(copy(language, 'compare.snapshotSummary', { name, filled: side.filled }));

        if (language === 'el') {
          expect(line).not.toMatch(ENGLISH_WORDS);
          expect(line.split(' · ')[0]).toMatch(/[Ͱ-Ͽ]/u);
        }
      });
    }
  }

  it('reads, in Greek, as the Greek words the reader saw nowhere before', () => {
    expect(summaryLine('el', 'current', CURRENT)).toBe(
      'Τρέχουσα ομάδα του Auto Team Builder · 3 γεμάτα slots',
    );
    expect(summaryLine('en', 'current', CURRENT)).toBe('Current generated team · 3 filled slots');
  });

  it('keeps a team the player named under its own name, in both languages', () => {
    const named = buildAutoTeamCompareSnapshotFromSavedTeam(
      savedTeam('Ομάδα Kizuna', [1, null, null, null, null, null]),
      new Map([[1, character(1)]]),
      null,
      [],
    );

    expect(named.labelKey).toBeNull();
    expect(summaryLine('en', 'saved', named)).toBe('Ομάδα Kizuna · 1 filled slots');
    expect(summaryLine('el', 'saved', named)).toBe('Ομάδα Kizuna · 1 γεμάτα slots');
  });

  it('keeps an imported snapshot id on the text it always had, whatever the language', () => {
    // The id is built from `label`, never from a translation, so a language switch cannot make
    // the same team a different one.
    expect(IMPORTED_GENERATED.id).toBe('imported:Imported generated team:1,,,,,');
    expect(IMPORTED_SAVED.id).toBe('imported:Imported saved team:1,2,,,,');
  });

  it('keeps the key through a restored session, and trusts no other key from storage', () => {
    const page = Object.create(AutoTeamBuilderPage.prototype) as AutoTeamBuilderPage;
    const restore = (value: unknown) =>
      (page as unknown as { normalizeCompareImportedSeed(value: unknown): AutoTeamCompareImportedSeed | null })
        .normalizeCompareImportedSeed(value);

    Object.assign(page, { i18n: { translate: (key: string) => key } });

    const stored = JSON.parse(JSON.stringify(IMPORTED_GENERATED_SEED)) as Record<string, unknown>;

    expect(restore(stored)?.labelKey).toBe('compare.unnamedTeam.importedGenerated');
    expect(restore({ ...stored, labelKey: 'compare.snapshotSummary' })?.labelKey).toBeNull();
    expect(restore({ ...stored, labelKey: undefined })?.labelKey).toBeNull();
  });
});
