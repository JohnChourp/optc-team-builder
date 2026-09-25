import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { type SavedTeam } from '../../core/models/optc.models';

/**
 * 869f63gy7. Saved Teams checks the selected teams as one Treasure Map plan: five teams plus an
 * Ambush team from one box, each unit used once except in a Friend Captain seat and in the Ambush
 * team. A repeat is marked next to the teams that share it; nothing is refused and nothing stored.
 *
 * Its own file, with the page's harness preamble copied rather than shared.
 */

vi.mock('@ionic/angular', () => ({
  IonCheckbox: class {},
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonTextarea: class {},
}));
vi.mock('@ionic/angular/ion-select-option', () => ({ IonSelectOption: class {} }));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-footer', () => ({ IonFooter: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-menu-button', () => ({ IonMenuButton: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

type SavedTeamsPageClass = typeof import('./saved-teams.page').SavedTeamsPage;
type SavedTeamsPageInstance = InstanceType<SavedTeamsPageClass>;
let SavedTeamsPage: SavedTeamsPageClass;

const AT = '2026-09-25T10:00:00.000Z';
const TEMPLATE_PATH = 'src/app/pages/saved-teams/saved-teams.page.html';
const STYLESHEET_PATH = 'src/app/pages/saved-teams/saved-teams.page.scss';

function savedTeam(id: string, name: string, slots: Array<number | null>): SavedTeam {
  return { id, name, notes: '', shipId: null, slots, createdAt: AT, updatedAt: AT };
}

/*
 * Alpha and Bravo share 103 as crew. Alpha and Charlie share 101 as Captain. 102 is Friend Captain
 * of Alpha and of Bravo and crew of Charlie - borrowed twice and owned once, so it is no repeat.
 * Delta shares nothing with anybody.
 */
function planTeams(): SavedTeam[] {
  return [
    savedTeam('alpha', 'Alpha', [101, 102, 103, 104, 105, 106]),
    savedTeam('bravo', 'Bravo', [201, 102, 103, 204, 205, 206]),
    savedTeam('charlie', 'Charlie', [101, 301, 302, 303, 304, 102]),
    savedTeam('delta', 'Delta', [401, 402, 403, 404, 405, 406]),
    savedTeam('echo', 'Echo', [501, 502, 503, 504, 505, 506]),
    savedTeam('foxtrot', 'Foxtrot', [601, 602, 603, 604, 605, 606]),
    savedTeam('golf', 'Golf', [701, 702, 703, 704, 705, 706]),
  ];
}

describe('Saved Teams checks the selection as a Treasure Map plan (869f63gy7)', () => {
  beforeAll(async () => {
    SavedTeamsPage = (await import('./saved-teams.page')).SavedTeamsPage;
  });

  afterEach(() => {
    vi.clearAllMocks();
    globalThis.sessionStorage?.clear();
  });

  it('shows nothing until the check is opened over a selection, and closes again', async () => {
    const { page } = createPage();

    await page.ngOnInit();

    expect(page.treasureMapPlan()).toBeNull();

    select(page, 'alpha', 'bravo');
    expect(page.treasureMapPlan()).toBeNull();

    page.toggleTreasureMapCheck();
    expect(page.treasureMapPlan()?.teamCount).toBe(2);

    page.toggleTreasureMapCheck();
    expect(page.treasureMapPlan()).toBeNull();
  });

  it('marks every repeated unit next to the teams that share it, Friend Captain seats aside', async () => {
    const { page } = createPage();

    await page.ngOnInit();
    select(page, 'alpha', 'bravo', 'charlie');
    page.toggleTreasureMapCheck();

    expect(page.treasureMapPlan()).toEqual({
      repeatedUnitCount: 2,
      teamCount: 3,
      rows: [
        {
          teamId: 'alpha',
          name: 'Alpha',
          isAmbush: false,
          conflicts: [conflict(101, 'Charlie'), conflict(103, 'Bravo')],
        },
        { teamId: 'bravo', name: 'Bravo', isAmbush: false, conflicts: [conflict(103, 'Alpha')] },
        {
          teamId: 'charlie',
          name: 'Charlie',
          isAmbush: false,
          conflicts: [conflict(101, 'Alpha')],
        },
      ],
    });
    // 102 sits in two Friend Captain seats and one crew seat: never named anywhere.
    expect(unitNamesIn(page)).not.toContain('Unit 102');
  });

  it('lets the Ambush team reuse units, and keeps at most one team as the Ambush team', async () => {
    const { page } = createPage();

    await page.ngOnInit();
    select(page, 'alpha', 'bravo', 'charlie');
    page.toggleTreasureMapCheck();

    page.toggleTreasureMapAmbushTeam('charlie');
    expect(ambushTeams(page)).toEqual(['charlie']);
    expect(page.treasureMapPlan()?.repeatedUnitCount).toBe(1);
    expect(conflictsOf(page, 'alpha')).toEqual([conflict(103, 'Bravo')]);
    expect(conflictsOf(page, 'charlie')).toEqual([]);

    // Marking another team moves the mark rather than adding a second Ambush team.
    page.toggleTreasureMapAmbushTeam('bravo');
    expect(ambushTeams(page)).toEqual(['bravo']);
    expect(conflictsOf(page, 'alpha')).toEqual([conflict(101, 'Charlie')]);
    expect(conflictsOf(page, 'bravo')).toEqual([]);

    // Marking the same team again clears it, and every repeat is back.
    page.toggleTreasureMapAmbushTeam('bravo');
    expect(ambushTeams(page)).toEqual([]);
    expect(page.treasureMapPlan()?.repeatedUnitCount).toBe(2);
  });

  it('names a unit one team fields twice without naming another team', async () => {
    const { page } = createPage({
      savedTeams: [savedTeam('hotel', 'Hotel', [801, null, 803, 801, 805, 806])],
    });

    await page.ngOnInit();
    select(page, 'hotel');
    page.toggleTreasureMapCheck();

    expect(page.treasureMapPlan()?.repeatedUnitCount).toBe(1);
    expect(conflictsOf(page, 'hotel')).toEqual([
      { characterId: 801, unitName: 'Unit 801', otherTeamNames: '', usesInTeam: 2 },
    ]);
  });

  it('says so plainly when nothing repeats', async () => {
    const { page } = createPage();

    await page.ngOnInit();
    select(page, 'alpha', 'delta', 'echo');
    page.toggleTreasureMapCheck();

    expect(page.treasureMapPlan()?.repeatedUnitCount).toBe(0);
    expect(page.treasureMapPlan()?.rows.map((row) => row.conflicts)).toEqual([[], [], []]);
  });

  it('checks one team or seven without refusing either, and reports the count', async () => {
    const { page } = createPage();

    await page.ngOnInit();
    page.toggleTreasureMapCheck();

    select(page, 'delta');
    expect(page.treasureMapPlan()?.teamCount).toBe(1);
    expect(page.treasureMapPlan()?.repeatedUnitCount).toBe(0);

    page.onSelectAllChange({ detail: { checked: true } } as CustomEvent<{ checked: boolean }>);
    expect(page.treasureMapPlan()?.teamCount).toBe(7);
    expect(page.treasureMapPlan()?.repeatedUnitCount).toBe(2);
  });

  it('checks by unit id: two cards of one character are two units', async () => {
    // A Blackbeard card as Captain over four crew members of the team's own.
    const teach = (id: string, card: number, crew: number) =>
      savedTeam(id, `Teach ${id}`, [card, null, crew + 1, crew + 2, crew + 3, crew + 4]);
    // Two cards of one character: one name, and the same-character key the builders compare.
    const names = { 2963: 'Marshall D. Teach', 2964: 'Marshall D. Teach' };
    const twoCards = createPage({
      savedTeams: [teach('one', 2963, 10), teach('two', 2964, 20)],
      names,
    });
    const oneCardTwice = createPage({
      savedTeams: [teach('one', 2964, 10), teach('two', 2964, 20)],
      names,
    });

    for (const { page } of [twoCards, oneCardTwice]) {
      await page.ngOnInit();
      select(page, 'one', 'two');
      page.toggleTreasureMapCheck();
    }

    expect(twoCards.page.treasureMapPlan()?.repeatedUnitCount).toBe(0);
    // The control: the SAME card in both teams is one unit used twice.
    expect(conflictsOf(oneCardTwice.page, 'one')).toEqual([
      {
        characterId: 2964,
        unitName: 'Marshall D. Teach',
        otherTeamNames: 'Teach two',
        usesInTeam: 1,
      },
    ]);
  });

  it('follows the selection as it changes, so a repeat shows the moment a team is ticked', async () => {
    const { page } = createPage();

    await page.ngOnInit();
    select(page, 'alpha', 'bravo');
    page.toggleTreasureMapCheck();
    expect(conflictsOf(page, 'alpha')).toEqual([conflict(103, 'Bravo')]);

    select(page, 'charlie');
    expect(conflictsOf(page, 'alpha')).toEqual([conflict(101, 'Charlie'), conflict(103, 'Bravo')]);

    page.onTeamSelectionChange('bravo', { detail: { checked: false } } as CustomEvent<{
      checked: boolean;
    }>);
    expect(conflictsOf(page, 'alpha')).toEqual([conflict(101, 'Charlie')]);

    page.onSelectAllChange({ detail: { checked: false } } as CustomEvent<{ checked: boolean }>);
    expect(page.treasureMapPlan()).toBeNull();
  });

  it('stores nothing, and forgets the check and its Ambush team on Reset', async () => {
    const { page, userState } = createPage();

    await page.ngOnInit();
    // The control: the page's one browser store is live here - the view state lands in it.
    page.toggleSortDirection();
    const teamsBefore = page.savedTeams();
    const sessionBefore = storageSnapshot(globalThis.sessionStorage);

    expect(Object.keys(sessionBefore)).toEqual(['optc.savedTeams.viewState']);

    select(page, 'alpha', 'bravo', 'charlie');
    page.toggleTreasureMapCheck();
    page.toggleTreasureMapAmbushTeam('charlie');
    expect(ambushTeams(page)).toEqual(['charlie']);

    expect(page.savedTeams()).toBe(teamsBefore);
    expect(storageSnapshot(globalThis.sessionStorage)).toEqual(sessionBefore);
    for (const write of [
      userState.saveTeam,
      userState.deleteTeam,
      userState.deleteTeams,
      userState.mergeImportedTeams,
    ]) {
      expect(write).not.toHaveBeenCalled();
    }

    page.resetPage();
    expect(page.treasureMapPlan()).toBeNull();

    select(page, 'alpha', 'bravo', 'charlie');
    expect(page.treasureMapPlan()).toBeNull();
    page.toggleTreasureMapCheck();
    expect(ambushTeams(page)).toEqual([]);
  });
});

describe('the Treasure Map check on screen (869f63gy7)', () => {
  const template = readFileSync(resolve(process.cwd(), TEMPLATE_PATH), 'utf8');
  const toggle = sliceBetween(
    template,
    'data-testid="saved-teams-treasure-map-toggle"',
    '</button>',
  );
  const panel = sliceBetween(template, '@if (treasureMapPlan(); as plan)', '</section>');

  it('finds both pieces before asserting anything about them', () => {
    // A slice that missed would make every negative assertion below pass on nothing.
    expect(toggle).toContain("t('treasureMap.open')");
    expect(panel).toContain("t('treasureMap.title')");
    expect(panel).toContain('toggleTreasureMapAmbushTeam(row.teamId)');
  });

  it('opens from a native disclosure button that names what it controls', () => {
    const at = template.indexOf(toggle);
    const opening = template.slice(template.lastIndexOf('<', at), at);

    expect(opening).toMatch(/^<button\s+type="button"\s*$/u);
    expect(toggle).toContain('aria-controls="saved-teams-treasure-map-check"');
    expect(toggle).toContain(`[attr.aria-expanded]="treasureMapPlan() ? 'true' : 'false'"`);
    expect(toggle).toContain('[disabled]="!hasSelection()"');
    expect(toggle).toContain('(click)="toggleTreasureMapCheck()"');
    expect(panel).toContain('id="saved-teams-treasure-map-check"');
    expect(panel).toContain('aria-labelledby="saved-teams-treasure-map-title"');
    expect(panel).toContain('id="saved-teams-treasure-map-title"');
  });

  it('marks the Ambush team with a native toggle, never an Ionic control', () => {
    expect(panel).toMatch(
      /<button\s+type="button"\s+class="saved-team-native-button saved-teams-treasure-map__ambush"/u,
    );
    expect(panel).toContain(`[attr.aria-pressed]="row.isAmbush ? 'true' : 'false'"`);
    expect(panel).toContain("t('treasureMap.ambushAria', { name: row.name })");
    expect(panel).not.toMatch(/<ion-(button|toggle|checkbox|chip)\b/u);
    expect(`${toggle}${panel}`).not.toContain('aria-describedby');
  });

  it('announces the result, repeated or clear, and marks each repeat next to its team', () => {
    expect(panel).toMatch(/class="saved-teams-treasure-map__status"[\s\S]*?role="status"/u);
    expect(panel).toContain("t('treasureMap.repeated', { count: plan.repeatedUnitCount })");
    expect(panel).toContain("t('treasureMap.none')");
    expect(panel).toContain("t('treasureMap.count', { count: plan.teamCount })");
    expect(panel).toContain("t('treasureMap.copy')");
    expect(panel).toMatch(
      /t\('treasureMap\.alsoIn',\s*\{\s*name: conflict\.unitName,\s*teams: conflict\.otherTeamNames,?\s*\}\)/u,
    );
    expect(panel).toMatch(
      /t\('treasureMap\.inTeam',\s*\{\s*name: conflict\.unitName,\s*count: conflict\.usesInTeam,?\s*\}\)/u,
    );
  });

  it('styles every Treasure Map class it renders', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), STYLESHEET_PATH), 'utf8');
    const markup = `${toggle}${panel}`;
    const rendered = new Set(
      [
        ...[...markup.matchAll(/\bclass="([^"]*)"/gu)].flatMap((match) => match[1]!.split(/\s+/u)),
        ...[...markup.matchAll(/\[class\.([\w-]+)\]/gu)].map((match) => match[1]!),
      ].filter((className) => className.startsWith('saved-teams-treasure-map')),
    );

    expect(rendered.size).toBeGreaterThan(5);
    for (const className of rendered) {
      // Bounded, so `.saved-teams-treasure-map__team-head` cannot stand in for `__team`.
      expect(stylesheet, className).toMatch(new RegExp(`\\.${className}(?![\\w-])`, 'u'));
    }
  });
});

