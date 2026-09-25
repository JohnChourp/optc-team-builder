import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_RUMBLE_BUFF_FOCUS,
  type RumbleBuildInput,
  type RumbleTeamResult,
} from '../../core/models/auto-team-builder-rumble.models';
import { type CharacterDetailRecord } from '../../core/models/optc.models';
import { RumbleTeamBuilderEngine } from '../../core/services/auto-team-builder-rumble.engine';
import {
  collectRumbleStyles,
  resolveRumbleAvoidedCharacterIds,
} from './auto-team-builder-rumble-avoid.utils';
import { AutoTeamBuilderRumblePage } from './auto-team-builder-rumble.page';

/**
 * 869f63gyq. The Rumble builder's opt-in "Avoid style / type / class" filter, for an Assault Rumble
 * boss that punishes one. A candidate filter applied where the page resolves its pool, the engine
 * untouched; off, the build is exactly what it was; and when it leaves too few units the page says
 * so instead of quietly dropping it.
 *
 * The style is the one the engine resolves. 455 shipped units carry no style of their own and take
 * their parent's through `basedOn` - measured on the v0.6.5 seed, 2026-09-25 - so a filter reading a
 * unit's own record would let every one of them through. The pool below has one such unit, and the
 * first test shows the naive reading missing it.
 */

vi.mock('@ionic/angular', () => ({
  IonIcon: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonToggle: class {},
}));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-footer', () => ({ IonFooter: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-menu-button', () => ({ IonMenuButton: class {} }));
vi.mock('@ionic/angular/ion-select-option', () => ({ IonSelectOption: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

const DEBUFF_PARENT = 226;
const DEBUFF_CHILD = 227;
const DUAL_INT_PSY = 300;
const DRIVEN_UNIT = 301;
const PLAIN_UNIT = 302;

function unit(
  id: number,
  type: string,
  classes: string[],
  rumbleData: Record<string, unknown>,
): CharacterDetailRecord {
  return {
    id,
    name: `Unit ${id}`,
    type,
    classes,
    primaryClass: classes[0] ?? 'Fighter',
    secondaryClass: classes[1] ?? null,
    cost: 50,
    stats: { min: { hp: 1000, atk: 400, rcv: 100 }, max: { hp: 4000, atk: 1800, rcv: 300 }, growth: 3 },
    detail: { characterTags: [], rumbleData },
  } as unknown as CharacterDetailRecord;
}

function pool(): CharacterDetailRecord[] {
  return [
    unit(DEBUFF_PARENT, 'DEX', ['Slasher'], { id: DEBUFF_PARENT, stats: { rumbleType: 'DBF', def: 90 } }),
    // Exactly the shipped shape: nothing but an id and the unit it is based on.
    unit(DEBUFF_CHILD, 'DEX', ['Slasher'], { id: DEBUFF_CHILD, basedOn: DEBUFF_PARENT }),
    unit(DUAL_INT_PSY, 'INT,PSY', ['Fighter'], { id: DUAL_INT_PSY, stats: { rumbleType: 'ATK' } }),
    unit(DRIVEN_UNIT, 'QCK', ['Driven'], { id: DRIVEN_UNIT, stats: { rumbleType: 'BAL' } }),
    unit(PLAIN_UNIT, 'STR', ['Slasher'], { id: PLAIN_UNIT, stats: { rumbleType: 'ATK' } }),
  ];
}

const engine = new RumbleTeamBuilderEngine();

function engineStyles(candidates: CharacterDetailRecord[]): (candidate: CharacterDetailRecord) => string | null {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  return (candidate) => engine.normalizeRumbleData(candidate, byId)?.rumbleType ?? null;
}

function result(selectedCount: number, candidateCount: number): RumbleTeamResult {
  return {
    activeSlots: [],
    benchSlots: [],
    candidateCount,
    selectedCount,
    totalScore: 0,
    roleCoverage: [],
    typeCoverage: [],
    classCoverage: [],
    topFactors: [],
    input: {
      types: [],
      selectedClasses: [],
      onlySelectedTypes: false,
      onlySelectedClasses: false,
      favoritesOnly: false,
      favoriteCharacterIds: [],
      characterBoxId: null,
      opponentSlots: [],
      buffFocus: DEFAULT_RUMBLE_BUFF_FOCUS,
      requireFullTeam: true,
    },
    requestedTypes: [],
    requestedClasses: [],
    resolvedTypes: [],
    resolvedClasses: [],
    droppedTypes: [],
    droppedClasses: [],
  };
}

function translations(): (key: string, params?: Record<string, unknown>) => string {
  const scoped = JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/i18n/auto-team-builder-rumble/en.json'), 'utf8'),
  ) as Record<string, unknown>;

  return (key, params) => {
    const value = key
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], scoped);

    return typeof value === 'string'
      ? value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) => String(params?.[name] ?? ''))
      : key;
  };
}

