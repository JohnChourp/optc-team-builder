import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { type AutoBuildResult } from '../../core/models/auto-team-builder.models';
import type { AutoTeamBuilderPage } from './auto-team-builder.page';

/*
 * 869f63gm7. The Auto Team Builder's special charge timeline, with the cut the start of the quest
 * makes: the event cut the player enters, the team's own cuts read from its text, and Limit Break
 * behind "If Limit Broken". The arithmetic is pinned in `special-charge-timeline-start-cut.spec.ts`
 * and the attribution in `special-charge-start-cut.utils.spec.ts`; this file pins what the page
 * says, in both languages, and that the controls are the kind the project allows.
 *
 * Its own file, with its own small harness, rather than more cases at the tail of the page's
 * monolith suite.
 */

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

type Language = 'en' | 'el';

interface Member {
  id: number;
  name: string;
  captainAbility?: string;
  potential?: string;
}

/** Every special on this team takes 25 turns at level 1 and 18 at max level. */
const COOLDOWN = { baseTurns: 25, maxLevelTurns: 18 };

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as Record<string, unknown>;
}

function createI18n(language: Language) {
  const root = readJson(`public/i18n/${language}.json`);
  const scoped = readJson(`public/i18n/auto-team-builder/${language}.json`);

  return {
    activeLanguage: signal<Language>(language),
    translate: (key: string, params?: Record<string, unknown>, scope?: string): string => {
      const value = key
        .split('.')
        .reduce<unknown>(
          (current, part) =>
            current && typeof current === 'object'
              ? (current as Record<string, unknown>)[part]
              : undefined,
          scope ? scoped : root,
        );

      return typeof value === 'string'
        ? value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) =>
            String(params?.[name] ?? ''),
          )
        : key;
    },
  };
}

function team(members: Member[]): AutoBuildResult {
  return {
    slots: members.map((member, index) => ({
      role: index === 0 ? 'captain' : index === 1 ? 'friendCaptain' : 'sub',
      reasonChips: [],
      character: {
        id: member.id,
        name: member.name,
        type: 'STR',
        classes: ['Fighter'],
        detail: {
          characterId: member.id,
          specialName: null,
          captainAbility: member.captainAbility ?? null,
          sailorAbilities: [],
          potentialAbilities: member.potential
            ? [{ Name: 'Cooldown Reduction', description: [member.potential] }]
            : [],
          characterTags: [],
        },
      },
    })),
    shipSelection: null,
  } as unknown as AutoBuildResult;
}

async function createPage(
  members: Member[],
  options: { language?: Language; boosted?: number[]; cooldown?: typeof COOLDOWN } = {},
): Promise<AutoTeamBuilderPage> {
  const { AutoTeamBuilderPage } = await import('./auto-team-builder.page');
  const cooldown = options.cooldown ?? COOLDOWN;
  const repository = {
    getSpecialCooldownsByIds: vi.fn(async (ids: number[]) =>
      ids.map((characterId) => ({ characterId, ...cooldown })),
    ),
  };
  const userState = {
    favoriteCharacterIds: signal<number[]>([]),
    boostedCharacterIds: signal<number[]>(options.boosted ?? []),
    favoriteShipIds: signal<number[]>([]),
    characterBoxes: signal([]),
    savedTeams: signal([]),
    autoTeamBuilderWorkerPreference: signal({ mode: 'auto', manualCount: 1 }),
    resolveAutoTeamBuilderWorkerPreference: () => ({
      mode: 'auto',
      manualCount: 1,
      detectedCoreCount: 1,
      effectiveCount: 1,
      manualMaxCount: 1,
      manualMaxPercent: 100,
    }),
  };
  const preferences = { set: vi.fn(async () => undefined) };
  const page = new AutoTeamBuilderPage(
    repository as never,
    {} as never,
    userState as never,
    createI18n(options.language ?? 'en') as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    preferences as never,
  );

  // The one seam every result goes through; it is what loads the six cooldowns.
  (page as unknown as { applyResult(next: AutoBuildResult): void }).applyResult(team(members));
  await new Promise((settle) => setTimeout(settle, 0));

  return page;
}