describe('the Treasure Map copy in both languages (869f63gy7)', () => {
  const en = readScope('en');
  const el = readScope('el');

  it('has the same keys and placeholders in English and Greek', () => {
    expect(Object.keys(el).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(en).length).toBeGreaterThanOrEqual(10);

    for (const key of Object.keys(en)) {
      expect(placeholders(el[key]!), key).toEqual(placeholders(en[key]!));
    }
  });

  it('writes the Greek in Greek, keeping the game terms in English', () => {
    for (const [key, value] of Object.entries(el)) {
      expect(value, key).toMatch(/\p{Script=Greek}/u);
      expect(value, key).not.toBe(en[key]);
    }

    expect(el['open']).toContain('Treasure Map');
    expect(el['title']).toContain('Treasure Map');
    expect(el['ambush']).toContain('Ambush');
    for (const term of ['Treasure Map', 'Ambush', 'Friend Captain']) {
      expect(el['copy'], term).toContain(term);
      expect(en['copy'], term).toContain(term);
    }
  });

  it('states the rule the check assumes: one copy of each unit, and a plan of five plus Ambush', () => {
    expect(en['copy']).toContain('one copy of each unit');
    expect(el['copy']).toContain('ένα μόνο αντίτυπο από κάθε μονάδα');
    expect(en['count']).toContain('5 teams plus an Ambush team');
    expect(el['count']).toContain('5 ομάδες και μία ομάδα Ambush');
  });
});