function createPage(
  built: RumbleTeamResult = result(8, 3),
  characterBoxes: Array<{ id: string; name: string; characterIds: number[] }> = [],
) {
  const candidates = pool();
  const rumbleBuilder = {
    normalizeRumbleData: (candidate: CharacterDetailRecord, byId: ReadonlyMap<number, CharacterDetailRecord>) =>
      engine.normalizeRumbleData(candidate, byId),
    scoreCandidates: vi.fn().mockReturnValue([]),
    buildBestTeams: vi
      .fn()
      .mockImplementation((input: Partial<RumbleBuildInput>) =>
        Promise.resolve([
          input.requireFullTeam === false
            ? { ...built, selectedCount: 0, input: { ...built.input, requireFullTeam: false } }
            : built,
        ]),
      ),
  };
  const repository = {
    getDatasetManifest: vi.fn().mockResolvedValue({
      schemaVersion: 1,
      availableClasses: ['Driven', 'Fighter', 'Slasher'],
    }),
    getRumbleBuilderCandidates: vi.fn().mockResolvedValue(candidates),
  };
  const userState = {
    readyFavoriteCharacterIds: vi.fn().mockResolvedValue(undefined),
    readyCharacterBoxes: vi.fn().mockResolvedValue(undefined),
    readyAutoTeamBuilderWorkerPreference: vi.fn().mockResolvedValue(undefined),
    readySavedRumbleOpponents: vi.fn().mockResolvedValue(undefined),
    savedRumbleOpponents: () => [],
    favoriteCharacterIds: vi.fn(() => []),
    characterBoxes: vi.fn(() => characterBoxes),
    autoTeamBuilderWorkerPreference: vi.fn(() => ({ mode: 'auto', manualCount: 1 })),
    resolveAutoTeamBuilderWorkerPreference: vi.fn(() => ({
      mode: 'auto',
      manualCount: 1,
      detectedCoreCount: 2,
      effectiveCount: 1,
      manualMaxCount: 1,
      manualMaxPercent: 50,
    })),
    resolveAutoTeamBuilderWorkerCount: vi.fn(() => 1),
  };
  const i18n = { preloadScope: vi.fn().mockResolvedValue(undefined), translate: translations() };
  const route = { snapshot: { queryParamMap: { get: vi.fn(() => null) } } };
  const page = new AutoTeamBuilderRumblePage(
    rumbleBuilder as never,
    repository as never,
    userState as never,
    i18n as never,
    route as never,
    { navigate: vi.fn().mockResolvedValue(true) } as never,
  );

  return { page, rumbleBuilder };
}

const toggle = (checked: boolean) => ({ detail: { checked } }) as CustomEvent<{ checked: boolean }>;
const values = <T>(value: T) => ({ detail: { value } }) as CustomEvent<{ value?: T }>;

function sentPool(rumbleBuilder: { buildBestTeams: ReturnType<typeof vi.fn> }): number[] | undefined {
  return (rumbleBuilder.buildBestTeams.mock.calls[0]![0] as Partial<RumbleBuildInput>)
    .candidateCharacterIds;
}

describe('the avoid reads the style the engine resolves (869f63gyq)', () => {
  it("catches a unit that inherits its parent's style - which its own record never shows", () => {
    const candidates = pool();
    const ownStyleOnly = (candidate: CharacterDetailRecord) =>
      ((candidate.detail.rumbleData as { stats?: { rumbleType?: string } }).stats?.rumbleType ?? null);
    const rules = { styles: ['DBF'], types: [], classes: [] };

    expect([...resolveRumbleAvoidedCharacterIds(candidates, ownStyleOnly, rules)]).toEqual([
      DEBUFF_PARENT,
    ]);
    expect([...resolveRumbleAvoidedCharacterIds(candidates, engineStyles(candidates), rules)]).toEqual([
      DEBUFF_PARENT,
      DEBUFF_CHILD,
    ]);
  });

  it('avoids a dual unit when either of its types is avoided, and a unit by either class', () => {
    const candidates = pool();

    expect([
      ...resolveRumbleAvoidedCharacterIds(candidates, engineStyles(candidates), {
        styles: [],
        types: ['PSY'],
        classes: ['Driven'],
      }),
    ]).toEqual([DUAL_INT_PSY, DRIVEN_UNIT]);
  });

  it('offers the styles the data carries, inherited ones included, and no others', () => {
    const candidates = pool();

    expect(collectRumbleStyles(candidates.map(engineStyles(candidates)))).toEqual(['ATK', 'BAL', 'DBF']);
  });
});