function entryFor(page: AutoTeamBuilderPage, characterId: number) {
  const entry = page
    .specialChargeTimeline()
    ?.entries.find((candidate) => candidate.characterId === characterId);

  if (!entry) {
    throw new Error(`no timeline entry for ${characterId}`);
  }

  return entry;
}

const FIVE = [
  { id: 101, name: 'Luffy' },
  { id: 102, name: 'Zoro' },
  { id: 103, name: 'Nami' },
  { id: 104, name: 'Usopp' },
  { id: 105, name: 'Sanji' },
];

describe('the special charge timeline counts the start of the quest', () => {
  /* The brief's "done when": a team with a -10 event cut shows specials ready on the right turn. */
  it('gives a -10 event cut to the boosted units on the team, and says so on their row', async () => {
    const page = await createPage(FIVE, { boosted: [103] });

    page.onTimelineEventCutChange({ target: { value: '-10' } } as unknown as Event);

    expect(page.timelineEventCut()).toBe(10);
    expect(entryFor(page, 103).maxLevelTurns).toBe(8);
    expect(page.chargeTimelineChargesLabel(entryFor(page, 103))).toBe('charges in 8');
    expect(page.chargeTimelineStartCutLabel(entryFor(page, 103))).toBe(
      'Cooldown cut at the start: 10 - 10 from the event.',
    );
    // Not boosted, so untouched - and its row says nothing about a cut.
    expect(entryFor(page, 101).maxLevelTurns).toBe(18);
    expect(page.chargeTimelineStartCutLabel(entryFor(page, 101))).toBe('');
    expect(page.chargeTimelineCutReachLabel()).toBe(
      'The event cut goes to the units on your Boosted list above - 1 on this team. Tap "Whole team" when the event cuts every special.',
    );
  });

  it('gives the event cut to the whole team when the player says so', async () => {
    const page = await createPage(FIVE);

    const charges = () =>
      page.specialChargeTimeline()?.entries.map((entry) => entry.maxLevelTurns);

    page.onTimelineEventCutChange({ target: { value: '10' } } as unknown as Event);
    expect(charges()).toEqual([18, 18, 18, 18, 18]);

    page.toggleTimelineEventCutWholeTeam();

    expect(page.timelineEventCutWholeTeam()).toBe(true);
    expect(charges()).toEqual([8, 8, 8, 8, 8]);
  });

  it("reads the Captain's own cut from its text and names it on every row it reaches", async () => {
    const page = await createPage([
      {
        id: 101,
        name: 'Luffy',
        captainAbility:
          'Reduces Special Cooldown of all characters by 1 turn at the start of the fight',
      },
      ...FIVE.slice(1),
    ]);

    expect(page.specialChargeTimeline()?.entries.map((entry) => entry.maxLevelTurns)).toEqual([
      17, 17, 17, 17, 17,
    ]);
    expect(page.chargeTimelineStartCutLabel(entryFor(page, 104))).toBe(
      'Cooldown cut at the start: 1 - 1 from the Captain.',
    );
  });

  it('counts the Cooldown Reduction potential only once the player says the unit is Limit Broken', async () => {
    const page = await createPage([
      ...FIVE.slice(0, 2),
      {
        id: 312,
        name: 'Massacre Soldier Killer',
        potential:
          'Reduces Special Cooldown of this character by 9 turns at the start of the fight',
      },
    ]);

    expect(page.timelineCountLimitBreak()).toBe(false);
    expect(entryFor(page, 312).maxLevelTurns).toBe(18);

    page.toggleTimelineCountLimitBreak();

    expect(entryFor(page, 312).maxLevelTurns).toBe(9);
    expect(page.chargeTimelineStartCutLabel(entryFor(page, 312))).toBe(
      'Cooldown cut at the start: 9 - 9 from Limit Break.',
    );
  });

  it('says a special the cut fully charges is charged at the start, not "with turns to spare"', async () => {
    const page = await createPage(FIVE, { boosted: [102, 103] });

    page.onTimelineEventCutChange({ target: { value: '20' } } as unknown as Event);

    expect(page.chargeTimelineChargesLabel(entryFor(page, 102))).toBe('charged at the start');
    expect(page.chargeTimelineEntryLabel(entryFor(page, 102))).toBe(
      'Charged at the start of the fight, at max special level. At level 1 it takes 5.',
    );

    page.onTimelineEventCutChange({ target: { value: '30' } } as unknown as Event);

    expect(page.chargeTimelineEntryLabel(entryFor(page, 103))).toBe(
      'Charged at the start of the fight.',
    );
  });

  it('names a Captain that charges its own special to MAX', async () => {
    const page = await createPage([
      {
        id: 3798,
        name: 'Rob Lucci',
        captainAbility:
          'Advances Special Cooldown of this character to MAX at the start of the fight, boosts ATK of Striker and Cerebral characters by 3.5x.',
      },
      ...FIVE.slice(1),
    ]);

    expect(entryFor(page, 3798).maxLevelTurns).toBe(0);
    expect(page.chargeTimelineStartCutLabel(entryFor(page, 3798))).toBe(
      'Fully charged at the start - MAX from the Captain.',
    );
  });

  it('writes the same row in Greek', async () => {
    const page = await createPage(
      [
        {
          id: 101,
          name: 'Luffy',
          captainAbility:
            'Reduces Special Cooldown of all characters by 1 turn at the start of the fight',
        },
        ...FIVE.slice(1),
      ],
      { language: 'el', boosted: [103] },
    );

    page.onTimelineEventCutChange({ target: { value: '10' } } as unknown as Event);

    expect(page.chargeTimelineStartCutLabel(entryFor(page, 103))).toBe(
      'Μείωση cooldown στην αρχή: 11 - 10 από το event, 1 από τον Captain.',
    );
    expect(page.chargeTimelineChargesLabel(entryFor(page, 103))).toBe('φορτίζει σε 7');
  });
});