function createPage(
  overrides: { savedTeams?: SavedTeam[]; names?: Record<number, string> } = {},
) {
  const savedTeams = signal(overrides.savedTeams ?? planTeams());
  const characterFor = (id: number) => createCharacter(id, overrides.names?.[id] ?? `Unit ${id}`);
  const userState = {
    readySavedTeams: vi.fn().mockResolvedValue(undefined),
    savedTeams,
    consumeSavedTeamsStorageRecovery: vi.fn().mockReturnValue(null),
    saveTeam: vi.fn(),
    deleteTeam: vi.fn(),
    deleteTeams: vi.fn(),
    mergeImportedTeams: vi.fn(),
    savedEnemies: signal([]),
  };
  const repository = {
    getCharactersByIds: vi.fn(async (ids: number[]) => ids.map(characterFor)),
    getDetailedCharactersByIds: vi.fn(async (ids: number[]) => ids.map(characterFor)),
    getShips: vi.fn().mockResolvedValue([]),
  };
  const i18n = {
    preloadScope: vi.fn().mockResolvedValue(undefined),
    translate: vi.fn((key: string) => key),
  };
  const page = new SavedTeamsPage(userState as never, repository as never, i18n as never);

  return { page, userState };
}

function select(page: SavedTeamsPageInstance, ...teamIds: string[]): void {
  for (const teamId of teamIds) {
    page.onTeamSelectionChange(teamId, { detail: { checked: true } } as CustomEvent<{
      checked: boolean;
    }>);
  }
}