describe('the Rumble builder applies the avoid only when it is on (869f63gyq)', () => {
  it('builds from the whole pool, exactly as before, while the filter is off', async () => {
    const { page, rumbleBuilder } = createPage();

    await page.ngOnInit();
    page.avoidedStyles.set(['DBF']);
    await page.buildTeam();

    expect(sentPool(rumbleBuilder)).toBeUndefined();
  });

  it('leaves out the avoided style, the unit that inherits it, and nothing else', async () => {
    const { page, rumbleBuilder } = createPage();

    await page.ngOnInit();
    await page.onAvoidToggle(toggle(true));

    expect(page.availableRumbleStyles()).toEqual(['ATK', 'BAL', 'DBF']);

    page.onAvoidedStylesChange(values(['DBF']));
    await page.buildTeam();

    expect(sentPool(rumbleBuilder)).toEqual([DUAL_INT_PSY, DRIVEN_UNIT, PLAIN_UNIT]);
  });

  it('narrows a character box the same way, and leaves the rest of the box alone', async () => {
    const { page, rumbleBuilder } = createPage(result(8, 3), [
      { id: 'box-1', name: 'Box', characterIds: [DEBUFF_CHILD, DRIVEN_UNIT, PLAIN_UNIT] },
    ]);

    await page.ngOnInit();
    page.onCharacterBoxChange(values('box-1'));
    await page.onAvoidToggle(toggle(true));
    page.onAvoidedStylesChange(values(['DBF']));
    await page.buildTeam();

    // The child is avoided through a parent the box does not even hold.
    expect(sentPool(rumbleBuilder)).toEqual([DRIVEN_UNIT, PLAIN_UNIT]);
  });

  it('leaves out a type and a class the same way', async () => {
    const { page, rumbleBuilder } = createPage();

    await page.ngOnInit();
    await page.onAvoidToggle(toggle(true));
    page.onAvoidedTypesChange(values(['INT'] as never));
    page.onAvoidedClassesChange(values(['Driven']));
    await page.buildTeam();

    expect(sentPool(rumbleBuilder)).toEqual([DEBUFF_PARENT, DEBUFF_CHILD, PLAIN_UNIT]);
  });
});

describe('a team the avoid left short says so (869f63gyq)', () => {
  it('names the avoided values and how many units they left out', async () => {
    const { page } = createPage(result(3, 3));

    await page.ngOnInit();
    await page.onAvoidToggle(toggle(true));
    page.onAvoidedStylesChange(values(['DBF']));
    await page.buildTeam();

    expect(page.insufficientStateVisible()).toBe(true);
    expect(page.avoidShortfallLabel()).toBe(
      'Avoiding DBF left out 2 units, too few for a full team. Avoid fewer to widen the pool.',
    );
  });

  it('says it on an empty pool too', async () => {
    const { page } = createPage(result(0, 0));

    await page.ngOnInit();
    await page.onAvoidToggle(toggle(true));
    page.onAvoidedTypesChange(values(['DEX', 'STR', 'QCK', 'PSY', 'INT'] as never));
    await page.buildTeam();

    expect(page.emptyStateVisible()).toBe(true);
    expect(page.avoidShortfallLabel()).toContain('left out 5 units');
  });

  it('says nothing when the team is full, or when the avoid is off', async () => {
    const full = createPage(result(8, 3));

    await full.page.ngOnInit();
    await full.page.onAvoidToggle(toggle(true));
    full.page.onAvoidedStylesChange(values(['DBF']));
    await full.page.buildTeam();

    expect(full.page.avoidShortfallLabel()).toBe('');

    const off = createPage(result(3, 3));

    await off.page.ngOnInit();
    await off.page.buildTeam();

    expect(off.page.insufficientStateVisible()).toBe(true);
    expect(off.page.avoidShortfallLabel()).toBe('');
  });
});
