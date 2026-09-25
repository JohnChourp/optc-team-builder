import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { type CharacterDetailRecord } from '../models/optc.models';
import { AutoTeamBuilderRumbleService } from './auto-team-builder-rumble.service';

/*
 * 869f6td5p. The Rumble builder scores every unit as it is BEFORE Level Limit Break.
 *
 * The app cannot know which of a reader's units are LLB'd, and the owner declined to make players
 * maintain investment state (869f13c8m). The engine already built every unit from its pre-LLB
 * passive and special (it reads no super special at all) - but it read `llbresilience` too, and
 * ADDED it to the base line it upgrades, so an LLB'd resistance counted twice against a matching
 * opponent. The decision: no `llb*` and no `gp*` field is read, and the Rumble builder says so.
 *
 * What the engine reads is pinned by WHAT CHANGES when a field is taken away, not by watching
 * property reads: the normalizer copies the whole rumbleData bag into `normalized.raw` for
 * inheritance, so a read-watching proxy reports every key, the LLB ones included, and could never
 * go red. Taking a field away and comparing everything the builder computes - the normalized unit,
 * its score and chips, and a build against an opponent it can counter - answers the real question.
 *
 * The fixture carries 19 of the 20 rumbleData keys the shipped dataset uses, the full set on one
 * unit (Hancock & Nami & Robin, 4294, has the same 19), with every LLB and GP field strong enough
 * that reading it would move a number. `basedOn`, the 20th, is covered by the derived unit below.
 */
const PRE_LLB_FIELDS: Record<string, unknown> = {
  id: 700,
  cost: 30,
  stats: { rumbleType: 'SPT', def: 204, spd: 140 },
  target: { criteria: 'near' },
  pattern: [
    { type: 'Normal', action: 'attack' },
    { type: 'Power', action: 'attack' },
  ],
  ability: [
    { effects: [{ attributes: ['HP'], effect: 'buff', level: 3, targeting: { targets: ['crew'] } }] },
  ],
  special: [
    {
      cooldown: 41,
      effects: [{ amount: 1200, effect: 'damage', type: 'fixed', targeting: { targets: ['enemies'] } }],
    },
  ],
  superspecial: [
    {
      condition: { type: 'specialreceived', team: 'enemy', count: 2 },
      effects: [{ attributes: ['ATK'], effect: 'buff', level: 5, targeting: { targets: ['crew'] } }],
    },
  ],
  resilience: [
    { attribute: 'Action Bind', chance: 30, type: 'debuff' },
    { attribute: '[PSY]', percentage: 30, type: 'damage' },
  ],
};
const LLB_AND_GP_FIELDS: Record<string, unknown> = {
  llbability: [
    {
      effects: [
        { attributes: ['HP'], effect: 'buff', level: 5, targeting: { targets: ['crew'] } },
        { attributes: ['ATK', 'SPD'], effect: 'buff', level: 7, targeting: { targets: ['crew'] } },
      ],
    },
  ],
  llbspecial: [
    {
      cooldown: 20,
      effects: [{ amount: 9000, effect: 'damage', type: 'fixed', targeting: { targets: ['enemies'] } }],
    },
  ],
  llbsuperspecial: [
    {
      condition: { type: 'specialreceived', team: 'enemy', count: 2 },
      effects: [{ attributes: ['ATK'], effect: 'buff', level: 9, targeting: { targets: ['crew'] } }],
    },
  ],
  llbresilience: [
    { attribute: 'Action Bind', chance: 100, type: 'debuff' },
    { attribute: '[PSY]', percentage: 40, type: 'damage' },
  ],
  gpability: [
    { effects: [{ attributes: ['ATK'], effect: 'buff', level: 6, targeting: { targets: ['crew'] } }] },
  ],
  gpspecial: [
    { uses: 2, effects: [{ amount: 5000, effect: 'damage', type: 'fixed', targeting: { targets: ['enemies'] } }] },
  ],
  gpcondition: [{ count: 2, type: 'defeat', team: 'crew' }],
  llbgpability: [
    { effects: [{ attributes: ['DEF'], effect: 'buff', level: 8, targeting: { targets: ['crew'] } }] },
  ],
  llbgpspecial: [
    { uses: 3, effects: [{ amount: 8000, effect: 'damage', type: 'fixed', targeting: { targets: ['enemies'] } }] },
  ],
  llbgpcondition: [{ count: 1, type: 'defeat', team: 'crew' }],
};