function conflict(characterId: number, otherTeamNames: string) {
  return { characterId, unitName: `Unit ${characterId}`, otherTeamNames, usesInTeam: 1 };
}

function conflictsOf(page: SavedTeamsPageInstance, teamId: string) {
  return page.treasureMapPlan()?.rows.find((row) => row.teamId === teamId)?.conflicts;
}

function ambushTeams(page: SavedTeamsPageInstance): string[] {
  return (page.treasureMapPlan()?.rows ?? [])
    .filter((row) => row.isAmbush)
    .map((row) => row.teamId);
}

function unitNamesIn(page: SavedTeamsPageInstance): string[] {
  return (page.treasureMapPlan()?.rows ?? []).flatMap((row) =>
    row.conflicts.map((entry) => entry.unitName),
  );
}

function storageSnapshot(storage: Storage | undefined): Record<string, string | null> {
  const snapshot: Record<string, string | null> = {};

  for (let index = 0; index < (storage?.length ?? 0); index += 1) {
    const key = storage!.key(index)!;

    snapshot[key] = storage!.getItem(key);
  }

  return snapshot;
}

/** The text from `anchor` to the first `end` after it - empty when the anchor is missing. */
function sliceBetween(source: string, anchor: string, end: string): string {
  const start = source.indexOf(anchor);

  if (start < 0) {
    return '';
  }

  const stop = source.indexOf(end, start);

  return stop < 0 ? '' : source.slice(start, stop + end.length);
}