describe('the controls the timeline card adds', () => {
  const template = readFileSync(
    resolve(process.cwd(), 'src/app/pages/auto-team-builder/auto-team-builder.page.html'),
    'utf8',
  );
  const card = template.slice(
    template.indexOf('data-testid="auto-build-charge-timeline"'),
    template.indexOf('data-testid="auto-build-mechanic-checklist"'),
  );

  it('finds the card it is checking', () => {
    // An empty slice would make every negative assertion below pass on nothing.
    expect(card).toContain("t('chargeTimeline.cutLabel')");
    expect(card).toContain('chargeTimelineStartCutLabel(entry)');
  });

  it('labels the event cut input', () => {
    expect(card).toContain('<label for="charge-timeline-event-cut">');
    expect(card).toContain('id="charge-timeline-event-cut"');
  });

  /*
   * An Ionic control moves aria state into its shadow button once and never again, so a pressed
   * state that changes has to live on a native button - the rule the Boosted list already follows.
   */
  it('keeps both pressed-state toggles on native buttons', () => {
    const handlers = ['toggleTimelineEventCutWholeTeam()', 'toggleTimelineCountLimitBreak()'];

    for (const handler of handlers) {
      const at = card.indexOf(handler);
      const openingTag = card.slice(card.lastIndexOf('<', at), at);

      expect(at).toBeGreaterThan(-1);
      // The handler sits inside the opening tag of a native button, which carries the state.
      expect(openingTag).toMatch(/^<button\s+type="button"[^>]*\[attr\.aria-pressed\]=/);
    }

    expect(card).not.toMatch(/<ion-[a-z-]+[^>]*aria-pressed/);
  });
});