describe('Rumble builder scores every unit before Level Limit Break', () => {
  it('computes exactly the same with or without the LLB and GP fields', () => {
    expect(outcome({ ...PRE_LLB_FIELDS, ...LLB_AND_GP_FIELDS })).toEqual(outcome(PRE_LLB_FIELDS));
  });

  it('counts a resistance the opponent triggers once, from the base line only', () => {
    const counters = counterChipsAndScore({ ...PRE_LLB_FIELDS, ...LLB_AND_GP_FIELDS });

    // The base line matches the opponent (Action Bind, PSY damage), so the counter still shows...
    expect(counters.reasonChips).toEqual(expect.arrayContaining(['Opponent counter', 'Matched resistance']));
    // ...and the team is worth exactly what the base line alone makes it worth.
    expect(counters.teamScore).toBe(counterChipsAndScore(PRE_LLB_FIELDS).teamScore);
    // A resistance only the LLB line has is not a counter at all.
    const llbOnly = counterChipsAndScore({
      ...PRE_LLB_FIELDS,
      resilience: [],
      llbresilience: LLB_AND_GP_FIELDS['llbresilience'],
    });

    expect(llbOnly.reasonChips).not.toContain('Matched resistance');
    expect(llbOnly.teamScore).toBe(counterChipsAndScore({ ...PRE_LLB_FIELDS, resilience: [] }).teamScore);
  });

  it('reads exactly these rumbleData fields, and none of the LLB or GP ones', () => {
    const full = { ...PRE_LLB_FIELDS, ...LLB_AND_GP_FIELDS };
    const baseline = outcome(full);
    const read = Object.keys(full).filter((field) => {
      const { [field]: _removed, ...withoutField } = full;

      return JSON.stringify(outcome(withoutField)) !== JSON.stringify(baseline);
    });

    // A change here is a decision: reading an LLB field again means undoing 869f6td5p on purpose.
    expect(read.sort()).toEqual(['ability', 'cost', 'pattern', 'resilience', 'special', 'stats', 'target']);
  });

  it('does not treat a unit whose only Rumble data is its LLB line as usable', () => {
    expect(
      outcome({ id: 700, llbresilience: LLB_AND_GP_FIELDS['llbresilience'], llbability: LLB_AND_GP_FIELDS['llbability'] })
        .normalized,
    ).toBeNull();
  });

  it('says so at the top of the Rumble builder, in English and Greek', () => {
    const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
    const template = read('src/app/pages/auto-team-builder-rumble/auto-team-builder-rumble.page.html');
    const copy = (locale: string) =>
      (JSON.parse(read(`public/i18n/auto-team-builder-rumble/${locale}.json`)) as { hero: Record<string, string> })
        .hero['levelLimitBreak'];

    expect(template).toContain("{{ t('hero.levelLimitBreak') }}");
    expect(copy('en')).toContain('before Level Limit Break');
    expect(copy('el')).toContain('πριν από το Level Limit Break');
  });

  it('inherits a base unit through basedOn without its LLB and GP fields', () => {
    const derived = (base: Record<string, unknown>) =>
      outcome({ id: 701, basedOn: 700 }, createCharacter(700, base));

    expect(derived({ ...PRE_LLB_FIELDS, ...LLB_AND_GP_FIELDS })).toEqual(derived(PRE_LLB_FIELDS));
    // basedOn is read: without it the derived unit has no Rumble data of its own.
    expect(outcome({ id: 701 }, createCharacter(700, PRE_LLB_FIELDS)).normalized).toBeNull();
  });
});

/**
 * Everything the builder computes for one unit: its normalized data (minus the raw bag it copies
 * for inheritance), its score and chips, and a build against an opponent it can counter.
 */