function readScope(language: 'en' | 'el'): Record<string, string> {
  const bundle = JSON.parse(
    readFileSync(resolve(process.cwd(), `public/i18n/saved-teams/${language}.json`), 'utf8'),
  ) as { treasureMap?: Record<string, string> };

  return bundle.treasureMap ?? {};
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/gu)].map((match) => match[1]!).sort();
}

function createCharacter(id: number, name: string) {
  return {
    id,
    name,
    searchText: '',
    isIncomplete: false,
    type: id % 2 === 0 ? 'DEX' : 'PSY',
    classes: ['Fighter', 'Slasher'],
    primaryClass: 'Fighter',
    secondaryClass: 'Slasher',
    stars: 5,
    cost: 55,
    combo: 4,
    captainHpBoost: 0,
    captainAtkBoost: 0,
    captainAverageBoost: 0,
    stats: {
      min: { hp: null, atk: null, rcv: null },
      max: { hp: null, atk: null, rcv: null },
      growth: null,
    },
    regionArtwork: { exactLocal: false, thumbnailGlobal: false, thumbnailJapan: false },
    regionRelease: { availableOnGlobal: null },
    assets: { exactLocal: null, thumbnailGlobal: null, thumbnailJapan: null },
    imageUrl: `assets/${id}.png`,
    detailImageUrl: `assets/${id}.png`,
    detail: {
      characterId: id,
      captainAbility: null,
      captainAbilityVariants: [],
      captainNotes: null,
      specialName: null,
      specialText: null,
      specialNotes: null,
      superSpecialText: null,
      superSpecialCriteriaText: null,
      superSpecialNotes: null,
      superSpecialCriteria: null,
      partyConflictKeys: [name.toLowerCase()],
      characterTags: [],
      builderAbilities: [],
      sailorAbilities: [],
      sailorNotes: null,
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: null,
      superClass: null,
      captainShiftData: null,
      rumbleData: null,
    },
  };
}
