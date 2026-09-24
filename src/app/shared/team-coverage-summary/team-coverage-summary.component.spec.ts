import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  type CaptainCoverageTierKind,
  type CharacterCaptainAbilityCoverage,
  type CharacterDetailRecord,
} from '../../core/models/optc.models';
import { TeamCoverageSummaryComponent } from './team-coverage-summary.component';

/**
 * 869f1zxuy. Which tiers a team covers is decided by `resolveTeamCoverageSummary`, which has its own
 * spec. This pins the shell around it: that its three inputs reach that computation and move it,
 * when the card shows at all, and which words each tier is labelled with.
 *
 * No TestBed, like every component spec here (docs/suite-environments.json): the component is built
 * with `new`, its inputs are set the way a host binds them, and the keys it picks are resolved
 * against the real copy the way the template's `t()` resolves them.
 */

const template = readFileSync(
  resolve(process.cwd(), 'src/app/shared/team-coverage-summary/team-coverage-summary.component.html'),
  'utf8',
);
const copy = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), 'public/i18n/team-coverage-summary/en.json'), 'utf8')),
  el: JSON.parse(readFileSync(resolve(process.cwd(), 'public/i18n/team-coverage-summary/el.json'), 'utf8')),
};

function shown(language: keyof typeof copy, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), copy[language]);
}

/** One tier: every character of Cost 70 or more - the shape the utils spec proves both ways. */
const costSeventyCoverage: CharacterCaptainAbilityCoverage = {
  entries: [
    {
      key: 'captain',
      label: 'Captain Ability',
      tiers: [
        {
          tier: 1,
          kind: 'unconditional-top',
          scope: 'crew-wide',
          characterConditions: {
            universal: true,
            fallbackOther: false,
            selfOnly: false,
            types: [],
            classes: [],
            characterTags: [],
            costRange: { min: 70 },
          },
          teamConditions: [],
          fieldConditions: [],
          triggerConditions: [],
          clauses: ['Boosts ATK of Cost 70 or more characters by 6x'],
          atkBoost: 6,
        },
      ],
    },
  ],
};

function createCharacter(id: number, cost: number, captainAbilityCoverage?: CharacterCaptainAbilityCoverage): CharacterDetailRecord {
  return {
    id,
    name: `Character ${id}`,
    searchText: '',
    isIncomplete: false,
    type: 'DEX',
    classes: ['Fighter'],
    primaryClass: 'Fighter',
    secondaryClass: null,
    stars: 5,
    cost,
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
    imageUrl: 'assets/placeholders/character-card.svg',
    detailImageUrl: 'assets/placeholders/character-card.svg',
    detail: {
      characterId: id,
      captainAbility: null,
      captainAbilityVariants: [],
      captainAbilityCoverage,
      captainNotes: null,
      specialName: null,
      specialText: null,
      specialNotes: null,
      superSpecialText: null,
      superSpecialCriteriaText: null,
      superSpecialNotes: null,
      superSpecialCriteria: null,
      partyConflictKeys: [],
      characterTags: [],
      builderAbilities: [],
      sailorAbilities: [],
      sailorNotes: null,
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: null,
      superTandemData: null,
      superClass: null,
      captainShiftData: null,
      rumbleData: null,
    },
  } satisfies CharacterDetailRecord;
}

const captain = createCharacter(4571, 70, costSeventyCoverage);
const leaderWithoutTiers = createCharacter(1, 70);
const team = (cost: number) => Array.from({ length: 6 }, (_, index) => createCharacter(9001 + index, cost));

function render(inputs: { captain: CharacterDetailRecord | null; friendCaptain: CharacterDetailRecord | null; cost: number; members?: number }) {
  const component = new TeamCoverageSummaryComponent();
  component.captain = inputs.captain;
  component.friendCaptain = inputs.friendCaptain;
  component.members = team(inputs.cost).slice(0, inputs.members ?? 6);

  return component;
}

describe('TeamCoverageSummaryComponent', () => {
  it('draws the card only for a complete team whose leaders have tiers', () => {
    expect(template).toMatch(/@if \(summary\(\)\.isComplete && hasAnyTiers\(\)\) \{\s*<section/u);

    const incomplete = render({ captain, friendCaptain: captain, cost: 70, members: 5 });
    expect(incomplete.hasAnyTiers()).toBe(true);
    expect(incomplete.summary().isComplete).toBe(false);

    const noTiers = render({ captain: leaderWithoutTiers, friendCaptain: null, cost: 70 });
    expect(noTiers.summary().isComplete).toBe(true);
    expect(noTiers.hasAnyTiers()).toBe(false);

    const drawn = render({ captain, friendCaptain: captain, cost: 70 });
    expect(drawn.summary().isComplete && drawn.hasAnyTiers()).toBe(true);
  });

  it.each([
    { when: 'both leaders cover it', captainInput: captain, friendInput: captain, cost: 70, source: 'both', label: 'Both' },
    { when: 'only the Captain covers it', captainInput: captain, friendInput: leaderWithoutTiers, cost: 70, source: 'captain-only', label: 'Captain' },
    { when: 'only the Friend Captain covers it', captainInput: leaderWithoutTiers, friendInput: captain, cost: 70, source: 'friend-only', label: 'Friend' },
    { when: 'the team misses it', captainInput: captain, friendInput: captain, cost: 55, source: 'none', label: 'Not covered' },
  ])('labels a tier by who covers it when $when', ({ captainInput, friendInput, cost, source, label }) => {
    const component = render({ captain: captainInput, friendCaptain: friendInput, cost });
    const [tier] = component.summary().tiers;

    expect(tier?.captureSource).toBe(source);
    expect(shown('en', component.statusKey(source))).toBe(label);
    expect(shown('el', component.statusKey(source))).toEqual(expect.any(String));
  });

  it('recomputes when an input changes, rather than keeping the first team it saw', () => {
    const component = render({ captain, friendCaptain: null, cost: 70 });
    expect(component.summary().tiers[0]?.captureSource).toBe('captain-only');

    component.friendCaptain = captain;
    expect(component.summary().tiers[0]?.captureSource).toBe('both');

    component.members = team(55);
    expect(component.summary().tiers[0]?.captureSource).toBe('none');
  });

  it('labels a source it does not know as not covered, never as covered', () => {
    expect(new TeamCoverageSummaryComponent().statusKey('unexpected')).toBe('tierStatus.none');
  });

  it('has copy in both languages for every key its template builds, every tier kind included', () => {
    const kinds = ['baseline', 'unconditional-top', 'conditional', 'baseline-and-conditional'] as const;
    // A kind added to the model and not here fails to compile, and ng test type-checks this file.
    const everyKind: [Exclude<CaptainCoverageTierKind, (typeof kinds)[number]>] extends [never] ? true : false = true;
    expect(everyKind).toBe(true);

    expect(template).toContain("t('tierKinds.' + kind)");
    expect(template).toContain('t(statusKey(tier.captureSource))');

    for (const key of ['eyebrow', 'title', 'tierLabel', 'pendingConditions', ...kinds.map((kind) => `tierKinds.${kind}`)]) {
      expect(shown('en', key), `en: ${key}`).toEqual(expect.any(String));
      expect(shown('el', key), `el: ${key}`).toEqual(expect.any(String));
    }
  });
});