function outcome(rumbleData: Record<string, unknown>, base?: CharacterDetailRecord) {
  const service = createService();
  const unit = createCharacter(typeof rumbleData['id'] === 'number' ? rumbleData['id'] : 700, rumbleData);
  const anchors = [800, 801, 802].map((id) => createCharacter(id, anchorRumbleData(id)));
  const opponent = createOpponent();
  const all = [...(base ? [base] : []), unit, ...anchors, opponent];
  const normalized = service.normalizeRumbleData(unit, new Map(all.map((character) => [character.id, character])));
  const { raw: _raw, ...readable } = normalized ?? { raw: null };
  const scored = service.scoreCandidates(all).find((candidate) => candidate.character.id === unit.id);
  const team = service.buildTeamFromCandidates(all, {
    candidateCharacterIds: [unit.id, ...anchors.map((anchor) => anchor.id)],
    opponentSlots: [{ characterId: opponent.id, role: 'active', index: 0 }],
  });

  return {
    normalized: normalized ? readable : null,
    score: scored ? { baseScore: scored.baseScore, breakdown: scored.breakdown, reasonChips: scored.reasonChips } : null,
    team: {
      totalScore: team.totalScore,
      topFactors: team.topFactors,
      slots: [...team.activeSlots, ...team.benchSlots].map((slot) => ({
        id: slot.unit.character.id,
        score: slot.score,
        reasonChips: slot.reasonChips,
      })),
    },
  };
}

/** The counter score is not in a slot's own score: it is added to the team's total. */
function counterChipsAndScore(rumbleData: Record<string, unknown>) {
  const { team } = outcome(rumbleData);
  const slot = team.slots.find((candidate) => candidate.id === 700);

  return { reasonChips: slot?.reasonChips ?? [], teamScore: team.totalScore };
}

function createService(): AutoTeamBuilderRumbleService {
  return new AutoTeamBuilderRumbleService({
    getRumbleBuilderCandidates: vi.fn().mockResolvedValue([]),
  } as never);
}

/** A PSY unit that Action Binds: both of the fixture's resistances meet it. */
function createOpponent(): CharacterDetailRecord {
  return createCharacter(
    900,
    {
      id: 900,
      stats: { rumbleType: 'DBF', def: 40, spd: 40 },
      special: [
        {
          cooldown: 24,
          effects: [
            {
              attributes: ['Action Bind'],
              effect: 'hinderance',
              chance: 80,
              duration: 10,
              targeting: { targets: ['enemies'] },
            },
          ],
        },
      ],
    },
    'PSY',
  );
}

function anchorRumbleData(id: number): Record<string, unknown> {
  return {
    id,
    cost: 30,
    stats: { rumbleType: 'ATK', def: 100, spd: 100 },
    special: [{ cooldown: 30, effects: [{ effect: 'damage', amount: 3 }] }],
  };
}

function createCharacter(
  id: number,
  rumbleData: Record<string, unknown>,
  type = 'DEX',
): CharacterDetailRecord {
  return {
    id,
    name: `Unit ${id}`,
    searchText: `unit ${id}`,
    isIncomplete: false,
    type,
    classes: ['Fighter'],
    primaryClass: 'Fighter',
    secondaryClass: null,
    stars: 6,
    cost: 55,
    combo: 4,
    captainHpBoost: 0,
    captainAtkBoost: 0,
    captainAverageBoost: 0,
    stats: {
      min: { hp: 1000, atk: 400, rcv: 120 },
      max: { hp: 4200, atk: 1900, rcv: 320 },
      growth: 3,
    },
    regionArtwork: { exactLocal: true, thumbnailGlobal: false, thumbnailJapan: false },
    regionRelease: { availableOnGlobal: null },
    assets: { exactLocal: null, thumbnailLocal: null, thumbnailGlobal: null, thumbnailJapan: null },
    imageUrl: `assets/characters/${id}.png`,
    detailImageUrl: `assets/characters/${id}.png`,
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
      partyConflictKeys: [`unit-${id}`],
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
      rumbleData,
    },
  };
}
