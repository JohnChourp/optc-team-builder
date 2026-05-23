import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  AUTO_TEAM_CANDIDATE_LIMIT,
  AUTO_TEAM_BUILDER_CLASSES,
  AUTO_TEAM_BUILDER_DEFAULT_TYPE,
  AUTO_TEAM_BUILDER_TYPES,
  createEmptyAutoBuildCostRange,
  createEmptyAutoBuildLeaderBoostRanges,
  createEmptyAutoBuildManualSlots,
  type AutoBuildManualSlotSelection,
  type AutoBuildInput,
  type AutoBuildProgressSnapshot,
  type AutoBuildResult,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import { type AutoBuildAbilitySource } from '../models/auto-team-builder-ability.models';
import {
  type CharacterCaptainAbilityCoverage,
  type CharacterDetailRecord,
  type ShipRecord,
} from '../models/optc.models';
import { AutoTeamBuildCancelledError } from './auto-team-builder.engine';
import { normalizeCaptainAbilityCoverage } from './optc-repository.service';
import {
  AutoTeamBuildSearchTooLargeError,
  AutoTeamBuilderService,
} from './auto-team-builder.service';
import {
  buildAutoBuildCandidate,
  buildAutoTeamResultFromPreparedContext,
  buildAutoTeamResult,
  hasReadableEffectText,
  prepareAutoTeamBuildContext,
  resolveCharacterPartyConflictKeys,
  resolveLeaderSuperEffectScopeFromEffectText,
} from './auto-team-builder.utils';
import { type AutoTeamBuilderWorkerRequest } from './auto-team-builder.worker.models';

const INPUT = createInput();
type AutoTeamBuilderServiceWithWorkerFactory = {
  createWorker: () => Worker | null;
};
type PreferredLeaderAutoFillResolver = {
  resolvePreferredLeaderAutoFillCharacterIds: (
    records: CharacterDetailRecord[],
    allowedCharacterIds: number[] | undefined,
    input: Pick<
      AutoBuildInput,
      'leaderCostRange' | 'leaderBoostFilters' | 'leaderBoostRanges' | 'requiredAbilities'
    >,
  ) => number[] | undefined;
};
const BIG_MOM_CAPTAIN_ABILITY =
  '<b>Always Active: </b>Boosts HP of [STR], [DEX] and [QCK] characters by 1.3x and changes [RCV] orbs into [SEMLA] orbs.. <b>Standard Captain: </b>Boosts ATK of [STR], [DEX] and [QCK] characters by 3.5x. <b>Powered Up Captain: </b>Boosts ATK of this character by 4.25x, boosts ATK of [STR], [DEX] and [QCK] characters by 4x and reduces damage received by 15%. <b>Rampage Captain: </b>Boosts ATK of this character by 12x and own attacks will ignore damage reducing Barriers and Buffs, boosts ATK of [STR], [DEX] and [QCK] characters by 3.75x and boosts chances of getting [SEMLA] orbs.';
const BROOK_CAPTAIN_ABILITY =
  "Reduces crew's current HP by 80% at the start of the fight, reduces Special Cooldown of all characters by 3 turns at the start of the fight, reduces VS Gauge of all characters by 3 at the start of the fight, boosts ATK of Slasher and Free Spirit characters by 5.25x, boosts HP of Slasher and Free Spirit characters by 1.4x, makes [PSY] and [TND] orbs beneficial for Slasher and Free Spirit characters, and increases duration of any Color Affinity, Advantageous Class Effect and Status ATK Boosting buffs applied by Specials by 1 turn. If your crew has 4+ [Straw Hat Pirates], [Paramythia-type] or [Scientist] characters and HP is below 25% at the start of the turn, boosts ATK of Slasher and Free Spirit characters by 6.3x instead.";

describe('Auto team builder', () => {
  beforeAll(() => {
    vi.stubGlobal('DOMParser', new JSDOM('').window.DOMParser);
  });

  it('keeps the synthetic favorites regression anchored on newest favorite 4556', () => {
    const favoriteIds = createSynthetic4556FavoriteIds();

    expect(favoriteIds).toContain(4556);
    expect(favoriteIds).toContain(4549);
    expect(Math.max(...favoriteIds)).toBe(4556);
  });

  it('loads the synthetic preset with required manual 4556 leaders and all broad filters selected', () => {
    const preset = createSynthetic4556Preset();

    expect(
      preset.manualSelection?.manualSlots?.find((slot) => slot.role === 'captain')?.characterIds,
    ).toContain(4556);
    expect(
      preset.manualSelection?.manualSlots?.find((slot) => slot.role === 'friendCaptain')
        ?.characterIds,
    ).toContain(4556);
    expect(
      preset.manualSelection?.manualSlots?.find((slot) => slot.role === 'captain')
        ?.requiredCharacterId,
    ).toBe(4556);
    expect(
      preset.manualSelection?.manualSlots?.find((slot) => slot.role === 'friendCaptain')
        ?.requiredCharacterId,
    ).toBe(4556);
    expect(preset.manualSelection?.captainLeaderId).toBe(4556);
    expect(preset.manualSelection?.friendCaptainLeaderId).toBe(4556);
    expect(preset.filters?.selectedTypes).toEqual([...AUTO_TEAM_BUILDER_TYPES]);
    expect(preset.filters?.selectedClasses).toEqual([...AUTO_TEAM_BUILDER_CLASSES]);
    expect(preset.filters?.favoritesOnly).toBe(true);
  });

  it('completes the exported broad-filter 4556 leader case without a 257-attempt fallback plan', async () => {
    const favoriteIds = createSynthetic4556FavoriteIds();
    const progressSnapshots: AutoBuildProgressSnapshot[] = [];
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createExported4556ReproRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        favoritesOnly: true,
        favoriteCharacterIds: favoriteIds,
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualLeaderSlots(4556),
      },
      {
        workerCount: 1,
        onProgress: (snapshot) => progressSnapshots.push(snapshot),
      },
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(4556);
    expect(result?.slots[1]?.character.id).toBe(4556);
    expect(
      progressSnapshots.find((snapshot) => snapshot.stage === 'exactAttempt')?.totalAttempts,
    ).toBeLessThan(257);
    expect(progressSnapshots.some((snapshot) => snapshot.totalAttempts === 257)).toBe(false);
    expect(progressSnapshots.at(-1)).toMatchObject({
      stage: 'completed',
      attemptCountFinal: true,
    });
  });

  it('parses type-targeted leader super effect scope text', () => {
    expect(
      resolveLeaderSuperEffectScopeFromEffectText(
        'Changes DEX and STR characters to Super DEX and Super STR.',
      ),
    ).toEqual({
      allowedClasses: [],
      allowedTypes: ['DEX', 'STR'],
      isParseable: true,
    });
  });

  it('parses class-targeted leader super effect scope text', () => {
    expect(
      resolveLeaderSuperEffectScopeFromEffectText(
        'Transforms Free Spirit characters into Super Free Spirit characters.',
      ),
    ).toEqual({
      allowedClasses: ['Free Spirit'],
      allowedTypes: [],
      isParseable: true,
    });
  });

  it('parses standard captain boost and scope from legacy Big Mom branch text', () => {
    const candidate = buildAutoBuildCandidate(
      createBigMomCaptainRecord(),
      createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT']),
      0,
      1,
    );

    expect(candidate.captainText).not.toContain('<b>');
    expect(candidate.tags.captainAtkMultiplier).toBe(3.5);
    expect(candidate.tags.captainHpMultiplier).toBe(1.3);
    expect(candidate.tags.captainScope.allowedTypes).toEqual(['DEX', 'STR', 'QCK']);
    expect(candidate.tags.captainScope.hasTypeRestriction).toBe(true);
  });

  it('matches the prepared-context builder result with the compatibility builder', () => {
    const records = createStrictMixedTeamRecords();
    const input = createInput(['DEX', 'PSY'], ['Fighter', 'Slasher'], {
      requireUniqueBaseCharacterNames: true,
    });
    const context = prepareAutoTeamBuildContext(records);

    expect(buildAutoTeamResultFromPreparedContext(context, input)).toEqual(
      buildAutoTeamResult(records, input),
    );
  });

  it('matches prepared-context results with selected names and strict battle groups', () => {
    const records = createPreparedContextStressRecords();
    const input = createInput(['DEX'], ['Fighter'], {
      selectedCharacterTags: ['Straw Hat Pirates'],
      selectedCharacterNames: ['Bind Specialist'],
      requireAllSelectedCharacterTagsInTeam: true,
      requireAllSelectedCharacterNamesInTeam: true,
      requireUniqueBaseCharacterNames: true,
      battleRequirements: [
        createBattleRequirementWithGroups('stage-3', [
          [
            {
              abilityKey: 'remove_special_bind',
              minTurns: 5,
              slotTokens: [],
              requiredCharacterCount: 1,
            },
          ],
          [
            {
              abilityKey: 'remove_atk_down',
              minTurns: 5,
              slotTokens: [],
              requiredCharacterCount: 1,
            },
          ],
        ]),
      ],
    });
    const context = prepareAutoTeamBuildContext(records);
    const preparedResult = buildAutoTeamResultFromPreparedContext(context, input);

    expect(preparedResult).toEqual(buildAutoTeamResult(records, input));
    expect(preparedResult?.coverage.battleRequirements?.matchesAll).toBe(true);
  });

  it('normalizes HTML ability text before deriving candidate tags', () => {
    const candidate = buildAutoBuildCandidate(
      createCharacterRecord({
        id: 5901,
        primaryClass: 'Fighter',
        detail: {
          captainAbility:
            '<p><b>Always Active: </b>Boosts HP of DEX characters by 1.3x &amp;lt;script&amp;gt;.</p><script>Boosts ATK of all characters by 99x.</script><ul><li><b>Standard Captain: </b>Boosts ATK of DEX characters by 3.5x.</li></ul>',
          specialText:
            '<div>Reduces Bind duration by 5 turns.<br>Changes orbs into Matching Orbs.</div><style>reduces Despair duration by 99 turns.</style>',
        },
      }),
      createInput(['DEX'], ['Fighter']),
      0,
      1,
    );

    expect(candidate.captainText).toContain('&lt;script&gt;');
    expect(candidate.captainText).not.toContain('<script>');
    expect(candidate.tags.captainAtkMultiplier).toBe(3.5);
    expect(candidate.tags.captainHpMultiplier).toBe(1.3);
    expect(candidate.tags.captainScope.allowedTypes).toEqual(['DEX']);
    expect(candidate.tags.utilityRoles).toEqual(expect.arrayContaining(['bind']));
    expect(candidate.tags.utilityRoles).not.toContain('despair');
  });

  it('parses burst, consistency, utility, and multi-class captain scope from slim effect text', () => {
    const candidate = buildAutoBuildCandidate(
      createCharacterRecord({
        id: 5900,
        primaryClass: 'Fighter',
        detail: {
          captainAbility:
            'Boosts ATK of DEX, Fighter and Slasher characters by 5.25x and HP by 1.4x.',
          specialText:
            'Boosts orb effects by 2.5x, boosts color affinity by 2x, changes orbs into Matching Orbs, reduces Bind and Despair by 5 turns and reduces Special Cooldown by 1 turn.',
        },
      }),
      createInput(['DEX'], ['Fighter', 'Slasher']),
      0,
      1,
    );

    expect(candidate.tags.captainScope.allowedClasses).toEqual(['Fighter', 'Slasher']);
    expect(candidate.tags.captainScope.allowedTypes).toEqual(['DEX']);
    expect(candidate.tags.captainScope.hasCostRestriction).toBe(false);
    expect(candidate.tags.captainScope.maxAllowedCost).toBeNull();
    expect(candidate.tags.captainScope.hasClassRestriction).toBe(true);
    expect(candidate.tags.captainScope.hasTypeRestriction).toBe(true);
    expect(candidate.tags.captainScope.matchedSelectedClasses).toEqual(['Fighter', 'Slasher']);
    expect(candidate.tags.captainScope.coversAllSelectedClasses).toBe(true);
    expect(candidate.tags.captainScope.matchedSelectedTypes).toEqual(['DEX']);
    expect(candidate.tags.captainScope.coversAllSelectedTypes).toBe(true);
    expect(candidate.tags.captainScope.matchesClass).toBe(true);
    expect(candidate.matchesAllSelectedClasses).toBe(false);
    expect(candidate.tags.burstRoles).toEqual(
      expect.arrayContaining(['orbBoost', 'colorAffinity']),
    );
    expect(candidate.tags.burstRoles).not.toContain('atkBoost');
    expect(candidate.tags.consistencyRoles).toEqual(
      expect.arrayContaining(['matchingOrbs', 'orbChange', 'cooldownReduction']),
    );
    expect(candidate.tags.utilityRoles).toEqual(expect.arrayContaining(['bind', 'despair']));
  });

  it('ignores non-boost all-character captain clauses when deriving leader scope', () => {
    const candidate = buildAutoBuildCandidate(
      createCharacterRecord({
        id: 4426,
        name: 'Brook - Freezing Chill of the Dead',
        type: 'PSY',
        primaryClass: 'Slasher',
        secondaryClass: 'Free Spirit',
        detail: {
          captainAbility: BROOK_CAPTAIN_ABILITY,
        },
      }),
      createInput(['PSY'], ['Slasher', 'Free Spirit']),
      0,
      1,
    );

    expect(candidate.tags.captainAtkMultiplier).toBe(5.25);
    expect(candidate.tags.captainHpMultiplier).toBe(1.4);
    expect(candidate.tags.captainScope.allCharacters).toBe(false);
    expect(candidate.tags.captainScope.allowedClasses).toEqual(
      expect.arrayContaining(['Slasher', 'Free Spirit']),
    );
    expect(candidate.tags.captainScope.allowedClasses).toHaveLength(2);
    expect(candidate.tags.captainScope.hasClassRestriction).toBe(true);
  });

  it('builds combined captain labels for partial multi-type coverage', () => {
    const candidate = buildAutoBuildCandidate(
      createCharacterRecord({
        id: 5915,
        type: 'DEX',
        primaryClass: 'Fighter',
        detail: {
          captainAbility: 'Boosts ATK of DEX, PSY and Fighter characters by 5x and HP by 1.3x.',
          specialText: 'Boosts color affinity of DEX and PSY characters by 2x for 1 turn.',
        },
      }),
      createInput(['DEX', 'PSY', 'INT']),
      0,
      1,
    );

    expect(candidate.tags.captainScope.matchedSelectedTypes).toEqual(['DEX', 'PSY']);
    expect(candidate.tags.captainScope.matchedSelectedTypeCount).toBe(2);
    expect(candidate.tags.captainScope.coversAllSelectedTypes).toBe(false);
    expect(candidate.reasonChips).toContain('DEX / PSY captain');
  });

  it('ignores low-cost-only Buggy text when deriving captain boost scope', () => {
    const candidate = buildAutoBuildCandidate(
      createCharacterRecord({
        id: 2035,
        name: 'Buggy the Genius Jester',
        type: 'INT',
        cost: 40,
        primaryClass: 'Driven',
        secondaryClass: 'Shooter',
        detail: {
          captainAbility:
            'Boosts ATK of Cost 40 or less characters by 1.75x and reduces ATK and HP of Cost 41 or higher characters by 50%. Guarantees duplicating a drop upon completion of the island.',
          specialText:
            'Boosts ATK of Cost 40 or less characters by 2x for 2 turns and changes orbs of Cost 40 or lower characters into Matching Orbs.',
        },
      }),
      createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT']),
      0,
      1,
    );

    expect(candidate.tags.captainScope.hasCostRestriction).toBe(false);
    expect(candidate.tags.captainScope.maxAllowedCost).toBeNull();
  });

  it('does not treat bonus low-cost captain branches as a hard cost restriction', () => {
    const candidate = buildAutoBuildCandidate(
      createCharacterRecord({
        id: 4111,
        name: 'Buggy & Crocodile & Mihawk',
        type: 'QCK',
        primaryClass: 'Driven',
        secondaryClass: 'Slasher',
        detail: {
          captainAbility:
            'Reduces Special Cooldown of Driven and Slasher characters by 1 turn at the start of the fight, boosts HP of Driven and Slasher characters by 1.3x, boosts ATK of Driven and Slasher characters by 5.5x, by 6x instead if they are a Cost 40 or less character, makes [TND] orbs beneficial for Driven and Slasher characters, and reduces damage received by 20%.',
          specialText: 'Boosts Orb Effects of Driven and Slasher characters by 2.75x for 2 turns.',
        },
      }),
      createInput(['QCK'], ['Driven', 'Slasher']),
      0,
      1,
    );

    expect(candidate.tags.captainScope.hasCostRestriction).toBe(false);
    expect(candidate.tags.captainScope.maxAllowedCost).toBeNull();
  });

  it('ignores recent placeholders with empty effect text', () => {
    const emptyRecent = createCharacterRecord({
      id: 6000,
      primaryClass: 'Fighter',
      detail: {},
    });

    expect(hasReadableEffectText(emptyRecent)).toBe(false);

    const result = buildAutoTeamResult(
      [
        emptyRecent,
        createCharacterRecord({
          id: 5900,
          primaryClass: 'Fighter',
          secondaryClass: 'Free Spirit',
          detail: {
            captainAbility:
              'Boosts ATK of DEX and Fighter characters by 5.25x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
            specialText:
              'Boosts orb effects of DEX and Fighter characters by 2.25x for 1 turn and changes orbs into Matching Orbs. Reduces Bind duration by 5 turns.',
            builderAbilities: [
              {
                key: 'remove_bind',
                label: 'Remove Bind',
                minTurns: 5,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
            ],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      INPUT,
    );

    expect(result).not.toBeNull();
    expect(result?.candidateCount).toBe(5);
    expect(result?.slots.some((slot) => slot.character.id === 6000)).toBe(false);
  });

  it('covers required abilities team-wide across different characters', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 5900,
          primaryClass: 'Fighter',
          secondaryClass: 'Free Spirit',
          detail: {
            captainAbility:
              'Boosts ATK of DEX and Fighter characters by 5.25x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
            specialText:
              'Boosts orb effects of DEX and Fighter characters by 2.25x for 1 turn and changes orbs into Matching Orbs. Reduces Bind duration by 5 turns.',
            builderAbilities: [
              {
                key: 'remove_bind',
                label: 'Remove Bind',
                minTurns: 5,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
            ],
          },
        }),
        createCharacterRecord({
          id: 5801,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Bind duration by 5 turns.',
            builderAbilities: [
              {
                key: 'remove_bind',
                label: 'Remove Bind',
                minTurns: 5,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
            ],
          },
        }),
        createCharacterRecord({
          id: 5802,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Despair duration by 6 turns.',
            builderAbilities: [
              {
                key: 'remove_despair',
                label: 'Remove Despair',
                minTurns: 6,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
            ],
          },
        }),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          { abilityKey: 'remove_bind', minTurns: 5, slotTokens: [], requiredCharacterCount: 1 },
          { abilityKey: 'remove_despair', minTurns: 5, slotTokens: [], requiredCharacterCount: 1 },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
    expect(result?.coverage.abilityRequirements.matched).toEqual([
      { abilityKey: 'remove_bind', minTurns: 5, slotTokens: [], requiredCharacterCount: 1 },
      { abilityKey: 'remove_despair', minTurns: 5, slotTokens: [], requiredCharacterCount: 1 },
    ]);
  });

  it('requires multiple matching team slots for the same ability when the count is greater than one', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5801,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Bind duration by 5 turns.',
            builderAbilities: [
              {
                key: 'remove_bind',
                label: 'Remove Bind',
                minTurns: 5,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
            ],
          },
        }),
        createCharacterRecord({
          id: 5808,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Bind duration by 6 turns.',
            builderAbilities: [
              {
                key: 'remove_bind',
                label: 'Remove Bind',
                minTurns: 6,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
            ],
          },
        }),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          { abilityKey: 'remove_bind', minTurns: 5, slotTokens: [], requiredCharacterCount: 2 },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
    expect(result?.coverage.abilityRequirements.matched).toEqual([
      { abilityKey: 'remove_bind', minTurns: 5, slotTokens: [], requiredCharacterCount: 2 },
    ]);
  });

  it('requires all abilities in a required character group on the same team slot', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5821,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Bind duration by 5 turns.',
            builderAbilities: [
              {
                key: 'remove_bind',
                label: 'Remove Bind',
                minTurns: 5,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
            ],
          },
        }),
        createCharacterRecord({
          id: 5822,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Despair duration by 5 turns.',
            builderAbilities: [
              {
                key: 'remove_despair',
                label: 'Remove Despair',
                minTurns: 5,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
            ],
          },
        }),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      {
        ...INPUT,
        requiredCharacterGroups: [
          {
            id: 'group-1',
            abilities: [
              { abilityKey: 'remove_bind', minTurns: 5, slotTokens: [], requiredCharacterCount: 1 },
              {
                abilityKey: 'remove_despair',
                minTurns: 5,
                slotTokens: [],
                requiredCharacterCount: 1,
              },
            ],
          },
        ],
      },
    );

    expect(result).toBeNull();
  });

  it('matches required character groups against distinct final slots', () => {
    const sharedUtility = {
      key: 'remove_bind',
      label: 'Remove Bind',
      minTurns: 5,
      isCompleteRemoval: false,
      slotTokens: [],
      source: 'specialText' as const,
    };
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5823,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Bind duration by 5 turns.',
            builderAbilities: [sharedUtility],
          },
        }),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createAtkSubRecord(),
      ],
      {
        ...INPUT,
        requiredCharacterGroups: [
          {
            id: 'group-1',
            abilities: [
              { abilityKey: 'remove_bind', minTurns: 5, slotTokens: [], requiredCharacterCount: 1 },
            ],
          },
          {
            id: 'group-2',
            abilities: [
              { abilityKey: 'remove_bind', minTurns: 5, slotTokens: [], requiredCharacterCount: 1 },
            ],
          },
        ],
      },
    );

    expect(result).toBeNull();
  });

  it('allows one character to merge multiple required character bundles inside the same battle', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 9821,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Special Bind and ATK Down duration by 5 turns.',
            sailorAbilities: ['Reduces Special Bind duration on this character by 5 turns.'],
            builderAbilities: [
              createBuilderAbility('remove_special_bind', 'Remove Special Bind', 5, 'specialText'),
              createBuilderAbility('remove_atk_down', 'Remove ATK Down', 5, 'specialText'),
              createBuilderAbility(
                'crewmate_recover_special_bind',
                'Crewmate Special Bind Recovery',
                5,
                'sailorAbilities',
              ),
            ],
          },
        }),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createAtkSubRecord(),
      ],
      {
        ...INPUT,
        requiredCharacterGroups: [],
        battleRequirements: [
          {
            id: 'battle-1',
            title: 'Battle 1',
            enemyMechanics: [],
            requiredCharacterGroups: [
              {
                id: 'special-bind-character',
                abilities: [
                  {
                    abilityKey: 'remove_special_bind',
                    minTurns: 5,
                    slotTokens: [],
                    requiredCharacterCount: 1,
                  },
                  {
                    abilityKey: 'crewmate_recover_special_bind',
                    minTurns: 5,
                    slotTokens: [],
                    requiredCharacterCount: 1,
                  },
                ],
              },
              {
                id: 'atk-down-character',
                abilities: [
                  {
                    abilityKey: 'remove_atk_down',
                    minTurns: 5,
                    slotTokens: [],
                    requiredCharacterCount: 1,
                  },
                ],
              },
            ],
          },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.slots.map((slot) => slot.character.id)).toContain(9821);
    expect(result?.coverage.battleRequirements?.matchesAll).toBe(true);
  });

  it('prefers distinct characters for same-battle required character groups when they fit', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 9830,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Special Bind and ATK Down duration by 5 turns.',
            sailorAbilities: ['Reduces Special Bind duration on this character by 5 turns.'],
            builderAbilities: [
              createBuilderAbility('remove_special_bind', 'Remove Special Bind', 5, 'specialText'),
              createBuilderAbility('remove_atk_down', 'Remove ATK Down', 5, 'specialText'),
              createBuilderAbility(
                'crewmate_recover_special_bind',
                'Crewmate Special Bind Recovery',
                5,
                'sailorAbilities',
              ),
            ],
          },
        }),
        createCharacterRecord({
          id: 9828,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Special Bind duration by 5 turns.',
            sailorAbilities: ['Reduces Special Bind duration on this character by 5 turns.'],
            builderAbilities: [
              createBuilderAbility('remove_special_bind', 'Remove Special Bind', 5, 'specialText'),
              createBuilderAbility(
                'crewmate_recover_special_bind',
                'Crewmate Special Bind Recovery',
                5,
                'sailorAbilities',
              ),
            ],
          },
        }),
        createCharacterRecord({
          id: 9829,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces ATK Down duration by 5 turns.',
            builderAbilities: [
              createBuilderAbility('remove_atk_down', 'Remove ATK Down', 5, 'specialText'),
            ],
          },
        }),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
      ],
      {
        ...INPUT,
        requiredCharacterGroups: [],
        battleRequirements: [
          {
            id: 'battle-1',
            title: 'Battle 1',
            enemyMechanics: [],
            requiredCharacterGroups: [
              {
                id: 'special-bind-character',
                abilities: [
                  {
                    abilityKey: 'remove_special_bind',
                    minTurns: 5,
                    slotTokens: [],
                    requiredCharacterCount: 1,
                  },
                  {
                    abilityKey: 'crewmate_recover_special_bind',
                    minTurns: 5,
                    slotTokens: [],
                    requiredCharacterCount: 1,
                  },
                ],
              },
              {
                id: 'atk-down-character',
                abilities: [
                  {
                    abilityKey: 'remove_atk_down',
                    minTurns: 5,
                    slotTokens: [],
                    requiredCharacterCount: 1,
                  },
                ],
              },
            ],
          },
        ],
      },
    );
    const slotIds = result?.slots.map((slot) => slot.character.id) ?? [];

    expect(result).not.toBeNull();
    expect(slotIds).toContain(9828);
    expect(slotIds).toContain(9829);
    expect(result?.coverage.battleRequirements?.matchesAll).toBe(true);
  });

  it('does not reuse the same battle counter across different battles', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 9822,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Bind duration by 5 turns.',
            builderAbilities: [createBuilderAbility('remove_bind', 'Remove Bind', 5)],
          },
        }),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createAtkSubRecord(),
      ],
      {
        ...INPUT,
        requiredCharacterGroups: [],
        battleRequirements: [
          createBindBattleRequirement('battle-1'),
          createBindBattleRequirement('battle-2'),
        ],
      },
    );

    expect(result).toBeNull();
  });

  it('matches leader-scoped ability requirements against captain or friend captain slots only', () => {
    const result = buildAutoTeamResult(
      [
        createBindLeaderRecord(6810),
        createCaptainRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createAtkSubRecord(),
      ],
      {
        ...INPUT,
        manualSlots: createManualSlots({
          captain: [6810],
        }),
        captainCharacterId: 6810,
        requiredAbilities: [
          {
            abilityKey: 'remove_bind',
            minTurns: 5,
            slotTokens: [],
            requiredCharacterCount: 1,
            slotScope: 'leader',
          },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.matched).toEqual([
      {
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
        slotScope: 'leader',
      },
    ]);
  });

  it('matches global captain-source ability requirements from a leader Captain Ability', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainAbilityBindLeaderRecord(6820),
        createCaptainRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createAtkSubRecord(),
      ],
      {
        ...INPUT,
        manualSlots: createManualSlots({
          captain: [6820],
        }),
        captainCharacterId: 6820,
        requiredAbilities: [
          {
            abilityKey: 'remove_bind',
            minTurns: 5,
            slotTokens: [],
            requiredCharacterCount: 1,
            slotScope: 'leader',
            sourceScope: 'captainAbility',
          },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
    expect(result?.coverage.abilityRequirements.requested).toEqual([
      {
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
        slotScope: 'leader',
        sourceScope: 'captainAbility',
      },
    ]);
    expect(result?.coverage.abilityRequirements.matched).toEqual([
      {
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
        slotScope: 'leader',
        sourceScope: 'captainAbility',
      },
    ]);
  });

  it('does not turn Captain Ability tier coverage into selected captain-source requirements', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainAbilityBindLeaderRecord(6820),
        createCaptainRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createAtkSubRecord(),
      ],
      {
        ...INPUT,
        manualSlots: createManualSlots({
          captain: [6820],
        }),
        captainCharacterId: 6820,
        requireFullCaptainAbilityCoverage: true,
        requiredAbilities: [],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.requested).toEqual([]);
    expect(result?.coverage.abilityRequirements.matched).toEqual([]);
  });

  it('does not match a captain-source ability requirement from leader Special text', () => {
    const result = buildAutoTeamResult(
      [
        createBindLeaderRecord(6821),
        createCaptainRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createAtkSubRecord(),
      ],
      {
        ...INPUT,
        manualSlots: createManualSlots({
          captain: [6821],
        }),
        captainCharacterId: 6821,
        requiredAbilities: [
          {
            abilityKey: 'remove_bind',
            minTurns: 5,
            slotTokens: [],
            requiredCharacterCount: 1,
            slotScope: 'leader',
            sourceScope: 'captainAbility',
          },
        ],
      },
    );

    expect(result).toBeNull();
  });

  it('matches friend-captain source ability requirements from Friend Captain Ability', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCaptainAbilityBindLeaderRecord(6822),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createAtkSubRecord(),
      ],
      {
        ...INPUT,
        manualSlots: createManualSlots({
          captain: [5900],
          friendCaptain: [6822],
        }),
        captainCharacterId: 5900,
        friendCaptainCharacterId: 6822,
        requiredAbilities: [
          {
            abilityKey: 'remove_bind',
            minTurns: 5,
            slotTokens: [],
            requiredCharacterCount: 1,
            slotScope: 'leader',
            sourceScope: 'captainAbility',
          },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.slots.find((slot) => slot.role === 'friendCaptain')?.character.id).toBe(6822);
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
    expect(result?.coverage.abilityRequirements.requested).toEqual([
      {
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
        slotScope: 'leader',
        sourceScope: 'captainAbility',
      },
    ]);
    expect(result?.coverage.abilityRequirements.matched).toEqual([
      {
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
        slotScope: 'leader',
        sourceScope: 'captainAbility',
      },
    ]);
  });

  it('keeps normal special requirements alongside captain-source requirements', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainAbilityBindLeaderRecord(6823),
        createCaptainRecord(),
        createCharacterRecord({
          id: 6824,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Bind duration by 5 turns.',
            builderAbilities: [createBuilderAbility('remove_bind', 'Remove Bind', 5)],
          },
        }),
        createAffinitySubRecord(),
        createConsistencySubRecord(),
        createAtkSubRecord(),
      ],
      {
        ...INPUT,
        manualSlots: createManualSlots({
          captain: [6823],
        }),
        captainCharacterId: 6823,
        requiredAbilities: [
          {
            abilityKey: 'remove_bind',
            minTurns: 5,
            slotTokens: [],
            requiredCharacterCount: 1,
            slotScope: 'leader',
            sourceScope: 'captainAbility',
          },
          {
            abilityKey: 'remove_bind',
            minTurns: 5,
            slotTokens: [],
            requiredCharacterCount: 1,
            slotScope: 'sub',
          },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.slots.map((slot) => slot.character.id)).toContain(6824);
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
    expect(result?.coverage.abilityRequirements.matched).toEqual([
      {
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
        slotScope: 'leader',
        sourceScope: 'captainAbility',
      },
      {
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
        slotScope: 'sub',
      },
    ]);
  });

  it('does not let leader abilities satisfy sub-scoped ability requirements', () => {
    const result = buildAutoTeamResult(
      [
        createBindLeaderRecord(6811),
        createBindLeaderRecord(5900),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createAtkSubRecord(),
      ],
      {
        ...INPUT,
        manualSlots: createManualSlots({
          captain: [6811],
        }),
        captainCharacterId: 6811,
        requiredAbilities: [
          {
            abilityKey: 'remove_bind',
            minTurns: 5,
            slotTokens: [],
            requiredCharacterCount: 2,
            slotScope: 'sub',
          },
        ],
      },
    );

    expect(result).toBeNull();
  });

  it('fails when the team does not reach the requested ability slot count', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5801,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Bind duration by 5 turns.',
            builderAbilities: [
              {
                key: 'remove_bind',
                label: 'Remove Bind',
                minTurns: 5,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
            ],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          { abilityKey: 'remove_bind', minTurns: 5, slotTokens: [], requiredCharacterCount: 2 },
        ],
      },
    );

    expect(result).toBeNull();
  });

  it('counts duplicated captain and friend captain slots separately toward the requirement', () => {
    const sharedLeader = createCharacterRecord({
      id: 5812,
      primaryClass: 'Fighter',
      detail: {
        captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
        specialText: 'Reduces Bind duration by 5 turns.',
        builderAbilities: [
          {
            key: 'remove_bind',
            label: 'Remove Bind',
            minTurns: 5,
            isCompleteRemoval: false,
            slotTokens: [],
            source: 'specialText',
          },
        ],
      },
    });
    const result = buildAutoTeamResult(
      [
        sharedLeader,
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createOffClassRedundantSubRecord(),
      ],
      {
        ...INPUT,
        captainCharacterId: 5812,
        friendCaptainCharacterId: 5812,
        requiredAbilities: [
          { abilityKey: 'remove_bind', minTurns: 5, slotTokens: [], requiredCharacterCount: 2 },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
  });

  it('does not satisfy guaranteed extra-drop requirements from captain-source abilities', () => {
    const input = createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT'], ['Fighter']);
    const result = buildAutoTeamResult(createExtraDropLeaderSelectionRecords(), {
      ...input,
      requiredAbilities: [
        {
          abilityKey: 'extra_drop_guaranteed',
          minTurns: null,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
      ],
    });

    expect(result).toBeNull();
  });

  it('ignores sub-only captain-source extra-drop abilities for generic requirements', () => {
    const input = createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT'], ['Fighter'], {
      captainCharacterId: 1588,
      friendCaptainCharacterId: 1588,
    });
    const result = buildAutoTeamResult(createSubOnlyExtraDropTeamRecords(), {
      ...input,
      requiredAbilities: [
        {
          abilityKey: 'extra_drop_guaranteed',
          minTurns: null,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
      ],
    });

    expect(result).toBeNull();
  });

  it('does not relax a manually selected captain for captain-source extra-drop coverage', () => {
    const input = createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT'], ['Fighter'], {
      captainCharacterId: 1588,
      friendCaptainCharacterId: 2035,
    });
    const result = buildAutoTeamResult(createExtraDropLeaderSelectionRecords(), {
      ...input,
      requiredAbilities: [
        {
          abilityKey: 'extra_drop_guaranteed',
          minTurns: null,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
      ],
    });

    expect(result).toBeNull();
  });

  it('allows matching base character names when the unique-name toggle is off', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 5814,
          name: 'Monkey D. Luffy',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
          },
        }),
        createCharacterRecord({
          id: 5815,
          name: 'Monkey D. Luffy - Gear 2',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts ATK of Fighter characters by 2.25x for 1 turn.',
          },
        }),
        createCharacterRecord({
          id: 5816,
          name: 'Portgas D. Ace',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.25x.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        manualSlots: createManualSlots({
          captain: [5814],
          friendCaptain: [5816],
          sub1: [5815],
        }),
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.map((slot) => slot.character.name)).toEqual(
      expect.arrayContaining(['Monkey D. Luffy', 'Monkey D. Luffy - Gear 2']),
    );
  });

  it('relaxes a manual sub that reuses the same base character name when the toggle is on', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 5814,
          name: 'Monkey D. Luffy',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
          },
        }),
        createCharacterRecord({
          id: 5815,
          name: 'Monkey D. Luffy - Gear 2',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts ATK of Fighter characters by 2.25x for 1 turn.',
          },
        }),
        createCharacterRecord({
          id: 5816,
          name: 'Portgas D. Ace',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.25x.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualSlots({
          captain: [5814],
          friendCaptain: [5816],
          sub1: [5815],
        }),
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 5815)).toBe(false);
  });

  it('relaxes duplicate base names across manual leader and sub slot picks when the toggle is on', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 5817,
          name: 'Monkey D. Luffy',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
          },
        }),
        createCharacterRecord({
          id: 5818,
          name: 'Portgas D. Ace',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.1x.',
          },
        }),
        createCharacterRecord({
          id: 5819,
          name: 'Monkey D. Luffy - Gear 2',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts ATK of Fighter characters by 2.25x for 1 turn.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualSlots({
          captain: [5817],
          friendCaptain: [5818],
          sub1: [5819],
        }),
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 5819)).toBe(false);
  });

  it('relaxes Cora when Corazon is already selected and unique names are required', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 5830,
          name: 'Corazon - Rain, Rain, Go Away',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
          },
        }),
        createCharacterRecord({
          id: 5831,
          name: 'Portgas D. Ace',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.25x.',
          },
        }),
        createCharacterRecord({
          id: 5832,
          name: 'Cora - Grateful Love',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts ATK of Fighter characters by 2.25x for 1 turn.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualSlots({
          captain: [5830],
          friendCaptain: [5831],
          sub1: [5832],
        }),
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 5832)).toBe(false);
  });

  it('relaxes Big Mom dual units when Olin is already selected and unique names are required', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 3766,
          name: 'Olin the Oiran - Mighty Combination Attack',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.25x.',
          },
        }),
        createCharacterRecord({
          id: 4522,
          name: 'Blackbeard & Kuzan - Common Interests',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.25x.',
          },
        }),
        createCharacterRecord({
          id: 4268,
          name: 'Big Mom & Katakuri - Beginning of Hell',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts ATK of Fighter characters by 2.5x for 1 turn.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualSlots({
          captain: [3766],
          friendCaptain: [4522],
          sub1: [4268],
        }),
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 4268)).toBe(false);
    expect(result?.slots.some((slot) => slot.character.id === 5890)).toBe(true);
  });

  it('allows the friend captain to reuse the same base character name when the toggle is on', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 5822,
          name: 'Monkey D. Luffy',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
          },
        }),
        createCharacterRecord({
          id: 5823,
          name: 'Monkey D. Luffy - Gear Third',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.1x.',
          },
        }),
        createCharacterRecord({
          id: 5824,
          name: 'Portgas D. Ace',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts ATK of Fighter characters by 2.25x for 1 turn.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualSlots({
          captain: [5822],
          friendCaptain: [5823],
          sub1: [5824],
        }),
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.map((slot) => slot.character.name)).toEqual(
      expect.arrayContaining(['Monkey D. Luffy', 'Monkey D. Luffy - Gear Third']),
    );
  });

  it('relaxes a manual sub with a composite in-game conflict like General Franky and Tony Tony Chopper', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 3574,
          name: 'General Franky - Dream Docking',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
          },
        }),
        createCharacterRecord({
          id: 5825,
          name: 'Portgas D. Ace',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.25x.',
          },
        }),
        createCharacterRecord({
          id: 2797,
          name: 'Tony Tony Chopper - Long-Awaited Present',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts ATK of Fighter characters by 2.25x for 1 turn.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualSlots({
          captain: [3574],
          friendCaptain: [5825],
          sub1: [2797],
        }),
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 2797)).toBe(false);
  });

  it('relaxes a manual sub with a composite in-game conflict like General Franky and Law & Chopper', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 3574,
          name: 'General Franky - Dream Docking',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
          },
        }),
        createCharacterRecord({
          id: 5830,
          name: 'Portgas D. Ace',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.25x.',
          },
        }),
        createCharacterRecord({
          id: 3330,
          name: 'Law & Chopper - Dynamic Doctor Duo',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Paralysis duration by 3 turns.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualSlots({
          captain: [3574],
          friendCaptain: [5830],
          sub1: [3330],
        }),
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 3330)).toBe(false);
  });

  it('allows a composite in-game conflict when the unique-name toggle is off', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 3574,
          name: 'General Franky - Dream Docking',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
          },
        }),
        createCharacterRecord({
          id: 5826,
          name: 'Portgas D. Ace',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.25x.',
          },
        }),
        createCharacterRecord({
          id: 2797,
          name: 'Tony Tony Chopper - Long-Awaited Present',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts ATK of Fighter characters by 2.25x for 1 turn.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        manualSlots: createManualSlots({
          captain: [3574],
          friendCaptain: [5826],
          sub1: [2797],
        }),
      }),
    );

    expect(result).not.toBeNull();
  });

  it('relaxes overlapping explicit party conflict keys even when display names are unrelated', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 5827,
          name: 'Holiday Tank Pilot',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
            partyConflictKeys: ['franky', 'tony tony chopper'],
          },
        }),
        createCharacterRecord({
          id: 5828,
          name: 'Portgas D. Ace',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.25x.',
          },
        }),
        createCharacterRecord({
          id: 5829,
          name: 'Winter Medic',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts ATK of Fighter characters by 2.25x for 1 turn.',
            partyConflictKeys: ['tony tony chopper'],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualSlots({
          captain: [5827],
          friendCaptain: [5828],
          sub1: [5829],
        }),
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 5829)).toBe(false);
  });

  it('rejects linked variants that share an explicit canonical conflict key', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 4529,
          name: 'Clashing Blades Roronoa Zoro',
          primaryClass: 'Slasher',
          secondaryClass: 'Free Spirit',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Slasher characters by 5.5x.',
            partyConflictKeys: ['linked-variant-4529'],
          },
        }),
        createCharacterRecord({
          id: 900005,
          name: 'Clashing Blades St. Ethanbaron V. Nusjuro',
          primaryClass: 'Slasher',
          secondaryClass: 'Cerebral',
          detail: {
            captainAbility: 'Boosts ATK of STR and Slasher characters by 5.5x.',
            partyConflictKeys: ['linked-variant-4529'],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX', 'STR'], ['Slasher'], {
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualSlots({
          captain: [4529],
          friendCaptain: [900005],
        }),
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 900005)).toBe(false);
  });

  it('treats Wano straw hat aliases as duplicate in-game characters', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 4233,
          name: 'Dorry & Broggy - Retaliating Against the Threat to the Homeland',
          primaryClass: 'Free Spirit',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Free Spirit characters by 5.5x.',
          },
        }),
        createCharacterRecord({
          id: 4550,
          name: 'Crocodile & Mihawk - Powers Needed to Build Their Utopia',
          primaryClass: 'Free Spirit',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Free Spirit characters by 5.25x.',
          },
        }),
        createCharacterRecord({
          id: 3065,
          name: 'Luffy & Sanji - A Joint Struggle Underpinned by Trust',
          primaryClass: 'Free Spirit',
          detail: {
            specialText: 'Boosts ATK of Free Spirit characters by 2.5x for 1 turn.',
          },
        }),
        createCharacterRecord({
          id: 2802,
          name: 'Luffytaro & Zorojuro - Land of Wano Savior',
          primaryClass: 'Free Spirit',
          detail: {
            specialText: 'Boosts Orb Effects of Free Spirit characters by 2.5x for 1 turn.',
          },
        }),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createAtkSubRecord(),
      ],
      createInput(['DEX'], ['Free Spirit'], {
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualSlots({
          captain: [4233],
          friendCaptain: [4550],
          sub1: [3065],
          sub2: [2802],
        }),
      }),
    );

    const slotIds = result?.slots.map((slot) => slot.character.id) ?? [];

    expect(result).not.toBeNull();
    expect(slotIds).toContain(3065);
    expect(slotIds).not.toContain(2802);
  });

  it('treats titled Monkey D. Luffy variants as duplicate with Luffy dual units', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 4233,
          name: 'Dorry & Broggy - Retaliating Against the Threat to the Homeland',
          primaryClass: 'Free Spirit',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Free Spirit characters by 5.5x.',
          },
        }),
        createCharacterRecord({
          id: 4550,
          name: 'Crocodile & Mihawk - Powers Needed to Build Their Utopia',
          primaryClass: 'Free Spirit',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Free Spirit characters by 5.25x.',
          },
        }),
        createCharacterRecord({
          id: 3065,
          name: 'Luffy & Sanji - A Joint Struggle Underpinned by Trust',
          primaryClass: 'Free Spirit',
          detail: {
            specialText: 'Boosts ATK of Free Spirit characters by 2.5x for 1 turn.',
          },
        }),
        createCharacterRecord({
          id: 1916,
          name: 'Monkey D. Luffy: Gear Four - Enemy of the Gods',
          primaryClass: 'Free Spirit',
          detail: {
            partyConflictKeys: ['monkey d. luffy: gear four', 'four'],
            specialText: 'Boosts Orb Effects of Free Spirit characters by 2.5x for 1 turn.',
          },
        }),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createAtkSubRecord(),
      ],
      createInput(['DEX'], ['Free Spirit'], {
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualSlots({
          captain: [4233],
          friendCaptain: [4550],
          sub1: [3065],
          sub2: [1916],
        }),
      }),
    );

    const slotIds = result?.slots.map((slot) => slot.character.id) ?? [];

    expect(result).not.toBeNull();
    expect(slotIds).toContain(3065);
    expect(slotIds).not.toContain(1916);
  });

  it('normalizes straw hat alter egos into canonical party conflict keys', () => {
    const conflictKeys = [
      ...resolveCharacterPartyConflictKeys({ id: 2802, name: 'Luffytaro & Zorojuro' }),
      ...resolveCharacterPartyConflictKeys({ id: 9101, name: 'Onami' }),
      ...resolveCharacterPartyConflictKeys({ id: 9102, name: 'Usohachi' }),
      ...resolveCharacterPartyConflictKeys({ id: 9103, name: 'Franosuke' }),
      ...resolveCharacterPartyConflictKeys({ id: 9104, name: 'Orobi' }),
      ...resolveCharacterPartyConflictKeys({ id: 9105, name: 'Soba Mask' }),
    ];

    expect(conflictKeys).toEqual(
      expect.arrayContaining(['luffy', 'zoro', 'nami', 'usopp', 'franky', 'robin', 'sanji']),
    );
  });

  it('normalizes titled canonical names into simple party conflict keys', () => {
    expect(
      resolveCharacterPartyConflictKeys({
        id: 1916,
        name: 'Monkey D. Luffy: Gear Four - Enemy of the Gods',
      }),
    ).toEqual(expect.arrayContaining(['monkey d. luffy', 'luffy']));
  });

  it('treats distinct normalized base names like Chef Sanji and Sanji as unique', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 5820,
          name: 'Sanji',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
          },
        }),
        createCharacterRecord({
          id: 5821,
          name: 'Chef Sanji - Hot Rock Stew',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.1x.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualSlots({
          captain: [5820],
          friendCaptain: [5821],
        }),
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.map((slot) => slot.character.name)).toEqual(
      expect.arrayContaining(['Sanji', 'Chef Sanji - Hot Rock Stew']),
    );
  });

  it('counts each slot only once even if the same character has multiple matching parsed abilities', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5813,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Bind duration by 5 turns and by 7 turns again.',
            builderAbilities: [
              {
                key: 'remove_bind',
                label: 'Remove Bind',
                minTurns: 5,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
              {
                key: 'remove_bind',
                label: 'Remove Bind',
                minTurns: 7,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
            ],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          { abilityKey: 'remove_bind', minTurns: 5, slotTokens: [], requiredCharacterCount: 2 },
        ],
      },
    );

    expect(result).toBeNull();
  });

  it('does not let one stronger character satisfy duplicate same-ability requirements', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5814,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces ATK Down duration by 7 turns.',
            builderAbilities: [
              {
                key: 'remove_atk_down',
                label: 'Remove ATK Down',
                minTurns: 7,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
            ],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          { abilityKey: 'remove_atk_down', minTurns: 5, slotTokens: [], requiredCharacterCount: 1 },
          { abilityKey: 'remove_atk_down', minTurns: 7, slotTokens: [], requiredCharacterCount: 1 },
        ],
      },
    );

    expect(result).toBeNull();
  });

  it('matches duplicate same-ability turn requirements with separate team slots', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5815,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces ATK Down duration by 5 turns.',
            builderAbilities: [
              {
                key: 'remove_atk_down',
                label: 'Remove ATK Down',
                minTurns: 5,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
            ],
          },
        }),
        createCharacterRecord({
          id: 5816,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces ATK Down duration by 7 turns.',
            builderAbilities: [
              {
                key: 'remove_atk_down',
                label: 'Remove ATK Down',
                minTurns: 7,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
            ],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          { abilityKey: 'remove_atk_down', minTurns: 5, slotTokens: [], requiredCharacterCount: 1 },
          { abilityKey: 'remove_atk_down', minTurns: 7, slotTokens: [], requiredCharacterCount: 1 },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
    expect(result?.coverage.abilityRequirements.matched).toEqual([
      { abilityKey: 'remove_atk_down', minTurns: 5, slotTokens: [], requiredCharacterCount: 1 },
      { abilityKey: 'remove_atk_down', minTurns: 7, slotTokens: [], requiredCharacterCount: 1 },
    ]);
  });

  it('matches at least N turns and typed slot tokens for slot barrier requirements', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5803,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Removes [DEX] and [STR] Slot Barrier completely.',
            builderAbilities: [
              {
                key: 'remove_slot_barrier',
                label: 'Remove Slot Barrier',
                minTurns: 99,
                isCompleteRemoval: true,
                slotTokens: ['DEX', 'STR'],
                source: 'specialText',
              },
            ],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          {
            abilityKey: 'remove_slot_barrier',
            minTurns: 3,
            slotTokens: ['DEX'],
            requiredCharacterCount: 1,
          },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
  });

  it('matches explicit pain removal from special text for the requested turn count', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5805,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Recovers HP and reduces Pain duration by 5 turns.',
            builderAbilities: [
              {
                key: 'remove_pain',
                label: 'Remove Pain',
                minTurns: 5,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
                coverageMode: 'explicit',
              },
            ],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          { abilityKey: 'remove_pain', minTurns: 5, slotTokens: [], requiredCharacterCount: 1 },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
    expect(result?.coverage.abilityRequirements.matched).toEqual([
      { abilityKey: 'remove_pain', minTurns: 5, slotTokens: [], requiredCharacterCount: 1 },
    ]);
  });

  it('matches selectable debuff counters as pain coverage when turns are sufficient', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5806,
          primaryClass: 'Fighter',
          detail: {
            specialText:
              'Reduces 1 selected debuff duration by 5 turns and changes all orbs into Matching orbs.',
            builderAbilities: [
              {
                key: 'remove_pain',
                label: 'Remove Pain',
                minTurns: 5,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
                coverageMode: 'selectedDebuff',
              },
            ],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          { abilityKey: 'remove_pain', minTurns: 1, slotTokens: [], requiredCharacterCount: 1 },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
  });

  it('does not use captain-sourced pain removal to satisfy required ability coverage', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 5811,
          primaryClass: 'Fighter',
          detail: {
            captainAbility:
              'Boosts ATK by 5x, reduces Pain duration by 10 turns and recovers 3,000 HP at end of turn.',
            builderAbilities: [
              {
                key: 'remove_pain',
                label: 'Remove Pain',
                minTurns: 10,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'captainAbility',
                coverageMode: 'explicit',
              },
            ],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createOffClassRedundantSubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          { abilityKey: 'remove_pain', minTurns: 10, slotTokens: [], requiredCharacterCount: 1 },
        ],
      },
    );

    expect(result).toBeNull();
  });

  it('fails when pain removal coverage does not reach the requested turn count', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5807,
          primaryClass: 'Fighter',
          detail: {
            specialText:
              'Reduces 1 selected debuff duration by 5 turns and changes all orbs into Matching orbs.',
            builderAbilities: [
              {
                key: 'remove_pain',
                label: 'Remove Pain',
                minTurns: 5,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
                coverageMode: 'selectedDebuff',
              },
            ],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          { abilityKey: 'remove_pain', minTurns: 10, slotTokens: [], requiredCharacterCount: 1 },
        ],
      },
    );

    expect(result).toBeNull();
  });

  it('does not use captain-sourced builder abilities to satisfy a requirement', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 5810,
          primaryClass: 'Fighter',
          detail: {
            captainAbility:
              "Boosts ATK by 5x and deals 10% of enemies' current HP in True damage, ignoring Normal Attack Only, to all enemies at the end of each turn.",
            builderAbilities: [
              {
                key: 'ignore_normal_attack_only',
                label: 'Ignore Normal Attack Only (NAO)',
                minTurns: null,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'captainAbility',
              },
            ],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createOffClassRedundantSubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          {
            abilityKey: 'ignore_normal_attack_only',
            minTurns: null,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
        ],
      },
    );

    expect(result).toBeNull();
  });

  it('fails when no candidate covers the required ability tokens', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5804,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Removes [DEX] Slot Barrier completely.',
            builderAbilities: [
              {
                key: 'remove_slot_barrier',
                label: 'Remove Slot Barrier',
                minTurns: 99,
                isCompleteRemoval: true,
                slotTokens: ['DEX'],
                source: 'specialText',
              },
            ],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          {
            abilityKey: 'remove_slot_barrier',
            minTurns: 3,
            slotTokens: ['QCK'],
            requiredCharacterCount: 1,
          },
        ],
      },
    );

    expect(result).toBeNull();
  });

  it('duplicates the best captain and prefers complementary class-matching subs', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createOffClassRedundantSubRecord(),
      ],
      INPUT,
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.role).toBe('captain');
    expect(result?.slots[1]?.role).toBe('friendCaptain');
    expect(result?.slots[0]?.character.id).toBe(result?.slots[1]?.character.id);

    const teamIds = result?.slots.map((slot) => slot.character.id) ?? [];

    expect(teamIds).toEqual(expect.arrayContaining([5900, 5890, 5880, 5870, 5860]));
    expect(teamIds).not.toContain(5850);
    expect(result?.coverage.utility).toContain('Bind clear');
    expect(result?.coverage.coversAllSelectedClasses).toBe(true);
    expect(result?.coverage.coversAllSelectedTypes).toBe(true);
  });

  it('prefers the newer equivalent captain after filtering unreadable recent placeholders', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 6000,
          primaryClass: 'Fighter',
          detail: {},
        }),
        createCharacterRecord({
          id: 5901,
          primaryClass: 'Fighter',
          secondaryClass: 'Free Spirit',
          detail: {
            captainAbility:
              'Boosts ATK of DEX and Fighter characters by 5.25x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
            specialText:
              'Boosts orb effects of DEX and Fighter characters by 2.25x for 1 turn and changes orbs into Matching Orbs.',
          },
        }),
        createCharacterRecord({
          id: 5899,
          primaryClass: 'Fighter',
          secondaryClass: 'Free Spirit',
          detail: {
            captainAbility:
              'Boosts ATK of DEX and Fighter characters by 5.25x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
            specialText:
              'Boosts orb effects of DEX and Fighter characters by 2.25x for 1 turn and changes orbs into Matching Orbs.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      INPUT,
    );

    expect(result).not.toBeNull();
    expect(result?.candidateCount).toBe(6);
    expect(result?.slots[0]?.character.id).toBe(5901);
    expect(result?.slots[1]?.character.id).toBe(5901);
    expect(result?.slots.some((slot) => slot.character.id === 6000)).toBe(false);
  });

  it('prefers newer captain id over higher captain cost', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderPriorityCaptainRecord({
          id: 6100,
          name: 'Cost 65 Captain',
          cost: 65,
          atkMultiplier: 4.75,
        }),
        createLeaderPriorityCaptainRecord({
          id: 6101,
          name: 'Cost 55 Stronger Captain',
          cost: 55,
          atkMultiplier: 8.5,
          universal: true,
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      INPUT,
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(6101);
    expect(result?.slots[1]?.character.id).toBe(6101);
  });

  it('prefers newer captain id over higher average leader boost without a range', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderPriorityCaptainRecord({
          id: 6200,
          name: 'Older Stronger Captain',
          cost: 65,
          atkMultiplier: 9,
          universal: true,
        }),
        createLeaderPriorityCaptainRecord({
          id: 6201,
          name: 'Newer Weaker Captain',
          cost: 65,
          atkMultiplier: 4.5,
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      INPUT,
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(6201);
    expect(result?.slots[1]?.character.id).toBe(6201);
  });

  it('keeps newest captain priority ahead of boost values without a range', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderPriorityCaptainRecord({
          id: 6300,
          name: 'Older Stronger Captain',
          cost: 60,
          atkMultiplier: 9.25,
          universal: true,
        }),
        createLeaderPriorityCaptainRecord({
          id: 6305,
          name: 'Newer Weaker Captain',
          cost: 60,
          atkMultiplier: 4.25,
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      INPUT,
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(6305);
    expect(result?.slots[1]?.character.id).toBe(6305);
  });

  it('prefers newer id over captain score when leader boost ties', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderPriorityCaptainRecord({
          id: 6700,
          name: 'Older Universal Captain',
          cost: 65,
          atkMultiplier: 5.25,
          hpMultiplier: 1.3,
          universal: true,
        }),
        createLeaderPriorityCaptainRecord({
          id: 6701,
          name: 'Newer Scoped Captain',
          cost: 55,
          atkMultiplier: 5.25,
          hpMultiplier: 1.3,
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      INPUT,
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(6701);
    expect(result?.slots[1]?.character.id).toBe(6701);
  });

  it('preserves manual captain and friend captain order', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderPriorityCaptainRecord({
          id: 6400,
          name: 'Captain Slot Cost 65',
          cost: 65,
          atkMultiplier: 4.5,
        }),
        createLeaderPriorityCaptainRecord({
          id: 6390,
          name: 'Captain Slot Stronger Cost 60',
          cost: 60,
          atkMultiplier: 8.5,
          universal: true,
        }),
        createLeaderPriorityCaptainRecord({
          id: 6500,
          name: 'Friend Slot Cost 65',
          cost: 65,
          atkMultiplier: 4.25,
        }),
        createLeaderPriorityCaptainRecord({
          id: 6490,
          name: 'Friend Slot Stronger Cost 55',
          cost: 55,
          atkMultiplier: 8.75,
          universal: true,
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        manualSlots: createManualSlots({
          captain: [6400, 6390],
          friendCaptain: [6500, 6490],
        }),
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(6400);
    expect(result?.slots[1]?.character.id).toBe(6500);
  });

  it('keeps newest leader priority when HP boost is selected without a range', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderPriorityCaptainRecord({
          id: 6600,
          name: 'Newer Lower HP Leader',
          cost: 65,
          atkMultiplier: 5.5,
          hpMultiplier: 1.2,
          universal: true,
        }),
        createLeaderPriorityCaptainRecord({
          id: 6401,
          name: 'Older Higher HP Leader',
          cost: 55,
          atkMultiplier: 4.75,
          hpMultiplier: 1.8,
          universal: true,
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], { leaderBoostFilters: ['HP'] }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(6600);
    expect(result?.slots[1]?.character.id).toBe(6600);
  });

  it('keeps newest leader priority when ATK boost is selected without a range', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderPriorityCaptainRecord({
          id: 6601,
          name: 'Newer Lower ATK Leader',
          cost: 65,
          atkMultiplier: 5,
          hpMultiplier: 1.8,
          universal: true,
        }),
        createLeaderPriorityCaptainRecord({
          id: 6402,
          name: 'Older Higher ATK Leader',
          cost: 55,
          atkMultiplier: 6.5,
          hpMultiplier: 1.2,
          universal: true,
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], { leaderBoostFilters: ['ATK'] }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(6601);
    expect(result?.slots[1]?.character.id).toBe(6601);
  });

  it('keeps newest leader priority when HP and ATK boosts are selected without ranges', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderPriorityCaptainRecord({
          id: 6602,
          name: 'Newer Lower Average Leader',
          cost: 65,
          atkMultiplier: 5.5,
          hpMultiplier: 1.1,
          universal: true,
        }),
        createLeaderPriorityCaptainRecord({
          id: 6403,
          name: 'Older Higher Average Leader',
          cost: 55,
          atkMultiplier: 6,
          hpMultiplier: 1.6,
          universal: true,
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], { leaderBoostFilters: ['HP', 'ATK'] }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(6602);
    expect(result?.slots[1]?.character.id).toBe(6602);
  });

  it('filters auto-filled leaders by ATK captain boost range before priority sorting', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderPriorityCaptainRecord({
          id: 6603,
          name: 'Outside ATK Range Leader',
          cost: 65,
          atkMultiplier: 6.5,
          hpMultiplier: 1.4,
          universal: true,
        }),
        createLeaderPriorityCaptainRecord({
          id: 6404,
          name: 'Inside ATK Range Leader',
          cost: 55,
          atkMultiplier: 5.25,
          hpMultiplier: 1.4,
          universal: true,
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        leaderBoostFilters: ['ATK'],
        leaderBoostRanges: {
          ATK: { min: 5, max: 5.5 },
          HP: { min: null, max: null },
        },
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(6404);
    expect(result?.slots[1]?.character.id).toBe(6404);
  });

  it('filters auto-filled leaders by HP captain boost range', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderPriorityCaptainRecord({
          id: 6604,
          name: 'Low HP Leader',
          cost: 65,
          atkMultiplier: 5.5,
          hpMultiplier: 1.2,
          universal: true,
        }),
        createLeaderPriorityCaptainRecord({
          id: 6405,
          name: 'Inside HP Range Leader',
          cost: 55,
          atkMultiplier: 5.25,
          hpMultiplier: 1.5,
          universal: true,
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        leaderBoostFilters: ['HP'],
        leaderBoostRanges: {
          ATK: { min: null, max: null },
          HP: { min: 1.3, max: 1.6 },
        },
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(6405);
    expect(result?.slots[1]?.character.id).toBe(6405);
  });

  it('excludes auto-filled leaders with missing parsed boosts when that range is active', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 6605,
          name: 'Special Only ATK Leader',
          captainAtkBoost: 0,
          captainHpBoost: 1.3,
          captainAverageBoost: 0.65,
          primaryClass: 'Fighter',
          secondaryClass: 'Free Spirit',
          detail: {
            captainAbility: 'Boosts HP of all characters by 1.3x.',
            specialText: 'Boosts ATK of all characters by 9x for 1 turn.',
          },
        }),
        createLeaderPriorityCaptainRecord({
          id: 6406,
          name: 'Parsed Captain ATK Leader',
          cost: 55,
          atkMultiplier: 5.25,
          hpMultiplier: 1.3,
          universal: true,
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        leaderBoostFilters: ['ATK'],
        leaderBoostRanges: {
          ATK: { min: 5, max: null },
          HP: { min: null, max: null },
        },
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(6406);
    expect(result?.slots[1]?.character.id).toBe(6406);
  });

  it('excludes Big Mom from auto-filled leaders when ATK range starts at 6x', () => {
    const result = buildAutoTeamResult(
      [
        createBigMomCaptainRecord(),
        createLeaderPriorityCaptainRecord({
          id: 6408,
          name: 'Six Times Universal Leader',
          cost: 55,
          atkMultiplier: 6,
          hpMultiplier: 1.3,
          universal: true,
        }),
        createBigMomScopeSubRecord(6410, 'STR'),
        createBigMomScopeSubRecord(6411, 'DEX'),
        createBigMomScopeSubRecord(6412, 'QCK'),
        createBigMomScopeSubRecord(6413, 'STR'),
      ],
      createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT'], ['Powerhouse'], {
        leaderBoostFilters: ['ATK'],
        leaderBoostRanges: {
          ATK: { min: 6, max: null },
          HP: { min: null, max: null },
        },
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(6408);
    expect(result?.slots[1]?.character.id).toBe(6408);
  });

  it('does not apply leader boost ranges to manual leader slots', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderPriorityCaptainRecord({
          id: 6407,
          name: 'Manual Out Of Range Leader',
          cost: 55,
          atkMultiplier: 4,
          hpMultiplier: 1.1,
          universal: true,
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        leaderBoostRanges: {
          ATK: { min: 6, max: null },
          HP: { min: 1.5, max: null },
        },
        manualSlots: createManualSlots({
          captain: [6407],
          friendCaptain: [6407],
        }),
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(6407);
    expect(result?.slots[1]?.character.id).toBe(6407);
  });

  it('prefers newer subs over higher-cost subs when coverage is otherwise equivalent', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createCharacterRecord({
          id: 6200,
          name: 'Newer Low-Cost Redundant Sub',
          cost: 20,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Deals 100x character ATK in typeless damage to one enemy.',
          },
        }),
        createCharacterRecord({
          id: 267,
          name: 'Older High-Cost Redundant Sub',
          cost: 65,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Deals 100x character ATK in typeless damage to one enemy.',
          },
        }),
      ],
      INPUT,
    );

    expect(result).not.toBeNull();

    const teamIds = result?.slots.map((slot) => slot.character.id) ?? [];

    expect(teamIds).toContain(6200);
    expect(teamIds).not.toContain(267);
  });

  it('prefers newer sub id over an older higher-scoring sub', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 6200,
          name: 'Newer Redundant Sub 1',
          cost: 20,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Deals 100x character ATK in typeless damage to one enemy.',
          },
        }),
        createCharacterRecord({
          id: 6199,
          name: 'Newer Redundant Sub 2',
          cost: 20,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Deals 100x character ATK in typeless damage to one enemy.',
          },
        }),
        createCharacterRecord({
          id: 6198,
          name: 'Newer Redundant Sub 3',
          cost: 20,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Deals 100x character ATK in typeless damage to one enemy.',
          },
        }),
        createCharacterRecord({
          id: 6197,
          name: 'Newer Redundant Sub 4',
          cost: 20,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Deals 100x character ATK in typeless damage to one enemy.',
          },
        }),
        createCharacterRecord({
          id: 100,
          name: 'Older High-Scoring ATK Sub',
          cost: 65,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts ATK of Fighter characters by 2.5x for 1 turn.',
          },
        }),
      ],
      INPUT,
    );

    expect(result).not.toBeNull();

    const teamIds = result?.slots.map((slot) => slot.character.id) ?? [];

    expect(teamIds).toEqual([5900, 5900, 6200, 6199, 6198, 6197]);
    expect(teamIds).not.toContain(100);
  });

  it('surfaces required ability counters before newer unrelated subs', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 6200,
          name: 'Newer Redundant Sub 1',
          cost: 20,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Deals 100x character ATK in typeless damage to one enemy.',
          },
        }),
        createCharacterRecord({
          id: 6199,
          name: 'Newer Redundant Sub 2',
          cost: 20,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Deals 100x character ATK in typeless damage to one enemy.',
          },
        }),
        createCharacterRecord({
          id: 6198,
          name: 'Newer Redundant Sub 3',
          cost: 20,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Deals 100x character ATK in typeless damage to one enemy.',
          },
        }),
        createCharacterRecord({
          id: 6197,
          name: 'Newer Redundant Sub 4',
          cost: 20,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Deals 100x character ATK in typeless damage to one enemy.',
          },
        }),
        createCharacterRecord({
          id: 100,
          name: 'Older Bind Counter',
          cost: 20,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Bind duration by 5 turns.',
            builderAbilities: [createBuilderAbility('remove_bind', 'Remove Bind', 5)],
          },
        }),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          {
            abilityKey: 'remove_bind',
            minTurns: 5,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.slots.map((slot) => slot.character.id)).toEqual([
      5900, 5900, 100, 6200, 6199, 6198,
    ]);
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
  });

  it('uses one selected leader for both captain slots', () => {
    const result = buildAutoTeamResult(createStrictMixedTeamRecords(), {
      ...createInput(['DEX', 'PSY'], ['Fighter', 'Slasher'], {
        lockedCharacterIds: [5925],
        captainCharacterId: 5925,
        friendCaptainCharacterId: 5925,
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(5925);
    expect(result?.slots[1]?.character.id).toBe(5925);
  });

  it('uses two selected leaders in the chosen captain and friend order', () => {
    const result = buildAutoTeamResult(createDualLeaderMixedTeamRecords(), {
      ...createInput(['DEX', 'PSY'], ['Fighter', 'Slasher'], {
        lockedCharacterIds: [5925, 5927],
        captainCharacterId: 5927,
        friendCaptainCharacterId: 5925,
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(5927);
    expect(result?.slots[1]?.character.id).toBe(5925);
    expect(result?.coverage.selectedClassMatches).toBe(6);
    expect(result?.coverage.selectedTypeMatches).toBe(6);
  });

  it('builds Kaido teams only from the classes boosted by the selected leader', () => {
    const result = buildAutoTeamResult(createKaidoLeaderTeamRecords(), {
      ...createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT'], ['Powerhouse', 'Striker'], {
        lockedCharacterIds: [2700],
        captainCharacterId: 2700,
        friendCaptainCharacterId: 2700,
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.coverage.leaderCriteria.derivedAllowedClasses).toEqual([
      'Powerhouse',
      'Striker',
    ]);
    expect(result?.coverage.leaderCriteria.hasCostRestriction).toBe(false);
    expect(result?.coverage.leaderCriteria.maxAllowedCost).toBeNull();
    expect(result?.coverage.leaderCriteria.hasClassRestriction).toBe(true);
    expect(result?.coverage.leaderCriteria.hasTypeRestriction).toBe(false);
    expect(result?.coverage.leaderCriteria.matchingSlots).toBe(6);
    expect(
      result?.slots.every((slot) =>
        slot.character.classes.some((characterClass) =>
          ['Powerhouse', 'Striker'].includes(characterClass),
        ),
      ),
    ).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 2705)).toBe(false);
  });

  it('builds Brook teams only from Slasher and Free Spirit subs', () => {
    const result = buildAutoTeamResult(createBrookLeaderTeamRecords(), {
      ...createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT'], [], {
        lockedCharacterIds: [4426],
        captainCharacterId: 4426,
        friendCaptainCharacterId: 4426,
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.coverage.leaderCriteria.derivedAllowedClasses).toEqual(
      expect.arrayContaining(['Slasher', 'Free Spirit']),
    );
    expect(result?.coverage.leaderCriteria.derivedAllowedClasses).toHaveLength(2);
    expect(result?.coverage.leaderCriteria.hasClassRestriction).toBe(true);
    expect(
      result?.slots
        .slice(2)
        .every((slot) =>
          slot.character.classes.some((characterClass) =>
            ['Slasher', 'Free Spirit'].includes(characterClass),
          ),
        ),
    ).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id >= 9000)).toBe(false);
  });

  it('builds Kid teams only from boosted characters while ignoring captain tag conditions', () => {
    const result = buildAutoTeamResult(createKidLeaderTeamRecords(), {
      ...createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT'], [], {
        requireFullCaptainAbilityCoverage: true,
        lockedCharacterIds: [4549],
        captainCharacterId: 4549,
        friendCaptainCharacterId: 4549,
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.coverage.leaderCriteria.tagConditionSets).toEqual([]);
    expect(result?.coverage.leaderCriteria.derivedAllowedCharacterTags).toEqual([]);
    expect(result?.coverage.leaderCriteria.hasCharacterTagRestriction).toBe(false);
    expect(result?.coverage.leaderCriteria.matchingSlots).toBe(6);
    expect(
      result?.slots.every((slot) => {
        const classes = slot.character.classes;

        return (
          slot.character.type === 'STR' || classes.includes('Striker') || classes.includes('Driven')
        );
      }),
    ).toBe(true);
  });

  it('builds Dominant Type captain teams with every slot on the leader type', () => {
    const captainAbility =
      'Boosts HP of all characters by 1.25x, makes badly matching orbs beneficial for all characters, and reduces Despair duration by 6 turns. If your crew has 4+ characters of the same Type, boosts ATK of the Dominant Type characters by 4.5x.';
    const records = [
      createCharacterRecord({
        id: 4574,
        name: 'St. Ethanbaron V. Nusjuro - Approaching Monstrous Horse',
        type: 'INT',
        primaryClass: 'Driven',
        secondaryClass: 'Slasher',
        detail: {
          captainAbility,
          specialText: 'Reduces Chain Coefficient Reduction duration by 6 turns.',
        },
      }),
      ...[4580, 4581, 4582, 4583].map((id) =>
        createCharacterRecord({
          id,
          type: 'INT',
          primaryClass: 'Driven',
          detail: {
            specialText: 'Reduces Bind duration by 5 turns.',
          },
        }),
      ),
      ...[9000, 9001, 9002, 9003].map((id) =>
        createCharacterRecord({
          id,
          type: 'DEX',
          primaryClass: 'Driven',
          detail: {
            specialText: 'Reduces Despair duration by 5 turns.',
          },
        }),
      ),
    ];

    const result = buildAutoTeamResult(records, {
      ...createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT'], [], {
        lockedCharacterIds: [4574],
        captainCharacterId: 4574,
        friendCaptainCharacterId: 4574,
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.coverage.leaderCriteria.requiresDominantType).toBe(true);
    expect(result?.coverage.leaderCriteria.derivedAllowedTypes).toEqual(['INT']);
    expect(result?.coverage.leaderCriteria.matchingSlots).toBe(6);
    expect(result?.slots.every((slot) => slot.character.type === 'INT')).toBe(true);
    expect(result?.slots.some((slot) => slot.character.type === 'DEX')).toBe(false);
  });

  it('keeps selected captain despair coverage global while satisfying battle counters', () => {
    const result = buildAutoTeamResult(createKidCaptainRequirementRecords(), {
      ...createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT'], [], {
        requiredAbilities: [
          {
            abilityKey: 'remove_despair',
            minTurns: 8,
            slotTokens: [],
            requiredCharacterCount: 1,
            slotScope: 'leader',
            sourceScope: 'captainAbility',
          },
        ],
        battleRequirements: [
          createBattleRequirement('special-bind', [
            createAbilityRequirement('remove_special_bind', 5),
            createAbilityRequirement('crewmate_recover_special_bind', 5),
          ]),
          createBattleRequirement('threshold-resilience', [
            createAbilityRequirement('remove_threshold_damage_reduction', 5),
            createAbilityRequirement('remove_resilience', 5),
          ]),
          createBattleRequirement('bind', [createAbilityRequirement('remove_bind', 6)]),
        ],
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.requested).toEqual([
      {
        abilityKey: 'remove_despair',
        minTurns: 8,
        slotTokens: [],
        requiredCharacterCount: 1,
        slotScope: 'leader',
        sourceScope: 'captainAbility',
      },
    ]);
    expect(result?.coverage.abilityRequirements.matched).toEqual([
      {
        abilityKey: 'remove_despair',
        minTurns: 8,
        slotTokens: [],
        requiredCharacterCount: 1,
        slotScope: 'leader',
        sourceScope: 'captainAbility',
      },
    ]);
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
    expect(result?.coverage.battleRequirements?.matchesAll).toBe(true);
    expect(result?.coverage.leaderCriteria.tagConditionSets).toEqual([]);
    expect(result?.slots.some((slot) => slot.character.id === 3431)).toBe(true);
  });

  it('builds the Kid favorites preset by anchoring battle counters before filler subs', async () => {
    const records = createKidCaptainRequirementRecords();
    const favoriteCharacterIds = [4549, 3750, 3870, 4556, 3431, 8102];
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockImplementation(async (_types, _limit, query) => {
        const allowedIds = Array.isArray(query?.allowedCharacterIds)
          ? new Set<number>(query.allowedCharacterIds)
          : null;

        return allowedIds ? records.filter((record) => allowedIds.has(record.id)) : records;
      }),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam([], ['DEX', 'STR', 'QCK', 'PSY', 'INT'], {
      favoritesOnly: true,
      favoriteCharacterIds,
      requiredAbilities: [
        {
          abilityKey: 'remove_despair',
          minTurns: 8,
          slotTokens: [],
          requiredCharacterCount: 1,
          slotScope: 'leader',
          sourceScope: 'captainAbility',
        },
        createAbilityRequirement('remove_atk_down', 5),
        createAbilityRequirement('remove_threshold_damage_reduction', 5),
        createAbilityRequirement('remove_resilience', 5),
        createAbilityRequirement('remove_enemy_increased_defense', 4),
        createAbilityRequirement('remove_special_bind', 5),
        createAbilityRequirement('crewmate_recover_special_bind', 5),
        createAbilityRequirement('remove_bind', 6),
      ],
      battleRequirements: [
        createBattleRequirement('battle-1', [createAbilityRequirement('remove_atk_down', 5)]),
        createBattleRequirementWithGroups('battle-2', [
          [createAbilityRequirement('remove_threshold_damage_reduction', 5)],
          [createAbilityRequirement('remove_resilience', 5)],
        ]),
        createBattleRequirementWithGroups('battle-3', [
          [createAbilityRequirement('remove_enemy_increased_defense', 4)],
          [
            createAbilityRequirement('remove_special_bind', 5),
            createAbilityRequirement('crewmate_recover_special_bind', 5),
          ],
          [createAbilityRequirement('remove_bind', 6)],
        ]),
      ],
    });

    expect(result).not.toBeNull();
    expect(result?.slots.every((slot) => favoriteCharacterIds.includes(slot.character.id))).toBe(
      true,
    );
    expect(result?.slots[0]?.character.id).toBe(4549);
    expect(result?.slots[1]?.character.id).toBe(4549);
    expect(result?.slots.map((slot) => slot.character.id)).toEqual(
      expect.arrayContaining([3750, 3870, 4556, 3431]),
    );
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
    expect(
      result?.coverage.abilityRequirements.requested.map((requirement) => requirement.abilityKey),
    ).toContain('remove_despair');
    expect(result?.coverage.battleRequirements?.matchesAll).toBe(true);
  });

  it('uses flexible same-battle group coverage when strict battle spread is infeasible', () => {
    const result = buildAutoTeamResult(createKidCaptainRequirementRecords(), {
      ...createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT'], [], {
        battleRequirements: [
          createBattleRequirementWithGroups('threshold-resilience', [
            [createAbilityRequirement('remove_threshold_damage_reduction', 5)],
            [createAbilityRequirement('remove_resilience', 5)],
          ]),
        ],
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.coverage.battleRequirements?.matchesAll).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 3431)).toBe(true);
  });

  it('keeps favorites strict when a non-favorite counter is required', async () => {
    const records = createKidCaptainRequirementRecords();
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockImplementation(async (_types, _limit, query) => {
        const allowedIds = Array.isArray(query?.allowedCharacterIds)
          ? new Set<number>(query.allowedCharacterIds)
          : null;

        return allowedIds ? records.filter((record) => allowedIds.has(record.id)) : records;
      }),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam([], ['DEX', 'STR', 'QCK', 'PSY', 'INT'], {
      favoritesOnly: true,
      favoriteCharacterIds: [4549, 3750, 3870, 3431],
      requiredAbilities: [
        {
          abilityKey: 'remove_despair',
          minTurns: 8,
          slotTokens: [],
          requiredCharacterCount: 1,
          slotScope: 'leader',
          sourceScope: 'captainAbility',
        },
      ],
      battleRequirements: [
        createBattleRequirement('defense-up', [
          createAbilityRequirement('remove_enemy_increased_defense', 6),
        ]),
      ],
    });

    expect(result).toBeNull();
  });

  it('ignores both leaders team-count tag conditions when building with dual captains', () => {
    const result = buildAutoTeamResult(createDualTagConditionLeaderTeamRecords(), {
      ...createInput(['DEX'], ['Fighter'], {
        requireFullCaptainAbilityCoverage: true,
        lockedCharacterIds: [5810, 5811],
        captainCharacterId: 5810,
        friendCaptainCharacterId: 5811,
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.coverage.leaderCriteria.tagConditionSets).toEqual([]);
    expect(result?.coverage.leaderCriteria.derivedAllowedCharacterTags).toEqual([]);
    expect(result?.coverage.leaderCriteria.hasCharacterTagRestriction).toBe(false);
    expect(
      result?.slots.filter((slot) => slot.character.detail.characterTags?.includes('Scientist'))
        .length,
    ).toBeGreaterThanOrEqual(4);
  });

  it('allows a one-leader-passes team when strict both-leader captain coverage is off', () => {
    const result = buildAutoTeamResult(createBothLeaderStrictCoverageRecords(), {
      ...createInput(['DEX', 'QCK', 'STR'], ['Fighter', 'Powerhouse'], {
        requireFullCaptainAbilityCoverage: true,
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualSlots(
          {
            captain: [4202, 4556],
            friendCaptain: [4521],
          },
          {
            friendCaptain: 4521,
          },
        ),
        lockedCharacterIds: [4521],
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(4202);
    expect(result?.slots[1]?.character.id).toBe(4521);
    expect(result?.coverage.leaderCriteria.tagConditionSets).toEqual([]);
    expect(result?.input.excludedCharacterIds).not.toContain(4202);
  });

  it('skips bad captain candidates until both leaders pass captain coverage conditions', () => {
    const result = buildAutoTeamResult(createBothLeaderStrictCoverageRecords(), {
      ...createInput(['DEX', 'QCK', 'STR'], ['Fighter', 'Powerhouse'], {
        requireFullCaptainAbilityCoverage: true,
        requireBothLeadersFullCaptainAbilityCoverage: true,
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualSlots(
          {
            captain: [4202, 4556],
            friendCaptain: [4521],
          },
          {
            friendCaptain: 4521,
          },
        ),
        lockedCharacterIds: [4521],
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(4556);
    expect(result?.slots[0]?.character.id).not.toBe(4202);
    expect(result?.slots[1]?.character.id).toBe(4521);
    expect(result?.coverage.leaderCriteria.tagConditionSets).toHaveLength(1);
    expect(result?.coverage.leaderCriteria.allSlotsMatch).toBe(true);
    expect(result?.input.excludedCharacterIds).not.toContain(4202);
    expect(
      result?.slots.filter((slot) =>
        slot.character.detail.characterTags?.some((tag) => ['Navy', 'Egghead Arc'].includes(tag)),
      ).length,
    ).toBeGreaterThanOrEqual(4);
  });

  it('requires Captain and Friend Captain to match tier coverage', () => {
    const records = [
      createCharacterRecord({
        id: 8200,
        name: 'DEX Captain',
        type: 'DEX',
        primaryClass: 'Fighter',
        detail: {
          captainAbility: 'Boosts ATK of [DEX] characters by 5x and HP by 1.3x.',
        },
      }),
      createCharacterRecord({
        id: 8201,
        name: 'QCK Friend Captain',
        type: 'QCK',
        primaryClass: 'Fighter',
        detail: {
          captainAbility: 'Boosts ATK of all characters by 5x and HP by 1.3x.',
        },
      }),
      ...[8202, 8203, 8204, 8205].map((id) =>
        createCharacterRecord({
          id,
          type: 'DEX',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts orb effects of [DEX] characters by 2.25x for 1 turn.',
          },
        }),
      ),
    ];
    const input = createInput(['DEX'], ['Fighter'], {
      manualSlots: createManualSlots({
        captain: [8200],
        friendCaptain: [8201],
      }),
      lockedCharacterIds: [8200, 8201],
      captainCharacterId: 8200,
      friendCaptainCharacterId: 8201,
    });

    const manualLeaderOnlyOptions = {
      leaderAutoFillCharacterIds: [],
    };

    expect(buildAutoTeamResult(records, input, manualLeaderOnlyOptions)).toBeNull();
    expect(
      buildAutoTeamResult(
        records,
        {
          ...input,
          requireFullCaptainAbilityCoverage: true,
        },
        manualLeaderOnlyOptions,
      ),
    ).toBeNull();
  });

  it('rejects teams that miss any tier of the captain ability under tier coverage', () => {
    const captainCoverage: CharacterCaptainAbilityCoverage = {
      entries: [
        {
          key: 'captain',
          label: 'Captain Ability',
          tiers: [
            {
              tier: 1,
              kind: 'conditional',
              scope: 'subset',
              characterConditions: {
                universal: false,
                fallbackOther: false,
                selfOnly: false,
                types: [],
                classes: ['Fighter'],
                characterTags: [],
              },
              teamConditions: [],
              fieldConditions: [],
              triggerConditions: [],
              clauses: ['boosts ATK of Fighter characters by 3x'],
              atkBoost: 3,
            },
            {
              tier: 2,
              kind: 'baseline',
              scope: 'crew-wide',
              characterConditions: {
                universal: true,
                fallbackOther: true,
                selfOnly: false,
                types: [],
                classes: [],
                characterTags: [],
              },
              teamConditions: [],
              fieldConditions: [],
              triggerConditions: [],
              clauses: ['boosts ATK of all other characters by 1.5x'],
              atkBoost: 1.5,
            },
          ],
        },
      ],
    };
    const captain = createCharacterRecord({
      id: 8300,
      name: 'Tiered Captain',
      type: 'DEX',
      primaryClass: 'Fighter',
      detail: {
        captainAbility: 'Boosts ATK of all characters by 5x and HP by 1.3x.',
        captainAbilityCoverage: captainCoverage,
      },
    });
    const fighterSubs = [8301, 8302, 8303, 8304].map((id) =>
      createCharacterRecord({
        id,
        name: `Fighter Sub ${id}`,
        type: 'DEX',
        primaryClass: 'Fighter',
        detail: { specialText: 'Boosts ATK of Fighter characters by 2x for 1 turn.' },
      }),
    );
    const cerebralSubs = [8311, 8312, 8313, 8314].map((id) =>
      createCharacterRecord({
        id,
        name: `Cerebral Sub ${id}`,
        type: 'DEX',
        primaryClass: 'Cerebral',
        detail: { specialText: 'Boosts ATK of Cerebral characters by 2x for 1 turn.' },
      }),
    );

    const baseInput = createInput(['DEX'], [], {
      manualSlots: createManualSlots({
        captain: [8300],
        friendCaptain: [8300],
      }),
      lockedCharacterIds: [8300],
      captainCharacterId: 8300,
      friendCaptainCharacterId: 8300,
      requireFullCaptainAbilityCoverage: true,
    });
    // Tiered captain (Fighter) acts as both Captain & Friend Captain, leaving 4 sub slots.
    const onlyCerebralRecords = [captain, ...cerebralSubs];
    const onlyFighterRecords = [captain, ...fighterSubs];
    const mixedRecords = [captain, ...fighterSubs.slice(0, 2), ...cerebralSubs.slice(0, 2)];

    // With only the captain as Fighter and the rest Cerebral, the Fighter tier is covered by the
    // captain slots only. The fallback tier is also covered by the cerebrals. The captain ability
    // text is universal, so the per-slot tier coverage check passes too — the build succeeds.
    const cerebralResult = buildAutoTeamResult(onlyCerebralRecords, baseInput);
    expect(cerebralResult).not.toBeNull();
    expect(cerebralResult?.coverage.leaderCriteria.allLeaderTiersCovered).toBe(true);
    // With only Fighter subs, the fallback Tier 2 cannot be matched by any slot — reject.
    expect(buildAutoTeamResult(onlyFighterRecords, baseInput)).toBeNull();
    // Mixed roster also covers every tier.
    const mixedResult = buildAutoTeamResult(mixedRecords, baseInput);
    expect(mixedResult).not.toBeNull();
    expect(mixedResult?.coverage.leaderCriteria.allLeaderTiersCovered).toBe(true);
    expect(
      mixedResult?.coverage.leaderCriteria.leaderTierCoverages.every(
        (coverage) => coverage.matches,
      ),
    ).toBe(true);
  });

  it('builds Big Mom teams only from STR, DEX, and QCK characters', () => {
    const result = buildAutoTeamResult(createBigMomLeaderTeamRecords(), {
      ...createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT'], ['Powerhouse'], {
        manualSlots: createManualSlots({
          captain: [2500],
          friendCaptain: [2500],
        }),
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.coverage.leaderCriteria.derivedAllowedTypes).toEqual(['DEX', 'STR', 'QCK']);
    expect(result?.coverage.leaderCriteria.hasTypeRestriction).toBe(true);
    expect(
      result?.slots.slice(2).every((slot) => ['STR', 'DEX', 'QCK'].includes(slot.character.type)),
    ).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 2605)).toBe(false);
    expect(result?.slots.some((slot) => slot.character.id === 2606)).toBe(false);
  });

  it('relaxes a manual Big Mom sub outside STR, DEX, and QCK scope', () => {
    const result = buildAutoTeamResult(createBigMomLeaderTeamRecords(), {
      ...createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT'], ['Powerhouse'], {
        manualSlots: createManualSlots({
          captain: [2500],
          friendCaptain: [2500],
          sub1: [2605],
        }),
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 2605)).toBe(false);
  });

  it('relaxes a manual sub outside the active leader scope', () => {
    const result = buildAutoTeamResult(createKaidoLeaderTeamRecords(), {
      ...createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT'], ['Powerhouse', 'Striker'], {
        lockedCharacterIds: [2700, 2705],
        captainCharacterId: 2700,
        friendCaptainCharacterId: 2700,
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 2705)).toBe(false);
  });

  it('intersects dual leader class scope before filling subs', () => {
    const result = buildAutoTeamResult(createIntersectedLeaderTeamRecords(), {
      ...createInput(['DEX', 'PSY'], ['Powerhouse'], {
        lockedCharacterIds: [2710, 2711],
        captainCharacterId: 2710,
        friendCaptainCharacterId: 2711,
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.coverage.leaderCriteria.dualLeaderMode).toBe('intersection');
    expect(result?.coverage.leaderCriteria.derivedAllowedClasses).toEqual(['Powerhouse']);
    expect(
      result?.slots
        .slice(2)
        .every(
          (slot) =>
            slot.character.classes.includes('Powerhouse') ||
            ['DEX', 'PSY'].includes(slot.character.type),
        ),
    ).toBe(true);
  });

  it('requires both base branches of a dual-character leader before filling subs', () => {
    const result = buildAutoTeamResult(createStrictDualCharacterLeaderRecords(), {
      ...createInput(['DEX', 'QCK', 'PSY', 'STR', 'INT'], ['Fighter', 'Powerhouse'], {
        requireFullCaptainAbilityCoverage: true,
        lockedCharacterIds: [4521],
        captainCharacterId: 4521,
        friendCaptainCharacterId: 4521,
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.coverage.leaderCriteria.allSlotsMatch).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 4525)).toBe(false);
    expect(result?.slots.some((slot) => slot.character.id === 4526)).toBe(false);
    expect(
      result?.slots
        .slice(2)
        .every((slot) =>
          slot.character.classes.some((characterClass) =>
            ['Fighter', 'Powerhouse'].includes(characterClass),
          ),
        ),
    ).toBe(true);
  });

  it('allows either base branch of a VS dual-character leader before filling subs', () => {
    const result = buildAutoTeamResult(createVsEitherBranchLeaderRecords(), {
      ...createInput(
        ['DEX', 'QCK', 'PSY', 'STR', 'INT'],
        ['Cerebral', 'Driven', 'Free Spirit', 'Powerhouse', 'Shooter', 'Slasher'],
        {
          requireFullCaptainAbilityCoverage: true,
          requireBothLeadersFullCaptainAbilityCoverage: true,
          lockedCharacterIds: [4469],
          captainCharacterId: 4469,
          friendCaptainCharacterId: 4469,
        },
      ),
    });

    const slotIds = result?.slots.map((slot) => slot.character.id) ?? [];

    expect(result).not.toBeNull();
    expect(result?.coverage.leaderCriteria.allSlotsMatch).toBe(true);
    expect(result?.slots[0]?.captainBranchSelection).toMatchObject({
      mode: 'character1',
      displayName: 'Zoro',
      source: 'auto',
    });
    expect(slotIds).toEqual(expect.arrayContaining([4470, 4471, 4472, 4473]));
    expect(slotIds).not.toContain(4474);
  });

  it('uses the manually selected VS captain branch for strict coverage', () => {
    const result = buildAutoTeamResult(createVsManualBranchSelectionRecords(), {
      ...createInput(
        ['DEX', 'QCK', 'PSY', 'STR', 'INT'],
        ['Cerebral', 'Driven', 'Free Spirit', 'Powerhouse', 'Shooter', 'Slasher'],
        {
          requireFullCaptainAbilityCoverage: true,
          lockedCharacterIds: [4469],
          captainCharacterId: 4469,
          friendCaptainCharacterId: 4469,
          manualSlots: [
            {
              role: 'captain',
              characterIds: [4469],
              branchSelections: [{ characterId: 4469, mode: 'character1' }],
            },
            {
              role: 'friendCaptain',
              characterIds: [4469],
              branchSelections: [{ characterId: 4469, mode: 'character2' }],
            },
            { role: 'sub1', characterIds: [] },
            { role: 'sub2', characterIds: [] },
            { role: 'sub3', characterIds: [] },
            { role: 'sub4', characterIds: [] },
          ],
        },
      ),
    });

    const slotIds = result?.slots.map((slot) => slot.character.id) ?? [];

    expect(result).not.toBeNull();
    expect(result?.coverage.leaderCriteria.allSlotsMatch).toBe(true);
    expect(result?.slots[0]?.captainBranchSelection).toMatchObject({
      mode: 'character1',
      displayName: 'Zoro',
      source: 'manual',
    });
    expect(result?.slots[1]?.captainBranchSelection).toMatchObject({
      mode: 'character2',
      displayName: 'Lucci',
      source: 'manual',
    });
    expect(slotIds).toEqual(expect.arrayContaining([4601, 4602, 4603, 4604]));
    expect(slotIds).not.toContain(4611);
  });

  it('builds a strict favorites team when a locked VS branch has combined-card metadata', async () => {
    const records = createVsManualBranchSelectionRecordsWithEmptyCombinedLeaderClasses();
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(records),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        favoritesOnly: true,
        favoriteCharacterIds: records.map((record) => record.id),
        requireFullCaptainAbilityCoverage: true,
        requireUniqueBaseCharacterNames: true,
        manualSlots: [
          {
            role: 'captain',
            characterIds: [4469],
            requiredCharacterId: 4469,
            branchSelections: [{ characterId: 4469, mode: 'character1' }],
          },
          { role: 'friendCaptain', characterIds: [], requiredCharacterId: null },
          { role: 'sub1', characterIds: [], requiredCharacterId: null },
          { role: 'sub2', characterIds: [], requiredCharacterId: null },
          { role: 'sub3', characterIds: [], requiredCharacterId: null },
          { role: 'sub4', characterIds: [], requiredCharacterId: null },
        ],
      },
      { workerCount: 1 },
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(4469);
    expect(result?.slots[1]?.character.id).toBe(4469);
    expect(result?.slots[0]?.captainBranchSelection).toMatchObject({
      mode: 'character1',
      displayName: 'Zoro',
      source: 'manual',
    });
    expect(result?.coverage.leaderCriteria.allSlotsMatch).toBe(true);
  });

  it('rejects a type-only captain that does not cover every base type of a required dual friend captain', () => {
    const result = buildAutoTeamResult(createStrictDualTargetCaptainPairRecords(), {
      ...createInput(['DEX', 'STR', 'QCK', 'PSY'], ['Fighter', 'Powerhouse'], {
        requireFullCaptainAbilityCoverage: true,
        lockedCharacterIds: [4521],
        manualSlots: createManualSlots(
          {
            captain: [4306, 4310],
            friendCaptain: [4521],
          },
          {
            friendCaptain: 4521,
          },
        ),
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(4310);
    expect(result?.slots[0]?.character.id).not.toBe(4306);
    expect(result?.slots[1]?.character.id).toBe(4521);
    expect(result?.coverage.leaderCriteria.allSlotsMatch).toBe(true);
  });

  it('excludes mixed-type subs outside a type-only captain scope', () => {
    const result = buildAutoTeamResult(createStrictTypeOnlyCaptainTeamRecords(), {
      ...createInput(['DEX', 'STR', 'QCK', 'PSY'], [], {
        requireFullCaptainAbilityCoverage: true,
        lockedCharacterIds: [4306],
        manualSlots: createManualSlots(
          {
            captain: [4306],
            friendCaptain: [4306],
          },
          {
            captain: 4306,
            friendCaptain: 4306,
          },
        ),
      }),
    });

    const allowedTypes = new Set(['DEX', 'STR']);

    expect(result).not.toBeNull();
    expect(result?.coverage.leaderCriteria.allSlotsMatch).toBe(true);
    expect(result?.slots.some((slot) => [4322, 4348, 4268].includes(slot.character.id))).toBe(
      false,
    );
    expect(
      result?.slots.every((slot) =>
        slot.character.type.split(',').every((type) => allowedTypes.has(type.trim())),
      ),
    ).toBe(true);
  });

  it('falls back to generic roster selection when captain ability has no clear scope', () => {
    const result = buildAutoTeamResult(createScopeFreeLeaderTeamRecords(), {
      ...createInput(['DEX', 'PSY'], ['Fighter'], {
        lockedCharacterIds: [2720],
        captainCharacterId: 2720,
        friendCaptainCharacterId: 2720,
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.coverage.leaderCriteria.hasCostRestriction).toBe(false);
    expect(result?.coverage.leaderCriteria.maxAllowedCost).toBeNull();
    expect(result?.coverage.leaderCriteria.hasClassRestriction).toBe(false);
    expect(result?.coverage.leaderCriteria.hasTypeRestriction).toBe(false);
    expect(result?.coverage.leaderCriteria.allSlotsMatch).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 2724)).toBe(true);
  });

  it('does not apply Buggy cost-only captain text as leader restriction', () => {
    const result = buildAutoTeamResult(createBuggyLeaderTeamRecords(), {
      ...createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT'], [], {
        lockedCharacterIds: [2035],
        captainCharacterId: 2035,
        friendCaptainCharacterId: 2035,
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.coverage.leaderCriteria.hasCostRestriction).toBe(false);
    expect(result?.coverage.leaderCriteria.maxAllowedCost).toBeNull();
  });

  it('rejects a leader with only non-roster super special criteria when the toggle is enabled', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperCriteriaRecord(
          7001,
          'Monkey D. Luffy',
          createNonRosterSuperCriteria(),
        ),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createCharacterRecord({
          id: 7002,
          name: 'Roronoa Zoro',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts chain by 1.2x for 1 turn.',
          },
        }),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireLeaderSuperSpecialCriteria: true,
      }),
    );

    expect(result).toBeNull();
  });

  it('prunes unsupported super special subs before searching strict teams', () => {
    const unsupportedIds = Array.from({ length: 48 }, (_, index) => 9000 + index);
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 7330,
          name: 'Strict Search Captain',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of all characters by 5x and their HP by 1.3x.',
            specialText: 'Boosts orb effects of crew by 2.25x for 1 turn.',
          },
        }),
        ...unsupportedIds.map((id) => createUnsupportedSuperSpecialSubRecord(id)),
        createCharacterRecord({
          id: 7324,
          name: 'Valid Strict Sub 1',
          primaryClass: 'Fighter',
          detail: { specialText: 'Boosts ATK of crew by 2x for 1 turn.' },
        }),
        createCharacterRecord({
          id: 7323,
          name: 'Valid Strict Sub 2',
          primaryClass: 'Fighter',
          detail: { specialText: 'Boosts orb effects of crew by 2x for 1 turn.' },
        }),
        createCharacterRecord({
          id: 7322,
          name: 'Valid Strict Sub 3',
          primaryClass: 'Fighter',
          detail: { specialText: 'Reduces Bind duration by 5 turns.' },
        }),
        createCharacterRecord({
          id: 7321,
          name: 'Valid Strict Sub 4',
          primaryClass: 'Fighter',
          detail: { specialText: 'Reduces Paralysis duration by 5 turns.' },
        }),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireLeaderSuperSpecialCriteria: true,
        manualSlots: createManualSlots({
          captain: [7330],
          friendCaptain: [7330],
        }),
        lockedCharacterIds: [7330],
        captainCharacterId: 7330,
        friendCaptainCharacterId: 7330,
      }),
    );
    const resultIds = result?.slots.map((slot) => slot.character.id) ?? [];

    expect(result).not.toBeNull();
    expect(resultIds.some((id) => unsupportedIds.includes(id))).toBe(false);
    expect(resultIds).toEqual([7330, 7330, 7324, 7323, 7322, 7321]);
  });

  it('keeps required unsupported super special manual subs available to relaxed fallback attempts', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue([
        createCharacterRecord({
          id: 7340,
          name: 'Fallback Captain',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of all characters by 5x and their HP by 1.3x.',
            specialText: 'Boosts orb effects of crew by 2.25x for 1 turn.',
          },
        }),
        createNonRosterSuperSpecialSubRecord(7341),
        createCharacterRecord({
          id: 7342,
          primaryClass: 'Fighter',
          detail: { specialText: 'Boosts ATK of crew by 2x for 1 turn.' },
        }),
        createCharacterRecord({
          id: 7343,
          primaryClass: 'Fighter',
          detail: { specialText: 'Reduces Bind duration by 5 turns.' },
        }),
        createCharacterRecord({
          id: 7344,
          primaryClass: 'Fighter',
          detail: { specialText: 'Reduces Paralysis duration by 5 turns.' },
        }),
      ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      manualSlots: createManualSlots(
        {
          captain: [7340],
          friendCaptain: [7340],
          sub1: [7341],
        },
        {
          sub1: 7341,
        },
      ),
    });

    expect(result).not.toBeNull();
    expect(result?.requestedInput.requireLeaderSuperSpecialCriteria).toBe(true);
    expect(result?.input.requireLeaderSuperSpecialCriteria).toBe(false);
    expect(result?.relaxation.ignoredLeaderSuperSpecialCriteria).toBe(true);
    expect(result?.relaxation.ignoredSuperSpecialCriteriaCharacterNames).toEqual([
      'Non-roster Super Special 7341',
    ]);
    expect(result?.slots.some((slot) => slot.character.id === 7341)).toBe(true);
  });

  it('builds a team satisfying a manual sub Super Tandem criteria branch', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 7410,
          name: 'Super Tandem Captain',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of all characters by 5x and their HP by 1.3x.',
            specialText: 'Boosts orb effects of crew by 2.25x for 1 turn.',
          },
        }),
        createSuperTandemSubRecord(
          7411,
          'Luffy & Bonney',
          createRosterSuperCriteria(2, ['Roronoa Zoro', 'Nami']),
        ),
        createCharacterRecord({
          id: 7412,
          name: 'Roronoa Zoro',
          primaryClass: 'Fighter',
          detail: { specialText: 'Boosts ATK of crew by 2x for 1 turn.' },
        }),
        createCharacterRecord({
          id: 7413,
          name: 'Nami',
          primaryClass: 'Fighter',
          detail: { specialText: 'Reduces Bind duration by 5 turns.' },
        }),
        createCharacterRecord({
          id: 7414,
          name: 'Utility Filler',
          primaryClass: 'Fighter',
          detail: { specialText: 'Reduces Paralysis duration by 5 turns.' },
        }),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireSuperTandemCriteria: true,
        manualSlots: createManualSlots({
          captain: [7410],
          friendCaptain: [7410],
          sub1: [7411],
        }),
        lockedCharacterIds: [7410, 7411],
        captainCharacterId: 7410,
        friendCaptainCharacterId: 7410,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.name === 'Roronoa Zoro')).toBe(true);
    expect(result?.slots.some((slot) => slot.character.name === 'Nami')).toBe(true);
  });

  it('keeps required unsupported Super Tandem manual subs available to relaxed fallback attempts', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue([
        createCharacterRecord({
          id: 7420,
          name: 'Fallback Tandem Captain',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of all characters by 5x and their HP by 1.3x.',
            specialText: 'Boosts orb effects of crew by 2.25x for 1 turn.',
          },
        }),
        createNonRosterSuperTandemSubRecord(7421),
        createCharacterRecord({
          id: 7422,
          primaryClass: 'Fighter',
          detail: { specialText: 'Boosts ATK of crew by 2x for 1 turn.' },
        }),
        createCharacterRecord({
          id: 7423,
          primaryClass: 'Fighter',
          detail: { specialText: 'Reduces Bind duration by 5 turns.' },
        }),
        createCharacterRecord({
          id: 7424,
          primaryClass: 'Fighter',
          detail: { specialText: 'Reduces Paralysis duration by 5 turns.' },
        }),
      ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      manualSlots: createManualSlots(
        {
          captain: [7420],
          friendCaptain: [7420],
          sub1: [7421],
        },
        {
          sub1: 7421,
        },
      ),
    });

    expect(result).not.toBeNull();
    expect(result?.requestedInput.requireSuperTandemCriteria).toBe(true);
    expect(result?.input.requireSuperTandemCriteria).toBe(false);
    expect(result?.relaxation.ignoredSuperTandemCriteria).toBe(true);
    expect(result?.relaxation.ignoredSuperTandemCriteriaCharacterNames).toEqual([
      'Non-roster Super Tandem 7421',
    ]);
    expect(result?.slots.some((slot) => slot.character.id === 7421)).toBe(true);
  });

  it('does not require a Super Special leader when strict criteria coverage is enabled', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue([
        createLeaderWithSuperCriteriaRecord(
          7435,
          'Unsupported Super Special Captain',
          createNonRosterSuperCriteria(),
        ),
        createLeaderPriorityCaptainRecord({
          id: 7434,
          name: 'Normal Coverage Captain',
          cost: 55,
          atkMultiplier: 5,
        }),
        createCharacterRecord({
          id: 7433,
          name: 'Roronoa Zoro',
          primaryClass: 'Fighter',
          detail: { specialText: 'Boosts ATK of crew by 2x for 1 turn.' },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
      ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      strictSuperSpecialCriteriaCoverage: true,
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(7434);
    expect(result?.slots[1]?.character.id).toBe(7434);
    expect(result?.slots.some((slot) => slot.character.id === 7435)).toBe(false);
    expect(result?.relaxation.ignoredLeaderSuperSpecialCriteria).toBe(false);
  });

  it('keeps normal leader ranking when a newer Super Special leader satisfies strict criteria', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue([
        createLeaderWithSuperCriteriaRecord(
          7445,
          'Valid Super Special Captain',
          createRosterSuperCriteria(1, ['Roronoa Zoro']),
        ),
        createLeaderPriorityCaptainRecord({
          id: 7444,
          name: 'Older Normal Captain',
          cost: 55,
          atkMultiplier: 5,
        }),
        createCharacterRecord({
          id: 7443,
          name: 'Roronoa Zoro',
          primaryClass: 'Fighter',
          detail: { specialText: 'Boosts ATK of crew by 2x for 1 turn.' },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
      ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      strictSuperSpecialCriteriaCoverage: true,
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(7445);
    expect(result?.slots[1]?.character.id).toBe(7445);
    expect(result?.slots.some((slot) => slot.character.name === 'Roronoa Zoro')).toBe(true);
    expect(result?.relaxation.usedFallback).toBe(false);
  });

  it('does not require a Super Tandem leader when strict criteria coverage is enabled', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue([
        createLeaderWithSuperTandemCriteriaRecord(
          7455,
          'Unsupported Super Tandem Captain',
          createNonRosterSuperCriteria(),
        ),
        createLeaderPriorityCaptainRecord({
          id: 7454,
          name: 'Normal Tandem Coverage Captain',
          cost: 55,
          atkMultiplier: 5,
        }),
        createCharacterRecord({
          id: 7453,
          name: 'Nami',
          primaryClass: 'Fighter',
          detail: { specialText: 'Reduces Bind duration by 5 turns.' },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
      ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      strictSuperTandemCriteriaCoverage: true,
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(7454);
    expect(result?.slots[1]?.character.id).toBe(7454);
    expect(result?.slots.some((slot) => slot.character.id === 7455)).toBe(false);
    expect(result?.relaxation.ignoredSuperTandemCriteria).toBe(false);
  });

  it('keeps normal leader ranking when a newer Super Tandem leader satisfies strict criteria', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue([
        createLeaderWithSuperTandemCriteriaRecord(
          7465,
          'Valid Super Tandem Captain',
          createRosterSuperCriteria(1, ['Nami']),
        ),
        createLeaderPriorityCaptainRecord({
          id: 7464,
          name: 'Older Normal Tandem Captain',
          cost: 55,
          atkMultiplier: 5,
        }),
        createCharacterRecord({
          id: 7463,
          name: 'Nami',
          primaryClass: 'Fighter',
          detail: { specialText: 'Reduces Bind duration by 5 turns.' },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
      ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      strictSuperTandemCriteriaCoverage: true,
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(7465);
    expect(result?.slots[1]?.character.id).toBe(7465);
    expect(result?.slots.some((slot) => slot.character.name === 'Nami')).toBe(true);
    expect(result?.relaxation.usedFallback).toBe(false);
  });

  it('accepts a mixed super special criteria leader when the roster branch is satisfied', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperCriteriaRecord(
          7010,
          'Monkey D. Luffy',
          createMixedRosterSuperCriteria(1, ['Roronoa Zoro', 'Nami']),
        ),
        createCharacterRecord({
          id: 7011,
          name: 'Roronoa Zoro',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts chain by 1.2x for 1 turn.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireLeaderSuperSpecialCriteria: true,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.name === 'Roronoa Zoro')).toBe(true);
  });

  it('enforces both leaders super special criteria when both selected leaders have them', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperCriteriaRecord(
          7020,
          'Monkey D. Luffy',
          createRosterSuperCriteria(1, ['Roronoa Zoro']),
        ),
        createLeaderWithSuperCriteriaRecord(
          7021,
          'Trafalgar D. Water Law',
          createRosterSuperCriteria(1, ['Nami']),
        ),
        createCharacterRecord({
          id: 7022,
          name: 'Roronoa Zoro',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts chain by 1.2x for 1 turn.',
          },
        }),
        createCharacterRecord({
          id: 7023,
          name: 'Nami',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces paralysis duration by 5 turns.',
          },
        }),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireLeaderSuperSpecialCriteria: true,
        lockedCharacterIds: [7020, 7021],
        captainCharacterId: 7020,
        friendCaptainCharacterId: 7021,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.name === 'Roronoa Zoro')).toBe(true);
    expect(result?.slots.some((slot) => slot.character.name === 'Nami')).toBe(true);
  });

  it('builds teams only from the leader super effect scope when enabled', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperEffectScopeRecord(7200, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superTypeEffect: 'Changes DEX characters to Super DEX.',
        }),
        createSuperEffectScopeSubRecord(7201, {
          type: 'DEX',
          primaryClass: 'Fighter',
        }),
        createSuperEffectScopeSubRecord(7202, {
          type: 'DEX',
          primaryClass: 'Slasher',
        }),
        createSuperEffectScopeSubRecord(7203, {
          type: 'DEX',
          primaryClass: 'Driven',
        }),
        createSuperEffectScopeSubRecord(7204, {
          type: 'DEX',
          primaryClass: 'Powerhouse',
        }),
        createSuperEffectScopeSubRecord(7205, {
          type: 'STR',
          primaryClass: 'Fighter',
        }),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireAllSlotsInLeaderSuperEffectScope: true,
        lockedCharacterIds: [7200],
        captainCharacterId: 7200,
        friendCaptainCharacterId: 7200,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.every((slot) => slot.character.type.includes('DEX'))).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 7205)).toBe(false);
  });

  it('enforces sub super special scope and activation criteria when strict super scope is enabled', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperEffectScopeRecord(7260, {
          type: 'STR',
          primaryClass: 'Fighter',
        }),
        createStrSuperSpecialSubRecord(7261),
        createTaggedStrSubRecord(7262, ['Straw Hat Pirates']),
        createTaggedStrSubRecord(7263, ['Giant']),
        createTaggedStrSubRecord(7264, ['Four Emperors']),
        createSuperEffectScopeSubRecord(7265, {
          type: 'STR',
          primaryClass: 'Slasher',
        }),
      ],
      createInput(['STR'], ['Fighter'], {
        requireAllSlotsInLeaderSuperEffectScope: true,
        requireLeaderSuperSpecialCriteria: true,
        manualSlots: createManualSlots({
          captain: [7260],
          friendCaptain: [7260],
          sub1: [7261],
        }),
        lockedCharacterIds: [7260, 7261],
        captainCharacterId: 7260,
        friendCaptainCharacterId: 7260,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.every((slot) => slot.character.type.includes('STR'))).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 7261)).toBe(true);
  });

  it('allows dual-type slots when one type matches a strict sub super special scope', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperEffectScopeRecord(7266, {
          type: 'STR',
          primaryClass: 'Fighter',
        }),
        createStrSuperSpecialSubRecord(7267),
        createTaggedStrSubRecord(7268, ['Straw Hat Pirates']),
        createTaggedStrSubRecord(7269, ['Giant'], 'STR,DEX'),
        createTaggedStrSubRecord(7270, ['Four Emperors']),
        createSuperEffectScopeSubRecord(7271, {
          type: 'STR',
          primaryClass: 'Slasher',
        }),
      ],
      createInput(['STR'], ['Fighter'], {
        requireAllSlotsInLeaderSuperEffectScope: true,
        requireLeaderSuperSpecialCriteria: true,
        manualSlots: createManualSlots({
          captain: [7266],
          friendCaptain: [7266],
          sub1: [7267],
        }),
        lockedCharacterIds: [7266, 7267],
        captainCharacterId: 7266,
        friendCaptainCharacterId: 7266,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 7269)).toBe(true);
  });

  it('relaxes a strict sub super special manual pick outside the effect scope', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperEffectScopeRecord(7272, {
          type: 'STR',
          primaryClass: 'Fighter',
        }),
        createStrSuperSpecialSubRecord(7273),
        createTaggedStrSubRecord(7274, ['Straw Hat Pirates']),
        createTaggedStrSubRecord(7275, ['Giant']),
        createTaggedStrSubRecord(7276, ['Four Emperors'], 'DEX'),
        createSuperEffectScopeSubRecord(7277, {
          type: 'STR',
          primaryClass: 'Slasher',
        }),
      ],
      createInput(['STR'], ['Fighter'], {
        requireAllSlotsInLeaderSuperEffectScope: true,
        requireLeaderSuperSpecialCriteria: true,
        manualSlots: createManualSlots({
          captain: [7272],
          friendCaptain: [7272],
          sub1: [7273],
        }),
        lockedCharacterIds: [7272, 7273],
        captainCharacterId: 7272,
        friendCaptainCharacterId: 7272,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 7273)).toBe(false);
  });

  it('relaxes a strict sub super special manual pick when activation tags are not satisfied', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperEffectScopeRecord(7278, {
          type: 'STR',
          primaryClass: 'Fighter',
        }),
        createStrSuperSpecialSubRecord(7279),
        createTaggedStrSubRecord(7280, ['Straw Hat Pirates']),
        createTaggedStrSubRecord(7281, ['Giant']),
        createSuperEffectScopeSubRecord(7282, {
          type: 'STR',
          primaryClass: 'Slasher',
        }),
        createSuperEffectScopeSubRecord(7283, {
          type: 'STR',
          primaryClass: 'Driven',
        }),
      ],
      createInput(['STR'], ['Fighter'], {
        requireAllSlotsInLeaderSuperEffectScope: true,
        requireLeaderSuperSpecialCriteria: true,
        manualSlots: createManualSlots({
          captain: [7278],
          friendCaptain: [7278],
          sub1: [7279],
        }),
        lockedCharacterIds: [7278, 7279],
        captainCharacterId: 7278,
        friendCaptainCharacterId: 7278,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 7279)).toBe(false);
  });

  it('intersects captain and friend captain super effect scopes', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperEffectScopeRecord(7210, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superTypeEffect: 'Changes DEX characters to Super DEX.',
        }),
        createLeaderWithSuperEffectScopeRecord(7211, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superClassEffect: 'Transforms Fighter characters into Super Fighter characters.',
        }),
        createSuperEffectScopeSubRecord(7212, {
          type: 'DEX',
          primaryClass: 'Fighter',
        }),
        createSuperEffectScopeSubRecord(7213, {
          type: 'DEX',
          primaryClass: 'Fighter',
        }),
        createSuperEffectScopeSubRecord(7214, {
          type: 'DEX',
          primaryClass: 'Striker',
        }),
        createSuperEffectScopeSubRecord(7215, {
          type: 'PSY',
          primaryClass: 'Fighter',
        }),
        createSuperEffectScopeSubRecord(7216, {
          type: 'DEX',
          primaryClass: 'Fighter',
        }),
        createSuperEffectScopeSubRecord(7217, {
          type: 'DEX',
          primaryClass: 'Fighter',
        }),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireAllSlotsInLeaderSuperEffectScope: true,
        lockedCharacterIds: [7210, 7211],
        captainCharacterId: 7210,
        friendCaptainCharacterId: 7211,
      }),
    );

    expect(result).not.toBeNull();
    expect(
      result?.slots.every(
        (slot) => slot.character.type.includes('DEX') && slot.character.classes.includes('Fighter'),
      ),
    ).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 7214)).toBe(false);
    expect(result?.slots.some((slot) => slot.character.id === 7215)).toBe(false);
  });

  it('relaxes manual sub picks outside the leader super effect scope', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperEffectScopeRecord(7220, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superTypeEffect: 'Changes DEX characters to Super DEX.',
        }),
        createSuperEffectScopeSubRecord(7221, {
          type: 'DEX',
          primaryClass: 'Fighter',
        }),
        createSuperEffectScopeSubRecord(7222, {
          type: 'DEX',
          primaryClass: 'Slasher',
        }),
        createSuperEffectScopeSubRecord(7223, {
          type: 'DEX',
          primaryClass: 'Driven',
        }),
        createSuperEffectScopeSubRecord(7224, {
          type: 'DEX',
          primaryClass: 'Powerhouse',
        }),
        createSuperEffectScopeSubRecord(7225, {
          type: 'STR',
          primaryClass: 'Fighter',
        }),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireAllSlotsInLeaderSuperEffectScope: true,
        manualSlots: createManualSlots({
          captain: [7220],
          friendCaptain: [7220],
          sub1: [7225],
        }),
        lockedCharacterIds: [7220, 7225],
        captainCharacterId: 7220,
        friendCaptainCharacterId: 7220,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 7225)).toBe(false);
    expect(result?.slots.every((slot) => slot.character.type.includes('DEX'))).toBe(true);
  });

  it('rejects leaders without parseable super effect scope when the filter is enabled', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperEffectScopeRecord(7230, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superTypeEffect: 'Boosts crew ATK by 1.3x for 1 turn.',
        }),
        createSuperEffectScopeSubRecord(7231, {
          type: 'DEX',
          primaryClass: 'Fighter',
        }),
        createSuperEffectScopeSubRecord(7232, {
          type: 'DEX',
          primaryClass: 'Slasher',
        }),
        createSuperEffectScopeSubRecord(7233, {
          type: 'DEX',
          primaryClass: 'Driven',
        }),
        createSuperEffectScopeSubRecord(7234, {
          type: 'DEX',
          primaryClass: 'Powerhouse',
        }),
        createSuperEffectScopeSubRecord(7235, {
          type: 'DEX',
          primaryClass: 'Shooter',
        }),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireAllSlotsInLeaderSuperEffectScope: true,
        lockedCharacterIds: [7230],
        captainCharacterId: 7230,
        friendCaptainCharacterId: 7230,
      }),
    );

    expect(result).toBeNull();
  });

  it('filters super leaders out of auto leader selection during the hidden default exact attempt', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperEffectScopeRecord(7236, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superTypeEffect: 'Changes DEX characters to Super DEX.',
        }),
        createUniversalCaptainRecord(),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter']),
      { requireLeadersWithoutSuperEffects: true },
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(5905);
    expect(result?.slots[1]?.character.id).toBe(5905);
    expect(result?.slots[0]?.character.id).not.toBe(7236);
    expect(result?.slots[1]?.character.id).not.toBe(7236);
  });

  it('rejects manual leaders with super effects during the hidden default exact attempt', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperEffectScopeRecord(7237, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superClassEffect: 'Transforms Fighter characters into Super Fighter characters.',
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        lockedCharacterIds: [7237],
        captainCharacterId: 7237,
        friendCaptainCharacterId: 7237,
      }),
      { requireLeadersWithoutSuperEffects: true },
    );

    expect(result).toBeNull();
  });

  it('still allows super units in sub slots during the hidden default exact attempt', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createLeaderWithSuperEffectScopeRecord(7238, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superTypeEffect: 'Changes DEX characters to Super DEX.',
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        lockedCharacterIds: [5900],
        captainCharacterId: 5900,
        friendCaptainCharacterId: 5900,
      }),
      { requireLeadersWithoutSuperEffects: true },
    );

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 7238)).toBe(true);
  });

  it('prefers the newer captain when universal and partial multi-type captains share the same cost', () => {
    const result = buildAutoTeamResult(
      [
        createPartialMultiTypeCaptainRecord(),
        createUniversalCaptainRecord(),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX', 'PSY']),
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(5906);
    expect(result?.slots[0]?.reasonChips).toContain('DEX captain');
  });

  it('builds one strict type-coverage team when all selected types can be covered', () => {
    const result = buildAutoTeamResult(
      [
        createStrictMixedCaptainRecord(),
        createSlasherQckAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX', 'QCK'], ['Fighter', 'Slasher'], { requireAllSelectedTypesInTeam: true }),
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.coveredSelectedClasses).toEqual(['Fighter', 'Slasher']);
    expect(result?.coverage.coveredSelectedTypes).toEqual(['DEX', 'QCK']);
    expect(result?.coverage.coversAllSelectedClasses).toBe(true);
    expect(result?.coverage.coversAllSelectedTypes).toBe(true);
  });

  it('returns a team when class strict mode is off and not all selected classes are covered', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter', 'Shooter']),
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.coveredSelectedClasses).toEqual(['Fighter']);
    expect(result?.coverage.coversAllSelectedClasses).toBe(false);
  });

  it('returns a team when type strict mode is off and not all selected types are covered', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX', 'INT']),
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.coveredSelectedTypes).toEqual(['DEX']);
    expect(result?.coverage.coversAllSelectedTypes).toBe(false);
  });

  it('fails strict type coverage when a selected type cannot be covered', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX', 'INT'], ['Fighter'], { requireAllSelectedTypesInTeam: true }),
    );

    expect(result).toBeNull();
  });

  it('covers strict character tag requirements with one slot matching multiple tags', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 7101,
          name: 'Tagged Utility',
          primaryClass: 'Fighter',
          detail: {
            characterTags: ['Straw Hat Pirates', 'Driven'],
            specialText: 'Reduces Bind duration by 5 turns.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        selectedCharacterTags: ['Straw Hat Pirates', 'Driven'],
        requireAllSelectedCharacterTagsInTeam: true,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.coveredSelectedCharacterTags).toEqual(['Straw Hat Pirates', 'Driven']);
    expect(result?.coverage.coversAllSelectedCharacterTags).toBe(true);
  });

  it('fails strict character tag coverage when a selected tag cannot be covered', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        selectedCharacterTags: ['Minks'],
        requireAllSelectedCharacterTagsInTeam: true,
      }),
    );

    expect(result).toBeNull();
  });

  it('requires selected character names to be covered by distinct final slots', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 7110,
          name: 'Monkey D. Luffy & Roronoa Zoro',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.25x.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        selectedCharacterNames: ['luffy', 'zoro'],
        requireAllSelectedCharacterNamesInTeam: true,
      }),
    );

    expect(result).toBeNull();
  });

  it('fuzzy-matches selected character names against final team variants', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 7121,
          name: 'Roronoa Zoro, King of Hell',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts ATK of Fighter characters by 2.5x for 1 turn.',
          },
        }),
        createCharacterRecord({
          id: 7122,
          name: 'Monkey D. Luffy Gear 5',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts orb effects of Fighter characters by 2.25x for 1 turn.',
          },
        }),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        selectedCharacterNames: ['zoro', 'luffy'],
        requireAllSelectedCharacterNamesInTeam: true,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.coveredSelectedCharacterNames).toEqual(['zoro', 'luffy']);
    expect(result?.coverage.coversAllSelectedCharacterNames).toBe(true);
  });

  it('builds a team only when every chosen unit has all selected classes in strict class mode', () => {
    const result = buildAutoTeamResult(createAllClassStrictTeamRecords(), {
      ...createInput(['DEX'], ['Fighter', 'Slasher']),
      requireAllSelectedClassesPerCharacter: true,
    });

    expect(result).not.toBeNull();
    expect(result?.slots.every((slot) => slot.character.classes.includes('Fighter'))).toBe(true);
    expect(result?.slots.every((slot) => slot.character.classes.includes('Slasher'))).toBe(true);
  });

  it('fails strict class mode when even one slot cannot be filled by an all-class candidate', () => {
    const result = buildAutoTeamResult(createInsufficientStrictClassTeamRecords(), {
      ...createInput(['DEX'], ['Fighter', 'Slasher']),
      requireAllSelectedClassesPerCharacter: true,
    });

    expect(result).toBeNull();
  });

  it('keeps locked characters in the generated team and fills the remaining slots', () => {
    const lockedCharacterIds = [5926, 5880];
    const result = buildAutoTeamResult(createStrictMixedTeamRecords(), {
      ...createInput(['DEX', 'PSY'], ['Fighter', 'Slasher']),
      lockedCharacterIds,
    });

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 5926)).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 5880)).toBe(true);
  });

  it('falls back to the first four legacy locked subs when more than four sub picks are provided', () => {
    const records = [
      ...createAllClassStrictTeamRecords(),
      createCharacterRecord({
        id: 5936,
        type: 'DEX',
        primaryClass: 'Fighter',
        secondaryClass: 'Slasher',
        detail: {
          specialText: 'Boosts ATK of Fighter and Slasher characters by 2x for 1 turn.',
        },
      }),
    ];
    const result = buildAutoTeamResult(records, {
      ...createInput(['DEX'], ['Fighter', 'Slasher']),
      lockedCharacterIds: [5930, 5931, 5932, 5933, 5934, 5936],
    });

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 5936)).toBe(false);
  });

  it('forces captain selection from locked picks when five locked characters are provided', () => {
    const lockedCharacterIds = [5925, 5926, 5880, 5870, 5860];
    const result = buildAutoTeamResult(createStrictMixedTeamRecords(), {
      ...createInput(['DEX', 'PSY'], ['Fighter', 'Slasher']),
      lockedCharacterIds,
    });

    expect(result).not.toBeNull();
    expect(lockedCharacterIds).toContain(result?.slots[0]?.character.id ?? -1);

    const uniqueTeamIds = new Set(result?.slots.map((slot) => slot.character.id) ?? []);

    expect(uniqueTeamIds).toEqual(new Set(lockedCharacterIds));
  });

  it('builds a six-slot team when five manual picks include two distinct leaders', () => {
    const lockedCharacterIds = [5925, 5927, 5926, 5880, 5870];
    const result = buildAutoTeamResult(createDualLeaderMixedTeamRecords(), {
      ...createInput(['DEX', 'PSY'], ['Fighter', 'Slasher'], {
        lockedCharacterIds,
        captainCharacterId: 5925,
        friendCaptainCharacterId: 5927,
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots).toHaveLength(6);
    expect(result?.slots[0]?.character.id).toBe(5925);
    expect(result?.slots[1]?.character.id).toBe(5927);
    expect(new Set(result?.slots.map((slot) => slot.character.id) ?? [])).toEqual(
      new Set([5925, 5927, 5926, 5880, 5870, 5860]),
    );
  });

  it('requests combined candidates from the repository service when multiple types are selected', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY']);

    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX', 'PSY'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter', 'Slasher'],
        allowedCharacterIds: undefined,
        lockedCharacterIds: [],
        excludedCharacterIds: [],
      },
    );
  });

  it('normalizes and forwards excluded character ids to the repository query', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      excludedCharacterIds: [5926, 5926, -1, 0],
    });

    expect(result?.input.excludedCharacterIds).toEqual([5926]);
    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX', 'PSY'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter', 'Slasher'],
        allowedCharacterIds: undefined,
        lockedCharacterIds: [],
        excludedCharacterIds: [5926],
      },
    );
  });

  it('normalizes duplicate classes before building', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      ['Fighter', ' Slasher ', 'fighter'],
      ['DEX', 'PSY', 'DEX'],
    );

    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX', 'PSY'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter', 'Slasher'],
        allowedCharacterIds: undefined,
        lockedCharacterIds: [],
        excludedCharacterIds: [],
      },
    );
    expect(result?.input.selectedClasses).toEqual(['Fighter', 'Slasher']);
    expect(result?.requestedInput.selectedClasses).toEqual(['Fighter', 'Slasher']);
    expect(result?.relaxation.usedFallback).toBe(false);
  });

  it('defaults to DEX when no types are provided', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    await service.buildTeam(['Fighter']);

    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter'],
        allowedCharacterIds: undefined,
        lockedCharacterIds: [],
        excludedCharacterIds: [],
      },
    );
  });

  it('keeps scoped auto-fill inside selected captain coverage while retaining the raw pool for fallback', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createCaptainCoveragePruneRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const progressSnapshots: AutoBuildProgressSnapshot[] = [];

    const result = await service.buildTeam(
      ['Fighter'],
      ['DEX'],
      {
        favoritesOnly: true,
        favoriteCharacterIds: [8300, 8301, 8302, 8303, 8304, 8305],
        manualSlots: createManualSlots({
          captain: [8300],
        }),
      },
      {
        onProgress: (snapshot) => progressSnapshots.push(snapshot),
      },
    );

    expect(result?.candidateCount).toBe(6);
    expect(result?.slots.some((slot) => slot.character.id === 8305)).toBe(false);
    expect(progressSnapshots.some((snapshot) => snapshot.candidateCount === 6)).toBe(true);
  });

  it('does not downgrade full captain coverage to simple coverage', async () => {
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createSimpleCaptainCoverageFallbackRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      requireFullCaptainAbilityCoverage: true,
      manualSlots: createManualSlots({
        captain: [8360],
        friendCaptain: [8360],
      }),
    });

    expect(result).toBeNull();
  });

  it('excludes candidates outside the selected captain standard boost scope in simple mode', () => {
    const service = new AutoTeamBuilderService({} as never);
    const pruned = service.resolveCaptainCoveredCandidateRecords(
      createCaptainCoveragePruneRecords(),
      {
        captainCharacterId: 8300,
        requireFullCaptainAbilityCoverage: false,
      },
    );

    expect(pruned.map((record) => record.id)).toEqual([8300, 8301, 8302, 8303, 8304]);
  });

  it('uses tier coverage for pool pruning without requiring team tag clauses per character', () => {
    const service = new AutoTeamBuilderService({} as never);
    const captain = createCharacterRecord({
      id: 8310,
      primaryClass: 'Fighter',
      type: 'DEX',
      detail: {
        captainAbility:
          'Boosts ATK of [DEX] characters by 5x and their HP by 1.3x, makes [DEX] orbs beneficial for [DEX] characters. If your crew has 4+ [Straw Hat Pirates] characters, reduces Despair duration by 10 turns.',
      },
    });
    const untaggedDexSub = createCharacterRecord({
      id: 8311,
      primaryClass: 'Fighter',
      type: 'DEX',
      detail: {
        specialText: 'Reduces Bind duration by 5 turns.',
      },
    });
    const simpleOnlySub = createCharacterRecord({
      id: 8312,
      primaryClass: 'Fighter',
      type: 'DEX',
      detail: {
        specialText: 'Reduces Paralysis duration by 5 turns.',
      },
    });
    const fullRiderCaptain = createCharacterRecord({
      id: 8313,
      primaryClass: 'Fighter',
      type: 'DEX',
      detail: {
        captainAbility:
          'Boosts ATK of [DEX] characters by 5x and their HP by 1.3x, makes [STR] orbs beneficial for [STR] characters.',
      },
    });

    const tagAwarePruned = service.resolveCaptainCoveredCandidateRecords(
      [captain, untaggedDexSub],
      {
        captainCharacterId: 8310,
        requireFullCaptainAbilityCoverage: true,
      },
    );
    const fullRiderPruned = service.resolveCaptainCoveredCandidateRecords(
      [fullRiderCaptain, simpleOnlySub],
      {
        captainCharacterId: 8313,
        requireFullCaptainAbilityCoverage: true,
      },
    );

    expect(tagAwarePruned.map((record) => record.id)).toEqual([8310, 8311]);
    expect(fullRiderPruned.map((record) => record.id)).toEqual([8313, 8312]);
  });

  it('intersects selected captain and friend captain coverage while retaining selected leaders', () => {
    const service = new AutoTeamBuilderService({} as never);
    const records = [
      createCharacterRecord({
        id: 8320,
        primaryClass: 'Fighter',
        type: 'DEX',
        detail: {
          captainAbility: 'Boosts ATK of [DEX] characters by 5x and their HP by 1.3x.',
        },
      }),
      createCharacterRecord({
        id: 8321,
        primaryClass: 'Slasher',
        type: 'PSY',
        detail: {
          captainAbility: 'Boosts ATK of Fighter characters by 5x and their HP by 1.3x.',
        },
      }),
      createCharacterRecord({
        id: 8322,
        primaryClass: 'Fighter',
        type: 'DEX',
        detail: {
          specialText: 'Reduces Bind duration by 5 turns.',
        },
      }),
      createCharacterRecord({
        id: 8323,
        primaryClass: 'Shooter',
        type: 'DEX',
        detail: {
          specialText: 'Reduces Despair duration by 5 turns.',
        },
      }),
      createCharacterRecord({
        id: 8324,
        primaryClass: 'Fighter',
        type: 'PSY',
        detail: {
          specialText: 'Reduces Paralysis duration by 5 turns.',
        },
      }),
    ];

    const pruned = service.resolveCaptainCoveredCandidateRecords(records, {
      captainCharacterId: 8320,
      friendCaptainCharacterId: 8321,
    });

    expect(pruned.map((record) => record.id)).toEqual([8320, 8321, 8322]);
  });

  it('retains the selected leader record even when its own captain scope is self-only', () => {
    const service = new AutoTeamBuilderService({} as never);
    const captain = createCharacterRecord({
      id: 8330,
      primaryClass: 'Fighter',
      type: 'DEX',
      detail: {
        captainAbility: 'Boosts ATK of this character by 6x.',
      },
    });
    const sub = createCharacterRecord({
      id: 8331,
      primaryClass: 'Fighter',
      type: 'DEX',
      detail: {
        specialText: 'Reduces Bind duration by 5 turns.',
      },
    });

    const pruned = service.resolveCaptainCoveredCandidateRecords([captain, sub], {
      captainCharacterId: 8330,
    });

    expect(pruned.map((record) => record.id)).toEqual([8330]);
  });

  it('prunes any-friend-captain auto-fill by the selected captain coverage', async () => {
    const coveredFriendCaptain = createCharacterRecord({
      id: 8350,
      name: 'Covered Friend Captain',
      primaryClass: 'Fighter',
      type: 'DEX',
      detail: {
        captainAbility: 'Boosts ATK of [DEX] characters by 5.25x and their HP by 1.3x.',
      },
    });
    const uncoveredNewestFriendCaptain = createCharacterRecord({
      id: 9999,
      name: 'Uncovered Friend Captain',
      primaryClass: 'Fighter',
      type: 'PSY',
      detail: {
        captainAbility: 'Boosts ATK of [PSY] characters by 5.25x and their HP by 1.3x.',
      },
    });
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValueOnce(createCaptainCoveragePruneRecords())
        .mockResolvedValueOnce([
          uncoveredNewestFriendCaptain,
          coveredFriendCaptain,
          createCaptainCoveragePruneRecords()[0]!,
        ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      allowAnyFriendCaptainAutoFill: true,
      manualSlots: createManualSlots({
        captain: [8300],
      }),
    });

    expect(result?.slots[1]?.character.id).toBe(8350);
    expect(result?.slots.some((slot) => slot.character.id === 9999)).toBe(false);
  });

  it('builds teams from favorites only when favorites mode is enabled', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const favoriteCharacterIds = [5925, 5926, 5880, 5870, 5860];

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      favoritesOnly: true,
      favoriteCharacterIds,
    });

    expect(result).not.toBeNull();
    expect(result?.input.favoritesOnly).toBe(true);
    expect(result?.slots.every((slot) => favoriteCharacterIds.includes(slot.character.id))).toBe(
      true,
    );
    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX', 'PSY'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter', 'Slasher'],
        allowedCharacterIds: favoriteCharacterIds,
        lockedCharacterIds: [],
        excludedCharacterIds: [],
      },
    );
  });

  it('builds teams only from candidate character ids when a box scope is provided', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const candidateCharacterIds = [5925, 5926, 5880, 5870, 5860];

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      candidateCharacterIds,
    });

    expect(result).not.toBeNull();
    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX', 'PSY'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter', 'Slasher'],
        allowedCharacterIds: candidateCharacterIds,
        lockedCharacterIds: [],
        excludedCharacterIds: [],
      },
    );
  });

  it('intersects candidate character ids with favorites when both scopes are enabled', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const sharedScopedIds = [5925, 5926, 5880, 5870, 5860];

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      candidateCharacterIds: [...sharedScopedIds, 9991],
      favoritesOnly: true,
      favoriteCharacterIds: [...sharedScopedIds, 9992],
    });

    expect(result).not.toBeNull();
    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX', 'PSY'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter', 'Slasher'],
        allowedCharacterIds: sharedScopedIds,
        lockedCharacterIds: [],
        excludedCharacterIds: [],
      },
    );
  });

  it('carries favorite ship filters into the result input and ship selection', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
      getShips: vi
        .fn()
        .mockResolvedValue([
          createShipRecord(9001, 'Ship 9001', 'Boosts ATK by 1.5x.'),
          createShipRecord(9002, 'Ship 9002', 'Boosts ATK by 1.6x.'),
        ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      favoriteShipsOnly: true,
      favoriteShipIds: [9002],
    });

    expect(result?.input.favoriteShipsOnly).toBe(true);
    expect(result?.input.favoriteShipIds).toEqual([9002]);
    expect(result?.requestedInput.favoriteShipIds).toEqual([9002]);
    expect(result?.shipSelection?.ship.id).toBe(9002);
  });

  it('returns null in favorites mode when no favorite candidate ids match', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      favoritesOnly: true,
      favoriteCharacterIds: [999_999],
    });

    expect(result).toBeNull();
    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX', 'PSY'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter', 'Slasher'],
        allowedCharacterIds: [999_999],
        lockedCharacterIds: [],
        excludedCharacterIds: [],
      },
    );
  });

  it('returns null when the selected character box scope is empty', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn(),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      candidateCharacterIds: [],
    });

    expect(result).toBeNull();
    expect(repository.getAutoBuilderCandidates).not.toHaveBeenCalled();
  });

  it('normalizes omitted constraints to false', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX']);

    expect(result?.input.requireAllSelectedTypesInTeam).toBe(false);
    expect(result?.input.requireAllSelectedClassesPerCharacter).toBe(false);
    expect(result?.input.requireUniqueBaseCharacterNames).toBe(false);
    expect(result?.input.favoritesOnly).toBe(false);
    expect(result?.input.favoriteShipsOnly).toBe(false);
    expect(result?.input.favoriteShipIds).toEqual([]);
    expect(result?.input.lockedCharacterIds).toEqual([]);
    expect(result?.requestedInput.lockedCharacterIds).toEqual([]);
    expect(result?.input.captainCharacterId).toBeNull();
    expect(result?.input.friendCaptainCharacterId).toBeNull();
  });

  it('keeps non-favorite manual picks while querying the auto-fill pool from favorites only', async () => {
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue([
          createCaptainRecord(),
          createUniversalCaptainRecord(),
          ...createStrictMixedTeamRecords(),
        ]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const favoriteCharacterIds = [5905, 5926, 5880, 5870, 5860];

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      favoritesOnly: true,
      favoriteCharacterIds,
      manualSlots: createManualSlots({
        captain: [5925],
        sub1: [5900],
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 5925)).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 5900)).toBe(true);
    expect(
      result?.slots
        .filter((slot) => ![5925, 5900].includes(slot.character.id))
        .every((slot) => favoriteCharacterIds.includes(slot.character.id)),
    ).toBe(true);
    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX', 'PSY'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter', 'Slasher'],
        allowedCharacterIds: favoriteCharacterIds,
        lockedCharacterIds: [5925, 5900],
        excludedCharacterIds: [],
      },
    );
  });

  it('does not reuse a non-favorite manual friend captain as an auto-filled favorite-mode captain', async () => {
    const favoriteCharacterIds = [5900, 5890, 5880, 5870, 5860];
    const manualFriendCaptain = createLeaderPriorityCaptainRecord({
      id: 9000,
      name: 'Manual Non-Favorite Friend Captain',
      cost: 60,
      atkMultiplier: 6,
      universal: true,
    });
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue([manualFriendCaptain, ...createSingleTypeRecords()]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      favoritesOnly: true,
      favoriteCharacterIds,
      manualSlots: createManualSlots({
        friendCaptain: [9000],
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.role).toBe('captain');
    expect(result?.slots[0]?.character.id).toBe(5900);
    expect(result?.slots[1]?.role).toBe('friendCaptain');
    expect(result?.slots[1]?.character.id).toBe(9000);
    expect(
      result?.slots
        .filter((slot) => slot.role !== 'friendCaptain')
        .every((slot) => favoriteCharacterIds.includes(slot.character.id)),
    ).toBe(true);
    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter'],
        allowedCharacterIds: favoriteCharacterIds,
        lockedCharacterIds: [9000],
        excludedCharacterIds: [],
      },
    );
  });

  it('applies cost range to auto-filled characters while allowing out-of-range manual slots', async () => {
    const manualHighCostSub = createCharacterRecord({
      id: 9001,
      name: 'Manual High Cost Utility',
      cost: 99,
      primaryClass: 'Fighter',
      detail: {
        specialText: 'Reduces Bind duration by 5 turns.',
      },
    });
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue([manualHighCostSub, ...createSingleTypeRecords()]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      costRange: { min: 1, max: 60 },
      manualSlots: createManualSlots({
        sub1: [9001],
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 9001)).toBe(true);
    expect(
      result?.slots
        .filter((slot) => slot.character.id !== 9001)
        .every((slot) => slot.character.cost >= 1 && slot.character.cost <= 60),
    ).toBe(true);
    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter'],
        allowedCharacterIds: undefined,
        lockedCharacterIds: [9001],
        excludedCharacterIds: [],
      },
    );
  });

  it('returns no result when cost range excludes every auto-fill candidate', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      costRange: { min: 1, max: 10 },
    });

    expect(result).toBeNull();
    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter'],
        allowedCharacterIds: undefined,
        lockedCharacterIds: [],
        excludedCharacterIds: [],
      },
    );
  });

  it('applies leader cost range only to auto-filled leaders', async () => {
    const outOfRangeNewestLeader = createCharacterRecord({
      id: 9999,
      name: 'Out of Range Newest Leader',
      cost: 99,
      primaryClass: 'Fighter',
      detail: {
        captainAbility:
          'Boosts ATK of DEX and Fighter characters by 5.5x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
        specialText: 'Boosts orb effects of DEX and Fighter characters by 2.25x for 1 turn.',
      },
    });
    const highCostSubs = [
      createAtkSubRecord(),
      createAffinitySubRecord(),
      createUtilitySubRecord(),
      createConsistencySubRecord(),
    ].map((record) => ({ ...record, cost: 99 }));
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue([outOfRangeNewestLeader, createCaptainRecord(), ...highCostSubs]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      leaderCostRange: { min: 1, max: 60 },
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(5900);
    expect(result?.slots[1]?.character.id).toBe(5900);
    expect(
      result?.slots.filter((slot) => slot.role === 'sub').some((slot) => slot.character.cost > 60),
    ).toBe(true);
  });

  it('selects the newest eligible favorite as the preferred auto-filled leader', async () => {
    const newestFavoriteLeader = createLeaderPriorityCaptainRecord({
      id: 4556,
      name: 'Portgas D. Ace - The Man Who Came for an Emperor of the Sea',
      cost: 55,
      atkMultiplier: 5.5,
      hpMultiplier: 1.4,
      universal: true,
    });
    const olderFavoriteLeader = createLeaderPriorityCaptainRecord({
      id: 4549,
      name: 'Eustass "Captain" Kid - Aimed Damned Punk',
      cost: 65,
      atkMultiplier: 5.5,
      hpMultiplier: 1.4,
      universal: true,
    });
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue([
          newestFavoriteLeader,
          olderFavoriteLeader,
          createAtkSubRecord(),
          createAffinitySubRecord(),
          createUtilitySubRecord(),
          createConsistencySubRecord(),
        ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      favoritesOnly: true,
      favoriteCharacterIds: [4556, 4549, 5890, 5880, 5870, 5860],
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(4556);
    expect(result?.slots[1]?.character.id).toBe(4556);
  });

  it('keeps excluded newest favorites out and does not promote older higher-boost leaders', async () => {
    const excludedNewestLeader = createLeaderPriorityCaptainRecord({
      id: 4306,
      name: 'Bartholomew Kuma - Selfless Impulse',
      cost: 65,
      atkMultiplier: 6,
      hpMultiplier: 1.6,
      universal: true,
    });
    const newestEligibleLeader = createLeaderPriorityCaptainRecord({
      id: 4302,
      name: 'Belo Betty - Welcoming Army Captain',
      cost: 55,
      atkMultiplier: 4.25,
      hpMultiplier: 1,
      universal: true,
    });
    const olderHigherBoostLeader = createLeaderPriorityCaptainRecord({
      id: 4233,
      name: 'Dorry & Broggy - Retaliating Against the Threat to the Homeland',
      cost: 65,
      atkMultiplier: 5.5,
      hpMultiplier: 1.6,
      universal: true,
    });
    const records = [
      excludedNewestLeader,
      newestEligibleLeader,
      olderHigherBoostLeader,
      createAtkSubRecord(),
      createAffinitySubRecord(),
      createUtilitySubRecord(),
      createConsistencySubRecord(),
    ];
    const favoriteCharacterIds = records.map((record) => record.id);
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockImplementation(async (_types, _limit, query) => {
        const allowedIds = Array.isArray(query?.allowedCharacterIds)
          ? new Set<number>(query.allowedCharacterIds)
          : null;
        const excludedIds = new Set<number>(query?.excludedCharacterIds ?? []);

        return records.filter(
          (record) => (!allowedIds || allowedIds.has(record.id)) && !excludedIds.has(record.id),
        );
      }),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      favoritesOnly: true,
      favoriteCharacterIds,
      excludedCharacterIds: [4306],
      leaderBoostFilters: ['ATK'],
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(4302);
    expect(result?.slots[1]?.character.id).toBe(4302);
    expect(result?.slots.some((slot) => slot.character.id === 4306)).toBe(false);
    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter'],
        allowedCharacterIds: favoriteCharacterIds,
        lockedCharacterIds: [],
        excludedCharacterIds: [4306],
      },
    );
  });

  it('preselects preferred leader ids by newest eligible favorites before applying the limit', () => {
    const leaders = [
      createLeaderPriorityCaptainRecord({
        id: 4311,
        name: 'Newest Low Boost Leader',
        cost: 55,
        atkMultiplier: 4.25,
        hpMultiplier: 1.1,
        universal: true,
      }),
      ...[4310, 4309, 4308, 4307, 4306, 4302, 4301, 4300].map((id) =>
        createLeaderPriorityCaptainRecord({
          id,
          name: `Eligible Favorite Leader ${id}`,
          cost: 55,
          atkMultiplier: 4.25,
          hpMultiplier: 1.1,
          universal: true,
        }),
      ),
      createLeaderPriorityCaptainRecord({
        id: 4233,
        name: 'Older Higher Boost Leader',
        cost: 65,
        atkMultiplier: 6.5,
        hpMultiplier: 1.8,
        universal: true,
      }),
      createCharacterRecord({
        id: 9999,
        name: 'Newest Non-Leader Favorite',
        primaryClass: 'Fighter',
        detail: {
          specialText: 'Boosts ATK of Fighter characters by 2.5x for 1 turn.',
        },
      }),
    ];
    const allowedCharacterIds = leaders
      .map((record) => record.id)
      .filter((characterId) => characterId !== 4306);
    const service = new AutoTeamBuilderService({} as never);
    const resolver = service as unknown as PreferredLeaderAutoFillResolver;

    const rankedIds = resolver.resolvePreferredLeaderAutoFillCharacterIds(
      leaders,
      allowedCharacterIds,
      createInput(['DEX'], ['Fighter'], {
        leaderBoostFilters: ['ATK'],
      }),
    );

    expect(rankedIds).toEqual([4311, 4310, 4309, 4308, 4307, 4302, 4301, 4300]);
    expect(rankedIds).not.toContain(4306);
    expect(rankedIds).not.toContain(4233);
    expect(rankedIds).not.toContain(9999);
  });

  it('prioritizes auto-filled leaders that match selected Captain Ability effects', async () => {
    const newestFavoriteLeader = createLeaderPriorityCaptainRecord({
      id: 4556,
      name: 'Newer Generic Leader',
      cost: 55,
      atkMultiplier: 5.5,
      hpMultiplier: 1.4,
      universal: true,
    });
    const captainEffectLeader = createLeaderPriorityCaptainRecord({
      id: 4549,
      name: 'Older Captain Effect Leader',
      cost: 65,
      atkMultiplier: 5.5,
      hpMultiplier: 1.4,
      universal: true,
    });
    captainEffectLeader.detail.builderAbilities = [
      createBuilderAbility('remove_bind', 'Remove Bind', 5, 'captainAbility'),
    ];
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue([
          newestFavoriteLeader,
          captainEffectLeader,
          createAtkSubRecord(),
          createAffinitySubRecord(),
          createUtilitySubRecord(),
          createConsistencySubRecord(),
        ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      favoritesOnly: true,
      favoriteCharacterIds: [4556, 4549, 5890, 5880, 5870, 5860],
      requiredAbilities: [
        {
          abilityKey: 'remove_bind',
          minTurns: 5,
          slotTokens: [],
          requiredCharacterCount: 1,
          slotScope: 'leader',
          sourceScope: 'captainAbility',
        },
      ],
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(4549);
    expect(result?.slots[1]?.character.id).toBe(4549);
  });

  it('selects the newest eligible favorite inside the leader cost range', async () => {
    const newestFavoriteLeader = createLeaderPriorityCaptainRecord({
      id: 4556,
      name: 'Portgas D. Ace - The Man Who Came for an Emperor of the Sea',
      cost: 55,
      atkMultiplier: 5.5,
      hpMultiplier: 1.4,
      universal: true,
    });
    const costEligibleFavoriteLeader = createLeaderPriorityCaptainRecord({
      id: 4549,
      name: 'Eustass "Captain" Kid - Aimed Damned Punk',
      cost: 65,
      atkMultiplier: 5.5,
      hpMultiplier: 1.4,
      universal: true,
    });
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue([
          newestFavoriteLeader,
          costEligibleFavoriteLeader,
          createAtkSubRecord(),
          createAffinitySubRecord(),
          createUtilitySubRecord(),
          createConsistencySubRecord(),
        ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      favoritesOnly: true,
      favoriteCharacterIds: [4556, 4549, 5890, 5880, 5870, 5860],
      leaderCostRange: { min: 65, max: null },
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(4549);
    expect(result?.slots[1]?.character.id).toBe(4549);
  });

  it('applies sub cost range only to auto-filled subs', async () => {
    const highCostCaptain = { ...createCaptainRecord(), cost: 99 };
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue([highCostCaptain, ...createSingleTypeRecords().slice(1)]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      subCostRange: { min: 1, max: 60 },
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.cost).toBe(99);
    expect(result?.slots[1]?.character.cost).toBe(99);
    expect(
      result?.slots
        .filter((slot) => slot.role === 'sub')
        .every((slot) => slot.character.cost >= 1 && slot.character.cost <= 60),
    ).toBe(true);
  });

  it('allows a non-favorite auto-filled friend captain while keeping favorites for other slots', async () => {
    const favoriteCharacterIds = [5900, 5890, 5880, 5870, 5860];
    const broadFriendCaptain = createLeaderPriorityCaptainRecord({
      id: 9000,
      name: 'Broad Friend Captain',
      cost: 60,
      atkMultiplier: 6,
      universal: true,
    });
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValueOnce(createSingleTypeRecords())
        .mockResolvedValueOnce([broadFriendCaptain, ...createSingleTypeRecords()]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      favoritesOnly: true,
      allowAnyFriendCaptainAutoFill: true,
      favoriteCharacterIds,
    });

    expect(result).not.toBeNull();
    expect(result?.slots[1]?.role).toBe('friendCaptain');
    expect(result?.slots[1]?.character.id).toBe(9000);
    expect(
      result?.slots
        .filter((slot) => slot.role !== 'friendCaptain')
        .every((slot) => favoriteCharacterIds.includes(slot.character.id)),
    ).toBe(true);
    expect(repository.getAutoBuilderCandidates).toHaveBeenNthCalledWith(
      1,
      ['DEX'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter'],
        allowedCharacterIds: favoriteCharacterIds,
        lockedCharacterIds: [],
        excludedCharacterIds: [],
      },
    );
    expect(repository.getAutoBuilderCandidates).toHaveBeenNthCalledWith(
      2,
      ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
      null,
      {
        lockedCharacterIds: [],
        excludedCharacterIds: [],
      },
    );
  });

  it('does not broaden friend captain candidates when Friend Captain is manually selected', async () => {
    const favoriteCharacterIds = [5900, 5890, 5880, 5870, 5860];
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      favoritesOnly: true,
      allowAnyFriendCaptainAutoFill: true,
      favoriteCharacterIds,
      manualSlots: createManualSlots({
        friendCaptain: [5900],
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots[1]?.character.id).toBe(5900);
    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledTimes(1);
  });

  it('keeps manual picks outside the selected character box while querying auto-fill from the box scope', async () => {
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue([
          createCaptainRecord(),
          createUniversalCaptainRecord(),
          ...createStrictMixedTeamRecords(),
        ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      candidateCharacterIds: [5905, 5926, 5880, 5870],
      manualSlots: createManualSlots({
        captain: [5925],
        sub1: [5900],
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 5925)).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 5900)).toBe(true);
    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX', 'PSY'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter', 'Slasher'],
        allowedCharacterIds: [5905, 5926, 5880, 5870],
        lockedCharacterIds: [5925, 5900],
        excludedCharacterIds: [],
      },
    );
  });

  it('normalizes and deduplicates locked ids before building', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      lockedCharacterIds: [5925, 5925, 5926, 0, -1],
      captainCharacterId: 5925,
    });

    expect(result?.input.lockedCharacterIds).toEqual([5925, 5926]);
  });

  it('normalizes a single selected leader into both captain ids', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      lockedCharacterIds: [5925],
      captainCharacterId: 5925,
    });

    expect(result?.input.captainCharacterId).toBe(5925);
    expect(result?.input.friendCaptainCharacterId).toBe(5925);
  });

  it('derives legacy leader ids from slot-based manual selections and preserves cross-slot OR picks', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      manualSlots: createManualSlots({
        captain: [5925, 5926],
        friendCaptain: [5925],
        sub1: [5926, 5880],
        sub2: [5880, 5870],
      }),
    });

    expect(result?.input.manualSlots).toEqual(
      createManualSlots({
        captain: [5925, 5926],
        friendCaptain: [5925],
        sub1: [5926, 5880],
        sub2: [5880, 5870],
      }),
    );
    expect(result?.input.lockedCharacterIds).toEqual([5925, 5926, 5880, 5870]);
    expect(result?.input.captainCharacterId).toBe(5925);
    expect(result?.input.friendCaptainCharacterId).toBe(5925);
    const nonFriendSlotIds =
      result?.slots
        .filter((slot) => slot.role !== 'friendCaptain')
        .map((slot) => slot.character.id) ?? [];
    expect(new Set(nonFriendSlotIds).size).toBe(nonFriendSlotIds.length);
  });

  it('prefers slot-based manual selections over legacy locked ids when both are provided', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      manualSlots: createManualSlots({
        captain: [5925],
        sub1: [5880],
      }),
      lockedCharacterIds: [5900],
      captainCharacterId: 5900,
      friendCaptainCharacterId: 5900,
    });

    expect(result?.input.manualSlots).toEqual(
      createManualSlots({
        captain: [5925],
        sub1: [5880],
      }),
    );
    expect(result?.input.lockedCharacterIds).toEqual([5925, 5880]);
    expect(result?.input.captainCharacterId).toBe(5925);
    expect(result?.input.friendCaptainCharacterId).toBe(5925);
  });

  it('auto-fills a manual slot when all OR picks are missing from the candidate pool', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      manualSlots: createManualSlots({
        sub1: [999991, 999992, 999993, 999994, 999995],
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots).toHaveLength(6);
    expect(
      result?.slots.some((slot) =>
        [999991, 999992, 999993, 999994, 999995].includes(slot.character.id),
      ),
    ).toBe(false);
  });

  it('relaxes only the manual slot that cannot be filled while preserving another manual slot', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      manualSlots: createManualSlots({
        sub1: [999991, 999992, 999993, 999994, 999995],
        sub2: [5880],
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots[3]?.character.id).toBe(5880);
    expect(result?.slots[3]?.reasonChips).toContain('Manual pick');
  });

  it('prefers a usable manual sub pick before auto-filling that slot', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      manualSlots: createManualSlots({
        sub1: [5860],
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots[2]?.character.id).toBe(5860);
    expect(result?.slots[2]?.reasonChips).toContain('Manual pick');
  });

  it('keeps a required manual captain in the captain slot', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createDualLeaderMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      manualSlots: createManualSlots(
        {
          captain: [5927, 5925],
          friendCaptain: [5925],
        },
        {
          captain: 5925,
        },
      ),
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(5925);
    expect(result?.input.manualSlots.find((slot) => slot.role === 'captain')).toMatchObject({
      characterIds: [5927, 5925],
      requiredCharacterId: 5925,
    });
  });

  it('keeps a required manual friend captain in the friend captain slot', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createDualLeaderMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      manualSlots: createManualSlots(
        {
          captain: [5925],
          friendCaptain: [5925, 5927],
        },
        {
          friendCaptain: 5927,
        },
      ),
    });

    expect(result).not.toBeNull();
    expect(result?.slots[1]?.character.id).toBe(5927);
  });

  it('keeps #1 Monkey D. Luffy as both required manual leaders', async () => {
    const noCaptainLeader = loadGeneratedCharacterRecord(1);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue([noCaptainLeader, ...createDualLeaderMixedTeamRecords()]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [noCaptainLeader.id],
            friendCaptain: [noCaptainLeader.id],
          },
          {
            captain: noCaptainLeader.id,
            friendCaptain: noCaptainLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(noCaptainLeader.id);
    expect(result?.slots[1]?.character.id).toBe(noCaptainLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #2 Monkey D. Luffy - Gum-Gum Pistol as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(2);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue([requiredLeader, ...createDualLeaderMixedTeamRecords()]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #3 Monkey D. Luffy - Gum-Gum Bazooka as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(3);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue([requiredLeader, ...createDualLeaderMixedTeamRecords()]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #4 Monkey D. Luffy - Gear 2 as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(4);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #5 Roronoa Zoro as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(5);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #6 Roronoa Zoro - Three Thousand Worlds as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(6);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #7 Roronoa Zoro - Pound Phoenix as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(7);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #8 Roronoa Zoro - Ashura Ichibugin as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(8);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #9 Nami as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(9);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #10 Nami - Tornado Tempo as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(10);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #11 Nami - Mirage Tempo as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(11);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #12 Nami - Thunderbolt Tempo as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(12);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #13 Usopp as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(13);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #14 Usopp - Tabasco Star as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(14);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #15 Usopp - Usopp Golden Pound as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(15);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #16 Sogeking as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(16);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #17 Sanji as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(17);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #18 Sanji - Plastic Surgery Shot as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(18);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #19 Chef Sanji - Hot Rock Stew as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(19);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #20 Sanji - Diable Jambe as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(20);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #21 Tony Tony Chopper as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(21);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #22 Tony Tony Chopper - Heavy Point as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(22);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #23 Tony Tony Chopper - Brain Point as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(23);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #24 Tony Tony Chopper - Arm Point as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(24);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #25 Tony Tony Chopper - Horn Point as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(25);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #26 Tony Tony Chopper - Guard Point as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(26);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #27 Higuma as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(27);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #28 Master of the Near Sea as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(28);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #29 Iron-Mace Alvida as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(29);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #30 Iron-Mace Alvida - Smooth-Smooth Fruit as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(30);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #31 Coby as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(31);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #32 Cabin Boy Coby as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(32);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #33 Helmeppo as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(33);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #34 Cabin Boy Helmeppo as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(34);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #35 Axe-Hand Morgan as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(35);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #36 Mohji & Richie as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(36);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #37 Cabaji the Acrobat as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(37);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #38 Buggy as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(38);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #39 Buggy the Clown as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(39);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #40 Gaimon as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(40);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #41 Siam as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(41);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #42 Butchie as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(42);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #43 One-Two Django as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(43);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #44 Dancing Django as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(44);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #45 Captain Kuro as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(45);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #46 Kuro of a Hundred Plans as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(46);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #47 Yosaku as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(47);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #48 Johnny as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(48);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #49 Iron Fist Fullbody as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(49);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #50 Patty as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(50);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #51 Carne as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(51);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #52 Chef Zeff as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(52);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #53 Gin as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(53);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #54 Gin the Man-Demon as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(54);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #55 Pearl as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(55);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #56 Fire Pearl as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(56);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #57 Don Krieg as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(57);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #58 Don Krieg - Poison Gas Bomb MH5 as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(58);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #59 Nezumi as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(59);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #60 Momoo as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(60);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #61 Choo as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(61);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #62 Kuroobi as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(62);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #63 Hatchan as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(63);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #64 Six-Sword Hachi as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(64);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #65 Arlong as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(65);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #66 Enraged Arlong - Shark On Tooth as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(66);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #67 Tashigi as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(67);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #68 Tashigi - Navy HQ Ensign as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(68);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #69 Smoker as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(69);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #70 Smoker the White Hunter as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(70);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #71 Miss Wednesday as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(71);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #72 Nefeltari Vivi as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(72);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #73 Princess Vivi as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(73);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #74 Portgas D. Ace as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(74);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #75 Portgas D. Ace - Flame Mirror as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(75);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #76 Shanks as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(76);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #77 Red-Haired Shanks as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(77);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #78 Red Robber Penguin as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(78);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #79 Blue Robber Penguin as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(79);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #80 Green Robber Penguin as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(80);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #81 Yellow Robber Penguin as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(81);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #82 Black Robber Penguin as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(82);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #83 Rainbow Robber Penguin as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(83);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #84 Red Pirate Penguin as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(84);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #85 Blue Pirate Penguin as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(85);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #86 Green Pirate Penguin as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(86);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #87 Yellow Pirate Penguin as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(87);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #88 Black Pirate Penguin as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(88);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #89 Red Hermit Crab as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(89);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #90 Blue Hermit Crab as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(90);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #91 Green Hermit Crab as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(91);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #92 Yellow Hermit Crab as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(92);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #93 Black Hermit Crab as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(93);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #94 Rainbow Hermit Crab as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(94);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #95 Red Armored Crab as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(95);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #96 Blue Armored Crab as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(96);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #97 Green Armored Crab as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(97);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #98 Yellow Armored Crab as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(98);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #99 Black Armored Crab as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(99);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #100 Red Striped Dragon as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(100);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #101 Blue Striped Dragon as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(101);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #102 Green Striped Dragon as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(102);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #103 Yellow Striped Dragon as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(103);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #104 Black Striped Dragon as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(104);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #105 Red Treasure Turtle as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(105);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #106 Blue Treasure Turtle as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(106);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #107 Green Treasure Turtle as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(107);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #108 Yellow Treasure Turtle as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(108);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #109 Black Treasure Turtle as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(109);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #110 Red Daimyo Turtle as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(110);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #111 Blue Daimyo Turtle as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(111);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #112 Green Daimyo Turtle as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(112);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #113 Yellow Daimyo Turtle as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(113);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #114 Black Daimyo Turtle as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(114);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #115 Sea Pony as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(115);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #116 Sea Colt as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(116);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #117 Sea Horse as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(117);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #118 Sea Stallion as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(118);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #119 Sword Bandit as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(119);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #120 Pistol Bandit as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(120);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #121 Fighter Group Cabin Boy - Red Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(121);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #122 Fighter Group Cabin Boy - Blue Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(122);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #123 Fighter Group Cabin Boy - Green Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(123);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #124 Fighter Group Cabin Boy - Yellow Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(124);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #125 Fighter Group Cabin Boy - Black Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(125);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #126 Slasher Group Cabin Boy - Red Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(126);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #127 Slasher Group Cabin Boy - Blue Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(127);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #128 Slasher Group Cabin Boy - Green Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(128);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #129 Slasher Group Cabin Boy - Yellow Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(129);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #130 Slasher Group Cabin Boy - Black Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(130);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #131 Striker Group Cabin Boy - Red Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(131);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #132 Striker Group Cabin Boy - Blue Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(132);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #133 Striker Group Cabin Boy - Green Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(133);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #134 Striker Group Cabin Boy - Yellow Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(134);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #135 Striker Group Cabin Boy - Black Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(135);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #136 Shooter Group Cabin Boy - Red Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(136);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #137 Shooter Group Cabin Boy - Blue Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(137);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #138 Shooter Group Cabin Boy - Green Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(138);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #139 Shooter Group Cabin Boy - Yellow Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(139);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #140 Shooter Group Cabin Boy - Black Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(140);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #141 Cannoneer Cabin Boy as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(141);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #142 Fighter Group Crew - Red Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(142);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #143 Fighter Group Crew - Blue Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(143);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #144 Fighter Group Crew - Green Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(144);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #145 Fighter Group Crew - Yellow Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(145);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #146 Fighter Group Crew - Black Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(146);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #147 Slasher Group Crew - Red Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(147);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #148 Slasher Group Crew - Blue Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(148);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #149 Slasher Group Crew - Green Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(149);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #150 Slasher Group Crew - Yellow Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(150);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #151 Slasher Group Crew - Black Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(151);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #152 Striker Group Crew - Red Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(152);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #153 Striker Group Crew - Blue Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(153);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #154 Striker Group Crew - Green Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(154);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #155 Striker Group Crew - Yellow Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(155);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #156 Striker Group Crew - Black Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(156);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #157 Shooter Group Crew - Red Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(157);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #158 Shooter Group Crew - Blue Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(158);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #159 Shooter Group Crew - Green Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(159);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #160 Shooter Group Crew - Yellow Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(160);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #161 Shooter Group Crew - Black Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(161);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #162 Cannoneer Skilled as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(162);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it("keeps #163 Bodyguard, 'Sunglasses' as both required manual leaders", async () => {
    const requiredLeader = loadGeneratedCharacterRecord(163);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #164 Bearded Bodyguard as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(164);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #165 Knuckle Punk - Black Cat Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(165);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #166 Saber Punk - Black Cat Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(166);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #167 Halberd Punk - Black Cat Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(167);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #168 Pistol Punk - Black Cat Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(168);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #169 Cannoneer Punk - Black Cat Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(169);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #170 Fighter Group Leader as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(170);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #171 Slasher Group Leader as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(171);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #172 Striker Group Leader as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(172);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #173 Shooter Group Leader as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(173);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #174 Assassin Master as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(174);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #175 Karate Fishman - Arlong crewmember as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(175);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #176 Sword Fishman - Arlong crewmember as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(176);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #177 Spear Fishman - Arlong crewmember as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(177);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #178 Pistol Fishman - Arlong crewmember as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(178);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #179 Knuckle Apprentice - Navy as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(179);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #180 Saber Apprentice - Navy as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(180);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #181 Halberd Apprentice - Navy as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(181);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #182 Pistol Apprentice - Navy as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(182);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #183 Cannoneer Apprentice - Navy as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(183);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #184 Knuckle Seaman - Navy as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(184);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #185 Saber Seaman - Navy as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(185);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #186 Halberd Seaman - Navy as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(186);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #187 Pistol Seaman - Navy as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(187);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #188 Cannoneer Seaman - Navy as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(188);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 188,
      name: 'Cannoneer Seaman - Navy',
      type: 'INT',
      primaryClass: 'Shooter',
      cost: 10,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #189 Red Elder Turtle as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(189);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 189,
      name: 'Red Elder Turtle',
      type: 'STR',
      primaryClass: 'Booster',
      cost: 4,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #190 Blue Elder Turtle as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(190);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 190,
      name: 'Blue Elder Turtle',
      type: 'QCK',
      primaryClass: 'Booster',
      cost: 4,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #191 Green Elder Turtle as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(191);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 191,
      name: 'Green Elder Turtle',
      type: 'DEX',
      primaryClass: 'Booster',
      cost: 4,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #192 Yellow Elder Turtle as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(192);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 192,
      name: 'Yellow Elder Turtle',
      type: 'PSY',
      primaryClass: 'Booster',
      cost: 4,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #193 Black Elder Turtle as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(193);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 193,
      name: 'Black Elder Turtle',
      type: 'INT',
      primaryClass: 'Booster',
      cost: 4,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #194 Knuckle Ensign - Navy HQ as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(194);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 194,
      name: 'Knuckle Ensign - Navy HQ',
      type: 'STR',
      primaryClass: 'Fighter',
      cost: 9,
      captainHpBoost: 0,
      captainAtkBoost: 1.5,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts ATK of [STR] characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #195 Saber Ensign - Navy HQ as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(195);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 195,
      name: 'Saber Ensign - Navy HQ',
      type: 'DEX',
      primaryClass: 'Slasher',
      cost: 9,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Boosts RCV of [DEX] characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #196 Halberd Ensign - Navy HQ as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(196);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 196,
      name: 'Halberd Ensign - Navy HQ',
      type: 'QCK',
      primaryClass: 'Striker',
      cost: 9,
      captainHpBoost: 0,
      captainAtkBoost: 1.5,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts ATK of [QCK] characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #197 Pistol Ensign - Navy HQ as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(197);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 197,
      name: 'Pistol Ensign - Navy HQ',
      type: 'PSY',
      primaryClass: 'Shooter',
      cost: 9,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Reduces damage received from [PSY] enemies by 20%',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #198 Bazooka Ensign - Navy HQ as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(198);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 198,
      name: 'Bazooka Ensign - Navy HQ',
      type: 'INT',
      primaryClass: 'Shooter',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 1.5,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts ATK of Shooter characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #199 Mr. 5 - Nez-Palm Cannon as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(199);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 199,
      name: 'Mr. 5 - Nez-Palm Cannon',
      type: 'STR',
      primaryClass: 'Fighter',
      cost: 11,
      captainHpBoost: 0,
      captainAtkBoost: 1.5,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts ATK of [STR] characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #200 Mr. 5 - Breeze Breath Bomb as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(200);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 200,
      name: 'Mr. 5 - Breeze Breath Bomb',
      type: 'STR',
      primaryClass: 'Shooter',
      cost: 15,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of [STR] characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #201 Miss Valentine as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(201);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 201,
      name: 'Miss Valentine',
      type: 'QCK',
      primaryClass: 'Fighter',
      cost: 11,
      captainHpBoost: 1.5,
      captainAtkBoost: 0,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts HP of Fighter characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #202 Miss Valentine - 10,000 Kill-O-Guillotine as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(202);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 202,
      name: 'Miss Valentine - 10,000 Kill-O-Guillotine',
      type: 'QCK',
      primaryClass: 'Fighter',
      cost: 15,
      captainHpBoost: 2,
      captainAtkBoost: 0,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts HP of Fighter characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #203 Mr. 3 as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(203);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 203,
      name: 'Mr. 3',
      type: 'INT',
      primaryClass: 'Slasher',
      secondaryClass: 'Cerebral',
      cost: 11,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Reduces damage received from [INT] enemies by 10%',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #204 Mr. 3 - Extra Special Candelabra as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(204);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 204,
      name: 'Mr. 3 - Extra Special Candelabra',
      type: 'INT',
      primaryClass: 'Slasher',
      secondaryClass: 'Cerebral',
      cost: 15,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Reduces damage received from [INT] enemies by 10%',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #205 Miss Goldenweek as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(205);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 205,
      name: 'Miss Goldenweek',
      type: 'DEX',
      primaryClass: 'Striker',
      secondaryClass: 'Free Spirit',
      cost: 11,
      captainHpBoost: 1.2,
      captainAtkBoost: 0,
      captainAverageBoost: 0.6,
      detail: {
        captainAbility: 'Boosts HP and RCV of [DEX] characters by 1.2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #206 Miss Goldenweek - Colors Trap: Calming Green as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(206);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 206,
      name: 'Miss Goldenweek - Colors Trap: Calming Green',
      type: 'DEX',
      primaryClass: 'Striker',
      secondaryClass: 'Free Spirit',
      cost: 15,
      captainHpBoost: 1.2,
      captainAtkBoost: 0,
      captainAverageBoost: 0.6,
      detail: {
        captainAbility: 'Boosts HP and RCV of [DEX] characters by 1.2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #207 Mr. 2 Bon Clay as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(207);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 207,
      name: 'Mr. 2 Bon Clay',
      type: 'PSY',
      primaryClass: 'Fighter',
      secondaryClass: 'Free Spirit',
      cost: 11,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Reduces damage received from [PSY] enemies by 10%',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #208 Mr. 2 Bon Clay - Bombardier Arabesque as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(208);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 208,
      name: 'Mr. 2 Bon Clay - Bombardier Arabesque',
      type: 'PSY',
      primaryClass: 'Fighter',
      secondaryClass: 'Free Spirit',
      cost: 15,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Reduces damage received from [PSY] enemies by 20%',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #209 Miss All Sunday - Baroque Works VP as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(209);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 209,
      name: 'Miss All Sunday - Baroque Works VP',
      type: 'INT',
      primaryClass: 'Fighter',
      secondaryClass: 'Cerebral',
      cost: 15,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Boosts RCV of [INT] characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #210 Nico Robin as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(210);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 210,
      name: 'Nico Robin',
      type: 'INT',
      primaryClass: 'Fighter',
      secondaryClass: 'Cerebral',
      cost: 20,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Boosts RCV of [INT] characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #211 Mr. 9 as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(211);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 211,
      name: 'Mr. 9',
      type: 'QCK',
      primaryClass: 'Striker',
      cost: 10,
      captainHpBoost: 0,
      captainAtkBoost: 1.2,
      captainAverageBoost: 0.6,
      detail: {
        captainAbility: 'Boosts ATK of Striker characters by 1.2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #212 Mr. 9 - Hot Blooded Bat as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(212);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 212,
      name: 'Mr. 9 - Hot Blooded Bat',
      type: 'QCK',
      primaryClass: 'Striker',
      cost: 13,
      captainHpBoost: 0,
      captainAtkBoost: 1.5,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts ATK of Striker characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #213 Laboon as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(213);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 213,
      name: 'Laboon',
      type: 'STR',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Protects from defeat as long as HP is above 50%',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it("keeps #214 Laboon - (Luffy's drawing) as both required manual leaders", async () => {
    const requiredLeader = loadGeneratedCharacterRecord(214);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 214,
      name: "Laboon - (Luffy's drawing)",
      type: 'STR',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      cost: 22,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Protects from defeat as long as HP is above 50%',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #215 Neptunian Squid as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(215);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 215,
      name: 'Neptunian Squid',
      type: 'DEX',
      primaryClass: 'Striker',
      cost: 18,
      captainHpBoost: 1.5,
      captainAtkBoost: 0,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts HP of Striker characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #216 Monkey D. Luffy - Gum-Gum Balloon as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(216);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 216,
      name: 'Monkey D. Luffy - Gum-Gum Balloon',
      type: 'STR',
      primaryClass: 'Fighter',
      secondaryClass: 'Free Spirit',
      cost: 15,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Reduces damage received by 20%',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #217 Monkey D. Luffy - Gear Third as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(217);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 217,
      name: 'Monkey D. Luffy - Gear Third',
      type: 'STR',
      primaryClass: 'Fighter',
      secondaryClass: 'Free Spirit',
      cost: 22,
      captainHpBoost: 0,
      captainAtkBoost: 3.5,
      captainAverageBoost: 1.75,
      detail: {
        captainAbility: 'Boosts ATK of all characters by 3.5x after scoring 3 PERFECTs in a row',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #218 Roronoa Zoro - Streaming Wolf Swords as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(218);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 218,
      name: 'Roronoa Zoro - Streaming Wolf Swords',
      type: 'DEX',
      primaryClass: 'Slasher',
      secondaryClass: 'Driven',
      cost: 15,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Reduces damage received by 80% if HP is above 99% at the start of the turn',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it("keeps #219 Roronoa Zoro - Lion's Song as both required manual leaders", async () => {
    const requiredLeader = loadGeneratedCharacterRecord(219);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 219,
      name: "Roronoa Zoro - Lion's Song",
      type: 'DEX',
      primaryClass: 'Slasher',
      secondaryClass: 'Driven',
      cost: 22,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Reduces damage received by 80% if HP is above 99% at the start of the turn',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #220 Nami - Fine Tempo as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(220);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 220,
      name: 'Nami - Fine Tempo',
      type: 'INT',
      primaryClass: 'Striker',
      secondaryClass: 'Cerebral',
      cost: 15,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of [INT] characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #221 Nami - Happiness Punch as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(221);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 221,
      name: 'Nami - Happiness Punch',
      type: 'INT',
      primaryClass: 'Striker',
      secondaryClass: 'Cerebral',
      cost: 22,
      captainHpBoost: 0,
      captainAtkBoost: 2.5,
      captainAverageBoost: 1.25,
      detail: {
        captainAbility: 'Boosts ATK of [INT] characters by 2.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #222 Usopp - Usopp Hammer as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(222);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 222,
      name: 'Usopp - Usopp Hammer',
      type: 'PSY',
      primaryClass: 'Striker',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 1.2,
      captainAverageBoost: 0.6,
      detail: {
        captainAbility: 'Boosts ATK of [PSY] characters by 1.2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #223 Usopp - Impact as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(223);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 223,
      name: 'Usopp - Impact',
      type: 'PSY',
      primaryClass: 'Shooter',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 1.5,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts ATK of [PSY] characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #224 Mr. Prince - Mutton Shot as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(224);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 224,
      name: 'Mr. Prince - Mutton Shot',
      type: 'QCK',
      primaryClass: 'Fighter',
      secondaryClass: 'Cerebral',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of all characters by 2x after scoring 2 PERFECTs in a row',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #225 Mr. Prince - Veau Shot as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(225);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 225,
      name: 'Mr. Prince - Veau Shot',
      type: 'QCK',
      primaryClass: 'Fighter',
      secondaryClass: 'Cerebral',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 2.5,
      captainAverageBoost: 1.25,
      detail: {
        captainAbility: 'Boosts ATK of all characters by 2.5x after scoring 2 PERFECTs in a row',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #226 Dracule Mihawk as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(226);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 226,
      name: 'Dracule Mihawk',
      type: 'DEX',
      primaryClass: 'Slasher',
      cost: 30,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of Slasher characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #227 Hawk Eyes Mihawk as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(227);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 227,
      name: 'Hawk Eyes Mihawk',
      type: 'DEX',
      primaryClass: 'Slasher',
      cost: 50,
      captainHpBoost: 0,
      captainAtkBoost: 2.5,
      captainAverageBoost: 1.25,
      detail: {
        captainAbility: 'Boosts ATK of Slasher characters by 2.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #228 Escapee Morgan as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(228);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 228,
      name: 'Escapee Morgan',
      type: 'STR',
      primaryClass: 'Slasher',
      secondaryClass: 'Driven',
      cost: 17,
      captainHpBoost: 1.5,
      captainAtkBoost: 0,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts HP of Slasher characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #229 Double Crosser Django as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(229);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 229,
      name: 'Double Crosser Django',
      type: 'PSY',
      primaryClass: 'Slasher',
      secondaryClass: 'Free Spirit',
      cost: 11,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Reduces damage received by 10%',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #230 Double Ironfist Fullbody as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(230);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 230,
      name: 'Double Ironfist Fullbody',
      type: 'STR',
      primaryClass: 'Fighter',
      secondaryClass: 'Free Spirit',
      cost: 11,
      captainHpBoost: 0,
      captainAtkBoost: 1.5,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts ATK of [STR] characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #231 Hina as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(231);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 231,
      name: 'Hina',
      type: 'QCK',
      primaryClass: 'Fighter',
      secondaryClass: 'Cerebral',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of [QCK] characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #232 Black Cage Hina as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(232);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 232,
      name: 'Black Cage Hina',
      type: 'QCK',
      primaryClass: 'Fighter',
      secondaryClass: 'Cerebral',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of [QCK] characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #233 Mr. 8 as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(233);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 233,
      name: 'Mr. 8',
      type: 'PSY',
      primaryClass: 'Shooter',
      secondaryClass: 'Cerebral',
      cost: 10,
      captainHpBoost: 1.5,
      captainAtkBoost: 0,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts HP of [PSY] characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #234 Mr. 8 - Igarappapa as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(234);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 234,
      name: 'Mr. 8 - Igarappapa',
      type: 'PSY',
      primaryClass: 'Shooter',
      secondaryClass: 'Cerebral',
      cost: 13,
      captainHpBoost: 2,
      captainAtkBoost: 0,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts HP of [PSY] characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #235 Miss Monday as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(235);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 235,
      name: 'Miss Monday',
      type: 'STR',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      cost: 10,
      captainHpBoost: 0,
      captainAtkBoost: 1.2,
      captainAverageBoost: 0.6,
      detail: {
        captainAbility: 'Boosts ATK of Fighter characters by 1.2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #236 Miss Monday - Superhuman Brass Knuckles as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(236);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 236,
      name: 'Miss Monday - Superhuman Brass Knuckles',
      type: 'STR',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      cost: 13,
      captainHpBoost: 0,
      captainAtkBoost: 1.5,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts ATK of Fighter characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #237 Knuckle Millions - Baroque Works as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(237);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 237,
      name: 'Knuckle Millions - Baroque Works',
      type: 'STR',
      primaryClass: 'Fighter',
      cost: 5,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #238 Saber Millions - Baroque Works as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(238);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 238,
      name: 'Saber Millions - Baroque Works',
      type: 'DEX',
      primaryClass: 'Slasher',
      cost: 5,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #239 Polearm Millions - Baroque Works as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(239);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 239,
      name: 'Polearm Millions - Baroque Works',
      type: 'QCK',
      primaryClass: 'Striker',
      cost: 5,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #240 Pistol Millions - Baroque Works as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(240);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 240,
      name: 'Pistol Millions - Baroque Works',
      type: 'PSY',
      primaryClass: 'Shooter',
      cost: 5,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #241 Bazooka Millions - Baroque Works as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(241);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 241,
      name: 'Bazooka Millions - Baroque Works',
      type: 'INT',
      primaryClass: 'Shooter',
      cost: 5,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #242 Knuckle Billions - Baroque Works as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(242);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 242,
      name: 'Knuckle Billions - Baroque Works',
      type: 'STR',
      primaryClass: 'Fighter',
      cost: 9,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #243 Saber Billions - Baroque Works as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(243);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 243,
      name: 'Saber Billions - Baroque Works',
      type: 'DEX',
      primaryClass: 'Slasher',
      cost: 9,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #244 Halberd Billions - Baroque Works as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(244);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 244,
      name: 'Halberd Billions - Baroque Works',
      type: 'QCK',
      primaryClass: 'Striker',
      cost: 9,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #245 Pistol Billions - Baroque Works as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(245);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 245,
      name: 'Pistol Billions - Baroque Works',
      type: 'PSY',
      primaryClass: 'Shooter',
      cost: 9,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #246 Bazooka Billions - Baroque Works as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(246);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 246,
      name: 'Bazooka Billions - Baroque Works',
      type: 'INT',
      primaryClass: 'Shooter',
      cost: 9,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #247 Chopper Man as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(247);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 247,
      name: 'Chopper Man',
      type: 'PSY',
      primaryClass: 'Fighter',
      cost: 10,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Reduces damage received by 10%',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #248 Tony Tony Chopper - Pre-Rampage as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(248);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 248,
      name: 'Tony Tony Chopper - Pre-Rampage',
      type: 'STR',
      primaryClass: 'Fighter',
      cost: 30,
      captainHpBoost: 0,
      captainAtkBoost: 2.5,
      captainAverageBoost: 1.25,
      detail: {
        captainAbility: 'Boosts ATK of [STR] characters by 2.5x and reduces HP of [STR] characters by 60%',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #249 Tony Tony Chopper - Post-Rampage as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(249);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 249,
      name: 'Tony Tony Chopper - Post-Rampage',
      type: 'STR',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      cost: 50,
      captainHpBoost: 0,
      captainAtkBoost: 3,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK of [STR] characters by 3x and reduces HP of [STR] characters by 70%',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #250 Marco as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(250);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 250,
      name: 'Marco',
      type: 'PSY',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 3,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK of [PSY] characters by 3x if HP is above 99% at the start of the turn',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #251 Marco the Phoenix as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(251);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 251,
      name: 'Marco the Phoenix',
      type: 'PSY',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      cost: 28,
      captainHpBoost: 0,
      captainAtkBoost: 3,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK of [PSY] characters by 3x if HP is above 99% at the start of the turn',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #252 Jozu as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(252);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 252,
      name: 'Jozu',
      type: 'QCK',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      cost: 18,
      captainHpBoost: 2,
      captainAtkBoost: 2,
      captainAverageBoost: 2,
      detail: {
        captainAbility: 'Boosts ATK and HP of [QCK] characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #253 Diamond Jozu as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(253);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 253,
      name: 'Diamond Jozu',
      type: 'QCK',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      cost: 28,
      captainHpBoost: 2,
      captainAtkBoost: 2,
      captainAverageBoost: 2,
      detail: {
        captainAbility: 'Boosts ATK and HP of [QCK] characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #254 Vista as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(254);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 254,
      name: 'Vista',
      type: 'INT',
      primaryClass: 'Slasher',
      secondaryClass: 'Powerhouse',
      cost: 18,
      captainHpBoost: 2,
      captainAtkBoost: 2,
      captainAverageBoost: 2,
      detail: {
        captainAbility: 'Boosts ATK and HP of [INT] characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #255 Flower Sword Vista as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(255);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 255,
      name: 'Flower Sword Vista',
      type: 'INT',
      primaryClass: 'Slasher',
      secondaryClass: 'Powerhouse',
      cost: 28,
      captainHpBoost: 2,
      captainAtkBoost: 2,
      captainAverageBoost: 2,
      detail: {
        captainAbility: 'Boosts ATK and HP of [INT] characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #256 Izo as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(256);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 256,
      name: 'Izo',
      type: 'DEX',
      primaryClass: 'Shooter',
      secondaryClass: 'Cerebral',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK and RCV of [DEX] characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #257 Flintlock Pistols Izo as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(257);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 257,
      name: 'Flintlock Pistols Izo',
      type: 'DEX',
      primaryClass: 'Shooter',
      secondaryClass: 'Cerebral',
      cost: 28,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK and RCV of [DEX] characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #258 Blamenco as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(258);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 258,
      name: 'Blamenco',
      type: 'STR',
      primaryClass: 'Striker',
      secondaryClass: 'Free Spirit',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK and RCV of [STR] characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #259 Blamenco the Mallet as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(259);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 259,
      name: 'Blamenco the Mallet',
      type: 'STR',
      primaryClass: 'Striker',
      secondaryClass: 'Free Spirit',
      cost: 28,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK and RCV of [STR] characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #260 Edward Newgate as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(260);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 260,
      name: 'Edward Newgate',
      type: 'STR',
      primaryClass: 'Striker',
      secondaryClass: 'Powerhouse',
      cost: 40,
      captainHpBoost: 0,
      captainAtkBoost: 3,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK of all characters by 3x if HP is below 30% at the start of the turn',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #261 Whitebeard as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(261);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 261,
      name: 'Whitebeard',
      type: 'STR',
      primaryClass: 'Striker',
      secondaryClass: 'Powerhouse',
      cost: 55,
      captainHpBoost: 0,
      captainAtkBoost: 3,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK of all characters by 3x if HP is below 30% at the start of the turn',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #262 Training Coby as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(262);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 262,
      name: 'Training Coby',
      type: 'PSY',
      primaryClass: 'Striker',
      secondaryClass: 'Driven',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: "Recovers 2x character's RCV in HP at the end of each turn",
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #263 Petty Officer Coby as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(263);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 263,
      name: 'Petty Officer Coby',
      type: 'PSY',
      primaryClass: 'Fighter',
      secondaryClass: 'Driven',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of Fighter characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #264 Training Helmeppo as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(264);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 264,
      name: 'Training Helmeppo',
      type: 'INT',
      primaryClass: 'Striker',
      secondaryClass: 'Driven',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Reduces damage received from [INT] enemies by 30%',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #265 Sergeant Helmeppo as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(265);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 265,
      name: 'Sergeant Helmeppo',
      type: 'INT',
      primaryClass: 'Slasher',
      secondaryClass: 'Driven',
      cost: 18,
      captainHpBoost: 1.5,
      captainAtkBoost: 1.5,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK and HP of Slasher characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #266 Rainbow Pirate Penguin as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(266);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 266,
      name: 'Rainbow Pirate Penguin',
      type: 'INT',
      primaryClass: 'Evolver',
      cost: 6,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #267 Rainbow Striped Dragon as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(267);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 267,
      name: 'Rainbow Striped Dragon',
      type: 'INT',
      primaryClass: 'Evolver',
      cost: 20,
      captainHpBoost: 0,
      captainAtkBoost: 1.5,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts ATK of all characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #268 White Chase Smoker as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(268);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 268,
      name: 'White Chase Smoker',
      type: 'DEX',
      primaryClass: 'Striker',
      secondaryClass: 'Driven',
      cost: 20,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Reduces damage received by 25%',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #269 Armed Fighter Unit - Red Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(269);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 269,
      name: 'Armed Fighter Unit - Red Pirates',
      type: 'STR',
      primaryClass: 'Fighter',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #270 Armed Fighter Unit - Blue Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(270);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 270,
      name: 'Armed Fighter Unit - Blue Pirates',
      type: 'QCK',
      primaryClass: 'Fighter',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #271 Armed Fighter Unit - Green Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(271);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 271,
      name: 'Armed Fighter Unit - Green Pirates',
      type: 'DEX',
      primaryClass: 'Fighter',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #272 Armed Fighter Unit - Yellow Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(272);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 272,
      name: 'Armed Fighter Unit - Yellow Pirates',
      type: 'PSY',
      primaryClass: 'Fighter',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #273 Armed Fighter Unit - Black Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(273);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 273,
      name: 'Armed Fighter Unit - Black Pirates',
      type: 'INT',
      primaryClass: 'Fighter',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #274 Armed Slasher Unit - Red Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(274);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 274,
      name: 'Armed Slasher Unit - Red Pirates',
      type: 'STR',
      primaryClass: 'Slasher',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #275 Armed Slasher Unit - Blue Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(275);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 275,
      name: 'Armed Slasher Unit - Blue Pirates',
      type: 'QCK',
      primaryClass: 'Slasher',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #276 Armed Slasher Unit - Green Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(276);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 276,
      name: 'Armed Slasher Unit - Green Pirates',
      type: 'DEX',
      primaryClass: 'Slasher',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #277 Armed Slasher Unit - Yellow Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(277);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 277,
      name: 'Armed Slasher Unit - Yellow Pirates',
      type: 'PSY',
      primaryClass: 'Slasher',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #278 Armed Slasher Unit - Black Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(278);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 278,
      name: 'Armed Slasher Unit - Black Pirates',
      type: 'INT',
      primaryClass: 'Slasher',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #279 Armed Striker Unit - Red Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(279);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 279,
      name: 'Armed Striker Unit - Red Pirates',
      type: 'STR',
      primaryClass: 'Striker',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #280 Armed Striker Unit - Blue Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(280);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 280,
      name: 'Armed Striker Unit - Blue Pirates',
      type: 'QCK',
      primaryClass: 'Striker',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #281 Armed Striker Unit - Green Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(281);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 281,
      name: 'Armed Striker Unit - Green Pirates',
      type: 'DEX',
      primaryClass: 'Striker',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #282 Armed Striker Unit - Yellow Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(282);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 282,
      name: 'Armed Striker Unit - Yellow Pirates',
      type: 'PSY',
      primaryClass: 'Striker',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #283 Armed Striker Unit - Black Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(283);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 283,
      name: 'Armed Striker Unit - Black Pirates',
      type: 'INT',
      primaryClass: 'Striker',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #284 Armed Shooter Unit - Red Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(284);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 284,
      name: 'Armed Shooter Unit - Red Pirates',
      type: 'STR',
      primaryClass: 'Shooter',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #285 Armed Shooter Unit - Blue Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(285);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 285,
      name: 'Armed Shooter Unit - Blue Pirates',
      type: 'QCK',
      primaryClass: 'Shooter',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #286 Armed Shooter Unit - Green Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(286);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 286,
      name: 'Armed Shooter Unit - Green Pirates',
      type: 'DEX',
      primaryClass: 'Shooter',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #287 Armed Shooter Unit - Yellow Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(287);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 287,
      name: 'Armed Shooter Unit - Yellow Pirates',
      type: 'PSY',
      primaryClass: 'Shooter',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #288 Armed Shooter Unit - Black Pirates as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(288);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 288,
      name: 'Armed Shooter Unit - Black Pirates',
      type: 'INT',
      primaryClass: 'Shooter',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #289 Skilled Gunner as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(289);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 289,
      name: 'Skilled Gunner',
      type: 'INT',
      primaryClass: 'Shooter',
      cost: 15,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #290 Mr. 13 & Ms. Friday - The Unluckies as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(290);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 290,
      name: 'Mr. 13 & Ms. Friday - The Unluckies',
      type: 'INT',
      primaryClass: 'Shooter',
      cost: 13,
      captainHpBoost: 0,
      captainAtkBoost: 1.5,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts ATK of Shooter characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #291 Dorry as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(291);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 291,
      name: 'Dorry',
      type: 'PSY',
      primaryClass: 'Slasher',
      secondaryClass: 'Powerhouse',
      cost: 25,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Reduces damage received from [INT] enemies by 50%',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #292 Broggy as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(292);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 292,
      name: 'Broggy',
      type: 'INT',
      primaryClass: 'Slasher',
      secondaryClass: 'Powerhouse',
      cost: 25,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Reduces damage received from [PSY] enemies by 50%',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #293 Triceratops as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(293);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 293,
      name: 'Triceratops',
      type: 'QCK',
      primaryClass: 'Fighter',
      cost: 25,
      captainHpBoost: 2,
      captainAtkBoost: 0,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts HP of [QCK] characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #294 Rex as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(294);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 294,
      name: 'Rex',
      type: 'STR',
      primaryClass: 'Fighter',
      cost: 25,
      captainHpBoost: 2,
      captainAtkBoost: 0,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts HP of [STR] characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #295 Brontosaurus as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(295);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 295,
      name: 'Brontosaurus',
      type: 'DEX',
      primaryClass: 'Fighter',
      cost: 25,
      captainHpBoost: 2,
      captainAtkBoost: 0,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts HP of [DEX] characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #296 Tsuru as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(296);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 296,
      name: 'Tsuru',
      type: 'INT',
      primaryClass: 'Shooter',
      secondaryClass: 'Cerebral',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of Shooter characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #297 Great Advisor Tsuru as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(297);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 297,
      name: 'Great Advisor Tsuru',
      type: 'INT',
      primaryClass: 'Shooter',
      secondaryClass: 'Cerebral',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of Shooter characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #298 Momonga as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(298);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 298,
      name: 'Momonga',
      type: 'PSY',
      primaryClass: 'Slasher',
      secondaryClass: 'Cerebral',
      cost: 11,
      captainHpBoost: 2,
      captainAtkBoost: 0,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts HP of [PSY] characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #299 Onigumo as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(299);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 299,
      name: 'Onigumo',
      type: 'DEX',
      primaryClass: 'Slasher',
      secondaryClass: 'Driven',
      cost: 11,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of [DEX] characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #300 Red Plated Lobster as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(300);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 300,
      name: 'Red Plated Lobster',
      type: 'STR',
      primaryClass: 'Evolver',
      cost: 7,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #301 Blue Plated Lobster as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(301);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 301,
      name: 'Blue Plated Lobster',
      type: 'QCK',
      primaryClass: 'Evolver',
      cost: 7,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #302 Green Plated Lobster as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(302);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 302,
      name: 'Green Plated Lobster',
      type: 'DEX',
      primaryClass: 'Evolver',
      cost: 7,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #303 Yellow Plated Lobster as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(303);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 303,
      name: 'Yellow Plated Lobster',
      type: 'PSY',
      primaryClass: 'Evolver',
      cost: 7,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #304 Black Plated Lobster as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(304);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 304,
      name: 'Black Plated Lobster',
      type: 'INT',
      primaryClass: 'Evolver',
      cost: 7,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #305 Monkey D. Garp as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(305);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 305,
      name: 'Monkey D. Garp',
      type: 'PSY',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      cost: 30,
      captainHpBoost: 1.5,
      captainAtkBoost: 1.5,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK and HP of [PSY] characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #306 Garp the Fist as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(306);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 306,
      name: 'Garp the Fist',
      type: 'PSY',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      cost: 50,
      captainHpBoost: 2,
      captainAtkBoost: 2.5,
      captainAverageBoost: 2.25,
      detail: {
        captainAbility: 'Boosts ATK of [PSY] characters by 2.5x and their HP by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #307 Trafalgar Law as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(307);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 307,
      name: 'Trafalgar Law',
      type: 'DEX',
      primaryClass: 'Slasher',
      secondaryClass: 'Free Spirit',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 2.5,
      captainAverageBoost: 1.25,
      detail: {
        captainAbility: 'Boosts ATK of [DEX] characters by 2.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #308 Trafalgar Law - ROOM as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(308);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 308,
      name: 'Trafalgar Law - ROOM',
      type: 'DEX',
      primaryClass: 'Slasher',
      secondaryClass: 'Free Spirit',
      cost: 28,
      captainHpBoost: 0,
      captainAtkBoost: 2.5,
      captainAverageBoost: 1.25,
      detail: {
        captainAbility: 'Boosts ATK of [DEX] characters by 2.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #309 Basil Hawkins as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(309);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 309,
      name: 'Basil Hawkins',
      type: 'INT',
      primaryClass: 'Slasher',
      secondaryClass: 'Cerebral',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Reduces RCV of all characters by 90%, reduces damage received by 40%',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #310 Basil Hawkins the Magician as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(310);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 310,
      name: 'Basil Hawkins the Magician',
      type: 'INT',
      primaryClass: 'Striker',
      secondaryClass: 'Cerebral',
      cost: 28,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Reduces RCV of all characters by 90%, reduces damage received by 40%',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #311 Killer as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(311);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 311,
      name: 'Killer',
      type: 'QCK',
      primaryClass: 'Striker',
      secondaryClass: 'Cerebral',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 3.5,
      captainAverageBoost: 1.75,
      detail: {
        captainAbility: 'Boosts ATK of all characters by 3.5x after scoring 3 hits below Good in a row',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #312 Massacre Soldier Killer as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(312);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 312,
      name: 'Massacre Soldier Killer',
      type: 'QCK',
      primaryClass: 'Striker',
      secondaryClass: 'Cerebral',
      cost: 28,
      captainHpBoost: 0,
      captainAtkBoost: 3.5,
      captainAverageBoost: 1.75,
      detail: {
        captainAbility: 'Boosts ATK of all characters by 3.5x after scoring 3 hits below Good in a row',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #313 Urouge as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(313);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 313,
      name: 'Urouge',
      type: 'PSY',
      primaryClass: 'Striker',
      secondaryClass: 'Powerhouse',
      cost: 18,
      captainHpBoost: 1.5,
      captainAtkBoost: 2,
      captainAverageBoost: 1.75,
      detail: {
        captainAbility: 'Boosts ATK of Striker characters by 2x and their HP by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #314 Mad Monk Urouge as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(314);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 314,
      name: 'Mad Monk Urouge',
      type: 'PSY',
      primaryClass: 'Striker',
      secondaryClass: 'Powerhouse',
      cost: 28,
      captainHpBoost: 1.5,
      captainAtkBoost: 2,
      captainAverageBoost: 1.75,
      detail: {
        captainAbility: 'Boosts ATK of Striker characters by 2x and their HP by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #315 Bepo as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(315);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 315,
      name: 'Bepo',
      type: 'STR',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      cost: 18,
      captainHpBoost: 1.5,
      captainAtkBoost: 1.5,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK, HP and RCV of Fighter characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #316 Bepo the Martial Artist as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(316);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 316,
      name: 'Bepo the Martial Artist',
      type: 'STR',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      cost: 28,
      captainHpBoost: 1.5,
      captainAtkBoost: 1.5,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK, HP and RCV of Fighter characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #317 Kalifa as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(317);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 317,
      name: 'Kalifa',
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Cerebral',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Recovers 500 HP at the end of each turn, reduces damage received by 10%',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #318 Beautiful Secretary Kalifa as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(318);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 318,
      name: 'Beautiful Secretary Kalifa',
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Cerebral',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Recovers 1,000 HP at the end of each turn, reduces damage received by 15%',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #319 Paulie as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(319);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 319,
      name: 'Paulie',
      type: 'DEX',
      primaryClass: 'Striker',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 1.5,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts ATK of Striker characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #320 Paulie - Dock One Foreman/Mast Specialist as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(320);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 320,
      name: 'Paulie - Dock One Foreman/Mast Specialist',
      type: 'DEX',
      primaryClass: 'Striker',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of Striker characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #321 Rob Lucci as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(321);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 321,
      name: 'Rob Lucci',
      type: 'QCK',
      primaryClass: 'Slasher',
      secondaryClass: 'Powerhouse',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of [QCK] characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #322 Rob Lucci - Dock One Sawyer, Treenail Specialist as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(322);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 322,
      name: 'Rob Lucci - Dock One Sawyer, Treenail Specialist',
      type: 'QCK',
      primaryClass: 'Slasher',
      secondaryClass: 'Powerhouse',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of [QCK] characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #323 Kaku as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(323);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 323,
      name: 'Kaku',
      type: 'QCK',
      primaryClass: 'Striker',
      cost: 12,
      captainHpBoost: 1.5,
      captainAtkBoost: 0,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts HP and RCV of [QCK] characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #324 Kaku - Dock One Carpentry Specialist as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(324);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 324,
      name: 'Kaku - Dock One Carpentry Specialist',
      type: 'QCK',
      primaryClass: 'Striker',
      secondaryClass: 'Free Spirit',
      cost: 18,
      captainHpBoost: 1.5,
      captainAtkBoost: 0,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts HP and RCV of [QCK] characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #325 Lulu as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(325);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 325,
      name: 'Lulu',
      type: 'QCK',
      primaryClass: 'Shooter',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #326 Wapol as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(326);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 326,
      name: 'Wapol',
      type: 'STR',
      primaryClass: 'Fighter',
      secondaryClass: 'Free Spirit',
      cost: 8,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: "Recovers 10x character's RCV in HP at the end of each turn",
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #327 Wapol House as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(327);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 327,
      name: 'Wapol House',
      type: 'STR',
      primaryClass: 'Shooter',
      secondaryClass: 'Free Spirit',
      cost: 15,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: "Recovers 10x character's RCV in HP at the end of each turn",
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #328 Dalton as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(328);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 328,
      name: 'Dalton',
      type: 'QCK',
      primaryClass: 'Slasher',
      secondaryClass: 'Cerebral',
      cost: 7,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Boosts RCV of all characters by 5x if HP is below 30% at the start of the turn',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #329 Dalton - Bison as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(329);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 329,
      name: 'Dalton - Bison',
      type: 'QCK',
      primaryClass: 'Slasher',
      secondaryClass: 'Cerebral',
      cost: 11,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Boosts RCV of all characters by 5x if HP is below 30% at the start of the turn',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #330 Chess as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(330);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 330,
      name: 'Chess',
      type: 'DEX',
      primaryClass: 'Shooter',
      cost: 7,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #331 Kuromarimo as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(331);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 331,
      name: 'Kuromarimo',
      type: 'DEX',
      primaryClass: 'Striker',
      cost: 7,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #332 Chessmarimo as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(332);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 332,
      name: 'Chessmarimo',
      type: 'DEX',
      primaryClass: 'Striker',
      cost: 11,
      captainHpBoost: 1.2,
      captainAtkBoost: 1.2,
      captainAverageBoost: 1.2,
      detail: {
        captainAbility: 'Boosts ATK, HP and RCV of Striker characters by 1.2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #333 Dr. Kureha as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(333);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 333,
      name: 'Dr. Kureha',
      type: 'PSY',
      primaryClass: 'Slasher',
      secondaryClass: 'Cerebral',
      cost: 20,
      captainHpBoost: 0,
      captainAtkBoost: 1.5,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts ATK and RCV of [PSY] and [INT] characters by 1.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #334 Lapin as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(334);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 334,
      name: 'Lapin',
      type: 'INT',
      primaryClass: 'Fighter',
      cost: 15,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #335 Lapin - Adult as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(335);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 335,
      name: 'Lapin - Adult',
      type: 'INT',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      cost: 20,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #336 Franky as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(336);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 336,
      name: 'Franky',
      type: 'PSY',
      primaryClass: 'Shooter',
      secondaryClass: 'Free Spirit',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility:
          'Reduces damage received by 10% if HP is above 50% at the start of the turn, boosts ATK of [PSY] characters by 2x and reduces ATK of every other character by 20% if HP is above 50% at the start of the turn',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #337 Dismantler Franky as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(337);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 337,
      name: 'Dismantler Franky',
      type: 'PSY',
      primaryClass: 'Shooter',
      secondaryClass: 'Free Spirit',
      cost: 20,
      captainHpBoost: 0,
      captainAtkBoost: 2.5,
      captainAverageBoost: 1.25,
      detail: {
        captainAbility:
          'Reduces damage received by 10% if HP is above 50% at the start of the turn, boosts ATK of [PSY] characters by 2.5x and reduces ATK of every other character by 20% if HP is above 50% at the start of the turn',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #338 Kiwi as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(338);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 338,
      name: 'Kiwi',
      type: 'PSY',
      primaryClass: 'Slasher',
      cost: 13,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #339 Mozu as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(339);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 339,
      name: 'Mozu',
      type: 'PSY',
      primaryClass: 'Slasher',
      cost: 13,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #340 Kraken - Surume as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(340);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 340,
      name: 'Kraken - Surume',
      type: 'STR',
      primaryClass: 'Striker',
      secondaryClass: 'Powerhouse',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of Striker characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #341 Kraken - Monster of the North as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(341);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 341,
      name: 'Kraken - Monster of the North',
      type: 'STR',
      primaryClass: 'Striker',
      secondaryClass: 'Powerhouse',
      cost: 20,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of Striker characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #342 Red Jeweled Porc as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(342);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 342,
      name: 'Red Jeweled Porc',
      type: 'STR',
      primaryClass: 'Booster',
      cost: 2,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #343 Blue Jeweled Porc as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(343);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 343,
      name: 'Blue Jeweled Porc',
      type: 'QCK',
      primaryClass: 'Booster',
      cost: 2,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #344 Green Jeweled Porc as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(344);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 344,
      name: 'Green Jeweled Porc',
      type: 'DEX',
      primaryClass: 'Booster',
      cost: 2,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #345 Yellow Jeweled Porc as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(345);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 345,
      name: 'Yellow Jeweled Porc',
      type: 'PSY',
      primaryClass: 'Booster',
      cost: 2,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #346 Black Jeweled Porc as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(346);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 346,
      name: 'Black Jeweled Porc',
      type: 'INT',
      primaryClass: 'Booster',
      cost: 2,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #347 Ruby Jeweled Porc as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(347);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 347,
      name: 'Ruby Jeweled Porc',
      type: 'STR',
      primaryClass: 'Booster',
      cost: 5,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #348 Sapphire Jeweled Porc as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(348);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 348,
      name: 'Sapphire Jeweled Porc',
      type: 'QCK',
      primaryClass: 'Booster',
      cost: 5,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #349 Emerald Jeweled Porc as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(349);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 349,
      name: 'Emerald Jeweled Porc',
      type: 'DEX',
      primaryClass: 'Booster',
      cost: 5,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #350 Topaz Jeweled Porc as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(350);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 350,
      name: 'Topaz Jeweled Porc',
      type: 'PSY',
      primaryClass: 'Booster',
      cost: 5,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #351 Amethyst Jeweled Porc as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(351);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 351,
      name: 'Amethyst Jeweled Porc',
      type: 'INT',
      primaryClass: 'Booster',
      cost: 5,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #352 Zephyr as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(352);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 352,
      name: 'Zephyr',
      type: 'INT',
      primaryClass: 'Shooter',
      secondaryClass: 'Powerhouse',
      cost: 30,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of Shooter characters by 2x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #353 Zephyr - Neo Marines Leader as both required manual leaders', async () => {
    const requiredLeader = loadGeneratedCharacterRecord(353);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        requireUniqueBaseCharacterNames: true,
        leaderBoostFilters: ['HP', 'ATK'],
        manualSlots: createManualSlots(
          {
            captain: [requiredLeader.id],
            friendCaptain: [requiredLeader.id],
          },
          {
            captain: requiredLeader.id,
            friendCaptain: requiredLeader.id,
          },
        ),
      },
    );

    expectCompleteAutoTeam(result);
    expect(requiredLeader).toMatchObject({
      id: 353,
      name: 'Zephyr - Neo Marines Leader',
      type: 'INT',
      primaryClass: 'Shooter',
      secondaryClass: 'Powerhouse',
      cost: 50,
      captainHpBoost: 0,
      captainAtkBoost: 2.5,
      captainAverageBoost: 1.25,
      detail: {
        captainAbility: 'Boosts ATK of Shooter characters by 2.5x',
      },
    });
    expect(result?.slots[0]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[1]?.character.id).toBe(requiredLeader.id);
    expect(result?.slots[0]?.reasonChips).toContain('Manual pick');
    expect(result?.slots[1]?.reasonChips).toContain('Manual pick');
  });

  it('keeps #354 Ain as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(354, {
      id: 354,
      name: 'Ain',
      type: 'QCK',
      primaryClass: 'Shooter',
      secondaryClass: 'Cerebral',
      cost: 8,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
  });

  it('keeps #355 Ain - Neo Marines Vice Admiral as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(355, {
      id: 355,
      name: 'Ain - Neo Marines Vice Admiral',
      type: 'QCK',
      primaryClass: 'Shooter',
      secondaryClass: 'Cerebral',
      cost: 13,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
  });

  it('keeps #356 Eustass Kid as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(356, {
      id: 356,
      name: 'Eustass Kid',
      type: 'STR',
      primaryClass: 'Striker',
      secondaryClass: 'Driven',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of Striker characters by 2x',
      },
    });
  });

  it('keeps #357 Captain Kid as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(357, {
      id: 357,
      name: 'Captain Kid',
      type: 'STR',
      primaryClass: 'Striker',
      secondaryClass: 'Driven',
      cost: 28,
      captainHpBoost: 0,
      captainAtkBoost: 2.5,
      captainAverageBoost: 1.25,
      detail: {
        captainAbility: 'Boosts ATK of Striker characters by 2.5x',
      },
    });
  });

  it('keeps #358 Scratchmen Apoo as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(358, {
      id: 358,
      name: 'Scratchmen Apoo',
      type: 'DEX',
      primaryClass: 'Shooter',
      secondaryClass: 'Free Spirit',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 2.5,
      captainAverageBoost: 1.25,
      detail: {
        captainAbility: 'Boosts ATK of [DEX] characters by 2.5x if HP is above 99% at the start of the turn',
      },
    });
  });

  it('keeps #359 Roar of the Sea Scratchmen Apoo as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(359, {
      id: 359,
      name: 'Roar of the Sea Scratchmen Apoo',
      type: 'DEX',
      primaryClass: 'Shooter',
      secondaryClass: 'Free Spirit',
      cost: 28,
      captainHpBoost: 0,
      captainAtkBoost: 3,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK of [DEX] characters by 3x if HP is above 99% at the start of the turn',
      },
    });
  });

  it('keeps #360 X Drake as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(360, {
      id: 360,
      name: 'X Drake',
      type: 'INT',
      primaryClass: 'Striker',
      secondaryClass: 'Powerhouse',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 3,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK of [INT] characters by 3x if HP is below 30% at the start of the turn',
      },
    });
  });

  it('keeps #361 Red Flag X Drake as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(361, {
      id: 361,
      name: 'Red Flag X Drake',
      type: 'INT',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      cost: 28,
      captainHpBoost: 0,
      captainAtkBoost: 3,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK of [INT] characters by 3x if HP is below 30% at the start of the turn',
      },
    });
  });

  it('keeps #362 Jewelry Bonney as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(362, {
      id: 362,
      name: 'Jewelry Bonney',
      type: 'PSY',
      primaryClass: 'Fighter',
      secondaryClass: 'Free Spirit',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK and RCV of [PSY] characters by 2x',
      },
    });
  });

  it('keeps #363 Big Eater Jewelry Bonney as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(363, {
      id: 363,
      name: 'Big Eater Jewelry Bonney',
      type: 'PSY',
      primaryClass: 'Fighter',
      secondaryClass: 'Free Spirit',
      cost: 28,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK and RCV of [PSY] characters by 2x',
      },
    });
  });

  it('keeps #364 Capone Bege as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(364, {
      id: 364,
      name: 'Capone Bege',
      type: 'QCK',
      primaryClass: 'Shooter',
      secondaryClass: 'Free Spirit',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK and RCV of [QCK] characters by 2x',
      },
    });
  });

  it('keeps #365 Capone Gang Bege as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(365, {
      id: 365,
      name: 'Capone Gang Bege',
      type: 'QCK',
      primaryClass: 'Shooter',
      secondaryClass: 'Free Spirit',
      cost: 28,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK and RCV of [QCK] characters by 2x',
      },
    });
  });

  it('keeps #366 Silvers Rayleigh as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(366, {
      id: 366,
      name: 'Silvers Rayleigh',
      type: 'INT',
      primaryClass: 'Fighter',
      secondaryClass: 'Cerebral',
      cost: 30,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Boosts Chain Multiplier Growth Rate by 4x',
      },
    });
  });

  it('keeps #367 Dark King Rayleigh as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(367, {
      id: 367,
      name: 'Dark King Rayleigh',
      type: 'INT',
      primaryClass: 'Fighter',
      secondaryClass: 'Cerebral',
      cost: 55,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Boosts Chain Multiplier Growth Rate by 4x.',
      },
    });
  });

  it('keeps #368 Giant Slasher - Red Pirates as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(368, {
      id: 368,
      name: 'Giant Slasher - Red Pirates',
      type: 'STR',
      primaryClass: 'Slasher',
      cost: 8,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
  });

  it('keeps #369 Giant Shooter - Blue Pirates as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(369, {
      id: 369,
      name: 'Giant Shooter - Blue Pirates',
      type: 'QCK',
      primaryClass: 'Shooter',
      cost: 8,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
  });

  it('keeps #370 Female Giant Warrior - Green Pirates as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(370, {
      id: 370,
      name: 'Female Giant Warrior - Green Pirates',
      type: 'DEX',
      primaryClass: 'Striker',
      cost: 8,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
  });

  it('keeps #371 Giant Fighter - Yellow Pirates as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(371, {
      id: 371,
      name: 'Giant Fighter - Yellow Pirates',
      type: 'PSY',
      primaryClass: 'Fighter',
      cost: 8,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
  });

  it('keeps #372 Giant Striker - Black Pirates as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(372, {
      id: 372,
      name: 'Giant Striker - Black Pirates',
      type: 'INT',
      primaryClass: 'Striker',
      cost: 8,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
  });

  it('keeps #373 Giant Imperial Slasher - Red Pirates as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(373, {
      id: 373,
      name: 'Giant Imperial Slasher - Red Pirates',
      type: 'STR',
      primaryClass: 'Slasher',
      cost: 13,
      captainHpBoost: 0,
      captainAtkBoost: 1.5,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts ATK of Slasher characters by 1.5x',
      },
    });
  });

  it('keeps #374 Giant Imperial Shooter - Blue Pirates as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(374, {
      id: 374,
      name: 'Giant Imperial Shooter - Blue Pirates',
      type: 'QCK',
      primaryClass: 'Shooter',
      cost: 13,
      captainHpBoost: 0,
      captainAtkBoost: 1.5,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts ATK of Shooter characters by 1.5x',
      },
    });
  });

  it('keeps #375 Female Giant Imperial Warrior - Green Pirates as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(375, {
      id: 375,
      name: 'Female Giant Imperial Warrior - Green Pirates',
      type: 'DEX',
      primaryClass: 'Striker',
      cost: 13,
      captainHpBoost: 1.5,
      captainAtkBoost: 0,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts HP of Striker characters by 1.5x',
      },
    });
  });

  it('keeps #376 Giant Imperial Fighter - Yellow Pirates as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(376, {
      id: 376,
      name: 'Giant Imperial Fighter - Yellow Pirates',
      type: 'PSY',
      primaryClass: 'Fighter',
      cost: 13,
      captainHpBoost: 0,
      captainAtkBoost: 1.5,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts ATK of Fighter characters by 1.5x',
      },
    });
  });

  it('keeps #377 Giant Imperial Striker - Black Pirates as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(377, {
      id: 377,
      name: 'Giant Imperial Striker - Black Pirates',
      type: 'INT',
      primaryClass: 'Striker',
      cost: 13,
      captainHpBoost: 0,
      captainAtkBoost: 1.5,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts ATK of Striker characters by 1.5x',
      },
    });
  });

  it('keeps #378 Sea Cat as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(378, {
      id: 378,
      name: 'Sea Cat',
      type: 'PSY',
      primaryClass: 'Fighter',
      cost: 10,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Boosts RCV of all characters by 1.5x',
      },
    });
  });

  it('keeps #379 Kung Fu Dugong as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(379, {
      id: 379,
      name: 'Kung Fu Dugong',
      type: 'STR',
      primaryClass: 'Fighter',
      cost: 7,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
  });

  it('keeps #380 Kung Fu Dugong - Faithful Apprentice as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(380, {
      id: 380,
      name: 'Kung Fu Dugong - Faithful Apprentice',
      type: 'STR',
      primaryClass: 'Fighter',
      cost: 11,
      captainHpBoost: 0,
      captainAtkBoost: 1.5,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts ATK and RCV of [STR] characters by 1.5x',
      },
    });
  });

  it('keeps #381 Banana Gator as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(381, {
      id: 381,
      name: 'Banana Gator',
      type: 'QCK',
      primaryClass: 'Fighter',
      cost: 10,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
  });

  it('keeps #382 Sandora Dragon as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(382, {
      id: 382,
      name: 'Sandora Dragon',
      type: 'DEX',
      primaryClass: 'Fighter',
      cost: 10,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
  });

  it('keeps #383 Mr. 0 - Baroque Works CEO as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(383, {
      id: 383,
      name: 'Mr. 0 - Baroque Works CEO',
      type: 'INT',
      primaryClass: 'Striker',
      secondaryClass: 'Cerebral',
      cost: 10,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Reduces damage received by 10%, boosts ATK of [INT] characters by 2x',
      },
    });
  });

  it('keeps #384 Sir Crocodile as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(384, {
      id: 384,
      name: 'Sir Crocodile',
      type: 'INT',
      primaryClass: 'Striker',
      secondaryClass: 'Cerebral',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Reduces damage received by 20%, boosts ATK of [INT] characters by 2x',
      },
    });
  });

  it('keeps #385 Hogback as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(385, {
      id: 385,
      name: 'Hogback',
      type: 'INT',
      primaryClass: 'Fighter',
      secondaryClass: 'Cerebral',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of [INT] characters by 2x',
      },
    });
  });

  it('keeps #386 Doctor Hogback as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(386, {
      id: 386,
      name: 'Doctor Hogback',
      type: 'INT',
      primaryClass: 'Fighter',
      secondaryClass: 'Cerebral',
      cost: 20,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of [INT] characters by 2x',
      },
    });
  });

  it('keeps #387 Cindry as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(387, {
      id: 387,
      name: 'Cindry',
      type: 'PSY',
      primaryClass: 'Shooter',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Boosts RCV of [PSY] characters by 1.5x',
      },
    });
  });

  it('keeps #388 Victoria Cindry as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(388, {
      id: 388,
      name: 'Victoria Cindry',
      type: 'PSY',
      primaryClass: 'Shooter',
      cost: 20,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Boosts RCV of [PSY] characters by 1.5x',
      },
    });
  });

  it('keeps #389 Emporio Ivankov as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(389, {
      id: 389,
      name: 'Emporio Ivankov',
      type: 'QCK',
      primaryClass: 'Fighter',
      secondaryClass: 'Free Spirit',
      cost: 30,
      captainHpBoost: 0,
      captainAtkBoost: 2.25,
      captainAverageBoost: 1.125,
      detail: {
        captainAbility: 'Boosts ATK of all characters by 2.25x following a chain of [DEX] > [INT] > [QCK] attacks no lower than Good',
      },
    });
  });

  it('keeps #390 Emporio Ivankov - Queen of Kamabakka Queendom (Retired) as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(390, {
      id: 390,
      name: 'Emporio Ivankov - Queen of Kamabakka Queendom (Retired)',
      type: 'QCK',
      primaryClass: 'Fighter',
      secondaryClass: 'Free Spirit',
      cost: 50,
      captainHpBoost: 0,
      captainAtkBoost: 3,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK of all characters by 3x following a chain of [DEX] > [INT] > [QCK] attacks no lower than Good',
      },
    });
  });

  it('keeps #391 Perona as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(391, {
      id: 391,
      name: 'Perona',
      type: 'DEX',
      primaryClass: 'Shooter',
      secondaryClass: 'Driven',
      cost: 10,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Boosts RCV of [DEX] characters by 1.5x',
      },
    });
  });

  it('keeps #392 Ghost Princess Perona as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(392, {
      id: 392,
      name: 'Ghost Princess Perona',
      type: 'DEX',
      primaryClass: 'Shooter',
      secondaryClass: 'Driven',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Boosts RCV of [DEX] characters by 2x',
      },
    });
  });

  it('keeps #393 Kumacy as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(393, {
      id: 393,
      name: 'Kumacy',
      type: 'STR',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      cost: 11,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
  });

  it('keeps #394 Inuppe as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(394, {
      id: 394,
      name: 'Inuppe',
      type: 'QCK',
      primaryClass: 'Fighter',
      cost: 11,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
  });

  it('keeps #395 Miss Merry Christmas as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(395, {
      id: 395,
      name: 'Miss Merry Christmas',
      type: 'QCK',
      primaryClass: 'Fighter',
      cost: 11,
      captainHpBoost: 0,
      captainAtkBoost: 1.2,
      captainAverageBoost: 0.6,
      detail: {
        captainAbility: 'Boosts ATK and RCV of [QCK] characters by 1.2x',
      },
    });
  });

  it('keeps #396 Miss Merry Christmas - Human Mole as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(396, {
      id: 396,
      name: 'Miss Merry Christmas - Human Mole',
      type: 'QCK',
      primaryClass: 'Fighter',
      cost: 15,
      captainHpBoost: 0,
      captainAtkBoost: 1.2,
      captainAverageBoost: 0.6,
      detail: {
        captainAbility: 'Boosts ATK and RCV of [QCK] characters by 1.2x',
      },
    });
  });

  it('keeps #397 Mr. 4 as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(397, {
      id: 397,
      name: 'Mr. 4',
      type: 'STR',
      primaryClass: 'Shooter',
      secondaryClass: 'Powerhouse',
      cost: 11,
      captainHpBoost: 0,
      captainAtkBoost: 3,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK of all characters by 3x after scoring 5 PERFECTs in a row',
      },
    });
  });

  it('keeps #398 Mr. 4 and Lassoo the Dog-Gun as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(398, {
      id: 398,
      name: 'Mr. 4 and Lassoo the Dog-Gun',
      type: 'STR',
      primaryClass: 'Shooter',
      secondaryClass: 'Powerhouse',
      cost: 15,
      captainHpBoost: 0,
      captainAtkBoost: 4,
      captainAverageBoost: 2,
      detail: {
        captainAbility: 'Boosts ATK of all characters by 4x after scoring 5 PERFECTs in a row',
      },
    });
  });

  it('keeps #399 Miss Doublefinger as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(399, {
      id: 399,
      name: 'Miss Doublefinger',
      type: 'DEX',
      primaryClass: 'Striker',
      secondaryClass: 'Cerebral',
      cost: 11,
      captainHpBoost: 1.5,
      captainAtkBoost: 0,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts HP of Striker characters by 1.5x',
      },
    });
  });

  it('keeps #400 Miss Doublefinger - Human Spike as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(400, {
      id: 400,
      name: 'Miss Doublefinger - Human Spike',
      type: 'DEX',
      primaryClass: 'Striker',
      secondaryClass: 'Cerebral',
      cost: 15,
      captainHpBoost: 2,
      captainAtkBoost: 0,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts HP of Striker characters by 2x',
      },
    });
  });

  it('keeps #401 Mr. 1 as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(401, {
      id: 401,
      name: 'Mr. 1',
      type: 'STR',
      primaryClass: 'Slasher',
      secondaryClass: 'Cerebral',
      cost: 11,
      captainHpBoost: 0,
      captainAtkBoost: 1.5,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Reduces damage received by 10%, boosts ATK of Slasher characters by 1.5x',
      },
    });
  });

  it('keeps #402 Mr. 1 - Human Sword as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(402, {
      id: 402,
      name: 'Mr. 1 - Human Sword',
      type: 'STR',
      primaryClass: 'Slasher',
      secondaryClass: 'Cerebral',
      cost: 15,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Reduces damage received by 10%, boosts ATK of Slasher characters by 2x',
      },
    });
  });

  it('keeps #403 Rebecca as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(403, {
      id: 403,
      name: 'Rebecca',
      type: 'QCK',
      primaryClass: 'Slasher',
      cost: 14,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Reduces damage received by 50% and boosts RCV of all characters by 3x when HP is low',
      },
    });
  });

  it('keeps #404 Absalom as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(404, {
      id: 404,
      name: 'Absalom',
      type: 'STR',
      primaryClass: 'Shooter',
      secondaryClass: 'Powerhouse',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 1.5,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts ATK of Shooter characters by 1.5x',
      },
    });
  });

  it('keeps #405 Absalom of the Graveyard as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(405, {
      id: 405,
      name: 'Absalom of the Graveyard',
      type: 'STR',
      primaryClass: 'Shooter',
      secondaryClass: 'Powerhouse',
      cost: 20,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of Shooter characters by 2x',
      },
    });
  });

  it('keeps #406 General Zombie as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(406, {
      id: 406,
      name: 'General Zombie',
      type: 'INT',
      primaryClass: 'Fighter',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
  });

  it('keeps #407 Jigoro of the Wind as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(407, {
      id: 407,
      name: 'Jigoro of the Wind',
      type: 'DEX',
      primaryClass: 'Slasher',
      cost: 9,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
  });

  it('keeps #408 Sir Crocodile - Warlord of the Sea as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(408, {
      id: 408,
      name: 'Sir Crocodile - Warlord of the Sea',
      type: 'INT',
      primaryClass: 'Slasher',
      secondaryClass: 'Cerebral',
      cost: 30,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Reduces damage received by 20%, boosts ATK of Slasher characters by 2x',
      },
    });
  });

  it('keeps #409 Jinbe as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(409, {
      id: 409,
      name: 'Jinbe',
      type: 'QCK',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      cost: 15,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of Fighter characters by 2x',
      },
    });
  });

  it('keeps #410 Jinbe - Warlord of the Sea as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(410, {
      id: 410,
      name: 'Jinbe - Warlord of the Sea',
      type: 'QCK',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      cost: 30,
      captainHpBoost: 0,
      captainAtkBoost: 2.5,
      captainAverageBoost: 1.25,
      detail: {
        captainAbility: 'Boosts ATK of Fighter characters by 2.5x',
      },
    });
  });

  it('keeps #411 Bartholomew Kuma as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(411, {
      id: 411,
      name: 'Bartholomew Kuma',
      type: 'STR',
      primaryClass: 'Shooter',
      secondaryClass: 'Powerhouse',
      cost: 15,
      captainHpBoost: 2,
      captainAtkBoost: 2,
      captainAverageBoost: 2,
      detail: {
        captainAbility: 'Boosts ATK and HP of [STR] characters by 2x',
      },
    });
  });

  it('keeps #412 Bartholomew Kuma - Warlord of the Sea as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(412, {
      id: 412,
      name: 'Bartholomew Kuma - Warlord of the Sea',
      type: 'STR',
      primaryClass: 'Shooter',
      secondaryClass: 'Powerhouse',
      cost: 30,
      captainHpBoost: 2,
      captainAtkBoost: 2,
      captainAverageBoost: 2,
      detail: {
        captainAbility: 'Boosts ATK and HP of [STR] characters by 2x',
      },
    });
  });

  it('keeps #413 Gecko Moria as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(413, {
      id: 413,
      name: 'Gecko Moria',
      type: 'INT',
      primaryClass: 'Striker',
      secondaryClass: 'Driven',
      cost: 15,
      captainHpBoost: 0,
      captainAtkBoost: 2.5,
      captainAverageBoost: 1.25,
      detail: {
        captainAbility: 'Boosts ATK of [INT] characters by 2.5x if HP is above 99% at the start of the turn',
      },
    });
  });

  it('keeps #414 Gecko Moria - Warlord of the Sea as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(414, {
      id: 414,
      name: 'Gecko Moria - Warlord of the Sea',
      type: 'INT',
      primaryClass: 'Striker',
      secondaryClass: 'Driven',
      cost: 30,
      captainHpBoost: 0,
      captainAtkBoost: 3,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK of [INT] characters by 3x if HP is above 99% at the start of the turn',
      },
    });
  });

  it('keeps #415 Boa Hancock as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(415, {
      id: 415,
      name: 'Boa Hancock',
      type: 'QCK',
      primaryClass: 'Fighter',
      secondaryClass: 'Free Spirit',
      cost: 30,
      captainHpBoost: 0,
      captainAtkBoost: 2.75,
      captainAverageBoost: 1.375,
      detail: {
        captainAbility: 'Boosts ATK of [QCK] and [PSY] characters by 2.75x and their RCV by 1.5x if HP is above 70% at the start of the turn',
      },
    });
  });

  it('keeps #416 Boa Hancock - Warlord of the Sea as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(416, {
      id: 416,
      name: 'Boa Hancock - Warlord of the Sea',
      type: 'QCK',
      primaryClass: 'Fighter',
      secondaryClass: 'Free Spirit',
      cost: 55,
      captainHpBoost: 0,
      captainAtkBoost: 2.75,
      captainAverageBoost: 1.375,
      detail: {
        captainAbility: 'Boosts ATK of [QCK] and [PSY] characters by 2.75x and their RCV by 1.5x if HP is above 70% at the start of the turn',
      },
    });
  });

  it('keeps #417 Donquixote Doflamingo as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(417, {
      id: 417,
      name: 'Donquixote Doflamingo',
      type: 'DEX',
      primaryClass: 'Slasher',
      secondaryClass: 'Driven',
      cost: 30,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of Slasher characters by 2x',
      },
    });
  });

  it('keeps #418 Donquixote Doflamingo - Warlord of the Sea as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(418, {
      id: 418,
      name: 'Donquixote Doflamingo - Warlord of the Sea',
      type: 'DEX',
      primaryClass: 'Slasher',
      secondaryClass: 'Driven',
      cost: 50,
      captainHpBoost: 2,
      captainAtkBoost: 2,
      captainAverageBoost: 2,
      detail: {
        captainAbility: 'Boosts ATK and HP of Slasher characters by 2x',
      },
    });
  });

  it('keeps #419 Sanji - Parage Shot: The Storm as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(419, {
      id: 419,
      name: 'Sanji - Parage Shot: The Storm',
      type: 'QCK',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      cost: 10,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of [QCK] characters by 2x',
      },
    });
  });

  it('keeps #420 Monkey D. Luffy - Gum-Gum Bazooka: Supremacy as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(420, {
      id: 420,
      name: 'Monkey D. Luffy - Gum-Gum Bazooka: Supremacy',
      type: 'STR',
      primaryClass: 'Fighter',
      secondaryClass: 'Free Spirit',
      cost: 15,
      captainHpBoost: 1.5,
      captainAtkBoost: 1.5,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK, HP and RCV of [STR] characters by 1.5x',
      },
    });
  });

  it('keeps #421 Roronoa Zoro - Three Thousand Worlds: The Final Stroke as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(421, {
      id: 421,
      name: 'Roronoa Zoro - Three Thousand Worlds: The Final Stroke',
      type: 'DEX',
      primaryClass: 'Slasher',
      secondaryClass: 'Driven',
      cost: 15,
      captainHpBoost: 1.5,
      captainAtkBoost: 1.5,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK, HP and RCV of [DEX] characters by 1.5x',
      },
    });
  });

  it('keeps #422 Nami - Mirage Tempo: The Heavens as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(422, {
      id: 422,
      name: 'Nami - Mirage Tempo: The Heavens',
      type: 'INT',
      primaryClass: 'Striker',
      secondaryClass: 'Cerebral',
      cost: 15,
      captainHpBoost: 1.5,
      captainAtkBoost: 1.5,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK, HP and RCV of [INT] characters by 1.5x',
      },
    });
  });

  it('keeps #423 Brook as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(423, {
      id: 423,
      name: 'Brook',
      type: 'QCK',
      primaryClass: 'Slasher',
      secondaryClass: 'Free Spirit',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Protects from defeat as long as HP is above 70%',
      },
    });
  });

  it('keeps #424 Humming Swordsman Brook as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(424, {
      id: 424,
      name: 'Humming Swordsman Brook',
      type: 'QCK',
      primaryClass: 'Slasher',
      secondaryClass: 'Free Spirit',
      cost: 20,
      captainHpBoost: 0,
      captainAtkBoost: 1.5,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts ATK of all characters by 1.5x and protects from defeat as long as HP is above 70%',
      },
    });
  });

  it('keeps #425 Ryuma as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(425, {
      id: 425,
      name: 'Ryuma',
      type: 'PSY',
      primaryClass: 'Slasher',
      cost: 18,
      captainHpBoost: 1.5,
      captainAtkBoost: 1.5,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK and HP of Slasher characters by 1.5x',
      },
    });
  });

  it('keeps #426 Masira as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(426, {
      id: 426,
      name: 'Masira',
      type: 'STR',
      primaryClass: 'Fighter',
      cost: 10,
      captainHpBoost: 2,
      captainAtkBoost: 0,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts HP of [STR] characters by 2x',
      },
    });
  });

  it('keeps #427 Shoujou as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(427, {
      id: 427,
      name: 'Shoujou',
      type: 'DEX',
      primaryClass: 'Shooter',
      cost: 10,
      captainHpBoost: 2,
      captainAtkBoost: 0,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts HP of [DEX] characters by 2x',
      },
    });
  });

  it('keeps #428 Montblanc Cricket as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(428, {
      id: 428,
      name: 'Montblanc Cricket',
      type: 'PSY',
      primaryClass: 'Shooter',
      secondaryClass: 'Free Spirit',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of [PSY] characters by 2x',
      },
    });
  });

  it('keeps #429 South Bird and Forest Residents as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(429, {
      id: 429,
      name: 'South Bird and Forest Residents',
      type: 'DEX',
      primaryClass: 'Fighter',
      cost: 8,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
  });

  it('keeps #430 Bellamy as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(430, {
      id: 430,
      name: 'Bellamy',
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Driven',
      cost: 10,
      captainHpBoost: 0,
      captainAtkBoost: 1.5,
      captainAverageBoost: 0.75,
      detail: {
        captainAbility: 'Boosts ATK of [DEX] characters by 1.5x',
      },
    });
  });

  it('keeps #431 Bellamy the Hyena as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(431, {
      id: 431,
      name: 'Bellamy the Hyena',
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Driven',
      cost: 15,
      captainHpBoost: 1.5,
      captainAtkBoost: 1.5,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK and HP of [DEX] characters by 1.5x',
      },
    });
  });

  it('keeps #432 Sarquiss as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(432, {
      id: 432,
      name: 'Sarquiss',
      type: 'QCK',
      primaryClass: 'Slasher',
      cost: 10,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
  });

  it('keeps #433 Elizabeth as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(433, {
      id: 433,
      name: 'Elizabeth',
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Free Spirit',
      cost: 12,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of all characters by 2x following a chain of [QCK] > [STR] > [DEX] attacks no lower than Good',
      },
    });
  });

  it('keeps #434 Caroline as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(434, {
      id: 434,
      name: 'Caroline',
      type: 'INT',
      primaryClass: 'Fighter',
      secondaryClass: 'Free Spirit',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of all characters by 2x following a chain of [PSY] > [INT] > [INT] attacks no lower than Good',
      },
    });
  });

  it('keeps #435 Sanji - Kamabakka Queendom Traditional Fighting Style as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(435, {
      id: 435,
      name: 'Sanji - Kamabakka Queendom Traditional Fighting Style',
      type: 'QCK',
      primaryClass: 'Fighter',
      cost: 10,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of all characters by 2x following a chain of [INT] > [PSY] > [QCK] attacks no lower than Good',
      },
    });
  });

  it('keeps #436 Sanji - Candy as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(436, {
      id: 436,
      name: 'Sanji - Candy',
      type: 'QCK',
      primaryClass: 'Fighter',
      secondaryClass: 'Free Spirit',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 2.25,
      captainAverageBoost: 1.125,
      detail: {
        captainAbility: 'Boosts ATK of all characters by 2.25x following a chain of [INT] > [PSY] > [QCK] attacks no lower than Good',
      },
    });
  });

  it('keeps #437 Perona ~Sweets~ as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(437, {
      id: 437,
      name: 'Perona ~Sweets~',
      type: 'DEX',
      primaryClass: 'Shooter',
      secondaryClass: 'Driven',
      cost: 11,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Boosts RCV of [DEX] characters by 3x if HP is below 30% at the start of the turn',
      },
    });
  });

  it('keeps #438 Perona ~Sweets~ - Ghost Princess as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(438, {
      id: 438,
      name: 'Perona ~Sweets~ - Ghost Princess',
      type: 'DEX',
      primaryClass: 'Shooter',
      secondaryClass: 'Driven',
      cost: 20,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Boosts RCV of [DEX] characters by 5x if HP is below 30% at the start of the turn',
      },
    });
  });

  it('keeps #439 Nefeltari Vivi ~Love~ as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(439, {
      id: 439,
      name: 'Nefeltari Vivi ~Love~',
      type: 'PSY',
      primaryClass: 'Slasher',
      secondaryClass: 'Free Spirit',
      cost: 11,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Recovers 5x character\'s RCV in HP at the end of each turn',
      },
    });
  });

  it('keeps #440 Princess Vivi ~Love~ as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(440, {
      id: 440,
      name: 'Princess Vivi ~Love~',
      type: 'PSY',
      primaryClass: 'Slasher',
      secondaryClass: 'Free Spirit',
      cost: 20,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: 'Recovers 7x character\'s RCV in HP at the end of each turn',
      },
    });
  });

  it('keeps #441 Cowboy and Bourbon Jr. - Supersonic Duck Squadron as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(441, {
      id: 441,
      name: 'Cowboy and Bourbon Jr. - Supersonic Duck Squadron',
      type: 'QCK',
      primaryClass: 'Evolver',
      cost: 9,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
  });

  it('keeps #442 Stomp and Ivan X - Supersonic Duck Squadron as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(442, {
      id: 442,
      name: 'Stomp and Ivan X - Supersonic Duck Squadron',
      type: 'DEX',
      primaryClass: 'Evolver',
      cost: 9,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
  });

  it('keeps #443 Centaur and Hikoichi - Supersonic Duck Squadron as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(443, {
      id: 443,
      name: 'Centaur and Hikoichi - Supersonic Duck Squadron',
      type: 'STR',
      primaryClass: 'Evolver',
      cost: 9,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      detail: {
        captainAbility: null,
      },
    });
  });

  it('keeps #444 Karoo as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(444, {
      id: 444,
      name: 'Karoo',
      type: 'PSY',
      primaryClass: 'Striker',
      cost: 6,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Boosts ATK of Evolver and Booster characters by 2x if HP is above 50% at the start of the turn',
      },
    });
  });

  it('keeps #445 Captain Karoo and the Supersonic Duck Squadron as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(445, {
      id: 445,
      name: 'Captain Karoo and the Supersonic Duck Squadron',
      type: 'PSY',
      primaryClass: 'Striker',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 2.5,
      captainAverageBoost: 1.25,
      detail: {
        captainAbility: 'Boosts ATK of Evolver and Booster characters by 2.5x if HP is above 50% at the start of the turn',
      },
    });
  });

  it('keeps #446 Marshall D. Teach as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(446, {
      id: 446,
      name: 'Marshall D. Teach',
      type: 'STR',
      primaryClass: 'Shooter',
      secondaryClass: 'Driven',
      cost: 30,
      captainHpBoost: 1.5,
      captainAtkBoost: 2,
      captainAverageBoost: 1.75,
      detail: {
        captainAbility: 'Increases damage received by 2x, boosts ATK of [STR] characters by 2x and their HP by 1.5x',
      },
    });
  });

  it('keeps #447 Blackbeard as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(447, {
      id: 447,
      name: 'Blackbeard',
      type: 'STR',
      primaryClass: 'Shooter',
      secondaryClass: 'Driven',
      cost: 50,
      captainHpBoost: 2.5,
      captainAtkBoost: 2.75,
      captainAverageBoost: 2.625,
      detail: {
        captainAbility: 'Increases damage received by 2x, boosts ATK of [STR] characters by 2.75x and their HP by 2.5x',
      },
    });
  });

  it('keeps #448 Thatch as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(448, {
      id: 448,
      name: 'Thatch',
      type: 'QCK',
      primaryClass: 'Slasher',
      secondaryClass: 'Cerebral',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 3,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK of [QCK] characters by 3x if HP is above 99% at the start of the turn',
      },
    });
  });

  it('keeps #449 Twin-Blade Thatch as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(449, {
      id: 449,
      name: 'Twin-Blade Thatch',
      type: 'QCK',
      primaryClass: 'Slasher',
      secondaryClass: 'Cerebral',
      cost: 28,
      captainHpBoost: 0,
      captainAtkBoost: 3,
      captainAverageBoost: 1.5,
      detail: {
        captainAbility: 'Boosts ATK of [QCK] characters by 3x if HP is above 99% at the start of the turn',
      },
    });
  });

  it('keeps #450 Namule as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(450, {
      id: 450,
      name: 'Namule',
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      cost: 18,
      captainHpBoost: 1.5,
      captainAtkBoost: 2,
      captainAverageBoost: 1.75,
      detail: {
        captainAbility: 'Boosts ATK of Fighter characters by 2x and their HP by 1.5x',
      },
    });
  });

  it('keeps #451 One-Hit Namule as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(451, {
      id: 451,
      name: 'One-Hit Namule',
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      cost: 28,
      captainHpBoost: 1.5,
      captainAtkBoost: 2,
      captainAverageBoost: 1.75,
      detail: {
        captainAbility: 'Boosts ATK of Fighter characters by 2x and their HP by 1.5x',
      },
    });
  });

  it('keeps #452 Rakuyo as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(452, {
      id: 452,
      name: 'Rakuyo',
      type: 'PSY',
      primaryClass: 'Striker',
      secondaryClass: 'Driven',
      cost: 18,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Reduces Special Cooldown of all characters by 3 turns at the start of the fight, boosts ATK of Striker characters by 2x',
      },
    });
  });

  it('keeps #453 Morning Star Rakuyo as both required manual leaders', async () => {
    await expectManualLeaderSweepCase(453, {
      id: 453,
      name: 'Morning Star Rakuyo',
      type: 'PSY',
      primaryClass: 'Striker',
      secondaryClass: 'Driven',
      cost: 28,
      captainHpBoost: 0,
      captainAtkBoost: 2,
      captainAverageBoost: 1,
      detail: {
        captainAbility: 'Reduces Special Cooldown of all characters by 3 turns at the start of the fight, boosts ATK of Striker characters by 2x',
      },
    });
  });

  it('promotes an optional manual captain without captain text to leader because every character has a coverage tier', async () => {
    // Under the tier-driven no-bypass policy, a no-captain-text character still owns the
    // trivial scope:'none' baseline tier injected by `normalizeCaptainAbilityCoverage`. So a
    // character the user added to the manual captain candidate list (even without a
    // requiredCharacterId lock) is eligible for promotion — the algorithm respects the user's
    // candidate order instead of silently filtering no-text characters out.
    const noCaptainLeader = loadGeneratedCharacterRecord(1);
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue([noCaptainLeader, ...createDualLeaderMixedTeamRecords()]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      [...AUTO_TEAM_BUILDER_CLASSES],
      [...AUTO_TEAM_BUILDER_TYPES],
      {
        manualSlots: createManualSlots({
          captain: [noCaptainLeader.id],
        }),
      },
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(noCaptainLeader.id);
  });

  it('keeps a required manual sub in its exact sub slot', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      manualSlots: createManualSlots(
        {
          sub2: [5880],
        },
        {
          sub2: 5880,
        },
      ),
    });

    expect(result).not.toBeNull();
    expect(result?.slots[3]?.character.id).toBe(5880);
    expect(result?.slots[3]?.reasonChips).toContain('Manual pick');
  });

  it('relaxes a manual sub pick that blocks final ability coverage', async () => {
    const createAbilitySub = (id: number, abilityKey: string): CharacterDetailRecord =>
      createCharacterRecord({
        id,
        primaryClass: 'Fighter',
        detail: {
          specialText: `Covers ${abilityKey}.`,
          builderAbilities: [
            {
              key: abilityKey,
              label: abilityKey,
              minTurns: null,
              isCompleteRemoval: false,
              slotTokens: [],
              source: 'specialText',
            },
          ],
        },
      });
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue([
        createCharacterRecord({
          id: 9100,
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of all characters by 5x and HP by 1.3x.',
          },
        }),
        createAbilitySub(9104, 'coverage_d'),
        createAbilitySub(9103, 'coverage_c'),
        createAbilitySub(9102, 'coverage_b'),
        createAbilitySub(9101, 'coverage_a'),
        createCharacterRecord({
          id: 9000,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts chain by 1.1x for 1 turn.',
          },
        }),
      ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      requiredAbilities: ['coverage_a', 'coverage_b', 'coverage_c', 'coverage_d'].map(
        (abilityKey) => ({
          abilityKey,
          minTurns: null,
          slotTokens: [],
          requiredCharacterCount: 1,
        }),
      ),
      manualSlots: createManualSlots({
        sub1: [9000],
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 9000)).toBe(false);
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
  });

  it('returns null when a required manual sub pick blocks final ability coverage', async () => {
    const createAbilitySub = (id: number, abilityKey: string): CharacterDetailRecord =>
      createCharacterRecord({
        id,
        primaryClass: 'Fighter',
        detail: {
          specialText: `Covers ${abilityKey}.`,
          builderAbilities: [
            {
              key: abilityKey,
              label: abilityKey,
              minTurns: null,
              isCompleteRemoval: false,
              slotTokens: [],
              source: 'specialText',
            },
          ],
        },
      });
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue([
        createCharacterRecord({
          id: 9100,
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of all characters by 5x and HP by 1.3x.',
          },
        }),
        createAbilitySub(9104, 'coverage_d'),
        createAbilitySub(9103, 'coverage_c'),
        createAbilitySub(9102, 'coverage_b'),
        createAbilitySub(9101, 'coverage_a'),
        createCharacterRecord({
          id: 9000,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts chain by 1.1x for 1 turn.',
          },
        }),
      ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      requiredAbilities: ['coverage_a', 'coverage_b', 'coverage_c', 'coverage_d'].map(
        (abilityKey) => ({
          abilityKey,
          minTurns: null,
          slotTokens: [],
          requiredCharacterCount: 1,
        }),
      ),
      manualSlots: createManualSlots(
        {
          sub1: [9000],
        },
        {
          sub1: 9000,
        },
      ),
    });

    expect(result).toBeNull();
  });

  it('falls back to auto leaders when a manual captain pick cannot be used', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      manualSlots: createManualSlots({
        captain: [999999],
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).not.toBe(999999);
    expect(result?.slots[1]?.character.id).not.toBe(999999);
  });

  it('returns null when a required manual captain pick cannot be used', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      manualSlots: createManualSlots(
        {
          captain: [999999],
        },
        {
          captain: 999999,
        },
      ),
    });

    expect(result).toBeNull();
  });

  it('still returns null when no team can be built after relaxing manual picks', async () => {
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue(createInsufficientStrictClassTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX'], {
      requireAllSelectedClassesPerCharacter: true,
      manualSlots: createManualSlots({
        sub1: [999999],
      }),
    });

    expect(result).toBeNull();
  });

  it('returns null when a selected leader is outside the locked picks', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      lockedCharacterIds: [5926],
      captainCharacterId: 5925,
      friendCaptainCharacterId: 5925,
    });

    expect(result).toBeNull();
    expect(repository.getAutoBuilderCandidates).not.toHaveBeenCalled();
  });

  it('keeps a non-favorite legacy leader while querying the auto-fill pool from favorites only', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const favoriteCharacterIds = [5926, 5880, 5870, 5860];

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      favoritesOnly: true,
      favoriteCharacterIds,
      lockedCharacterIds: [5925],
      captainCharacterId: 5925,
      friendCaptainCharacterId: 5925,
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(5925);
    expect(result?.slots[1]?.character.id).toBe(5925);
    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX', 'PSY'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter', 'Slasher'],
        allowedCharacterIds: favoriteCharacterIds,
        lockedCharacterIds: [5925],
        excludedCharacterIds: [],
      },
    );
  });

  it('returns requestedInput and no relaxation metadata when exact coverage succeeds', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY']);

    expect(result).not.toBeNull();
    expect(result?.requestedInput.selectedClasses).toEqual(['Fighter', 'Slasher']);
    expect(result?.requestedInput.types).toEqual(['DEX', 'PSY']);
    expect(result?.relaxation).toEqual({
      usedFallback: false,
      droppedTypes: [],
      droppedClasses: [],
      droppedCharacterTags: [],
      droppedCharacterNames: [],
      minimumLeaderSuperEffectMatchingSlots: null,
      allowedLeadersWithSuperEffects: false,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: false,
      ignoredSuperTandemCriteria: false,
    });
  });

  it('relaxes leader super special criteria before dropping classes or types', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue([
        createLeaderWithSuperCriteriaRecord(
          7001,
          'Monkey D. Luffy',
          createNonRosterSuperCriteria(),
        ),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createCharacterRecord({
          id: 7002,
          name: 'Roronoa Zoro',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts chain by 1.2x for 1 turn.',
          },
        }),
      ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX']);

    expect(result).not.toBeNull();
    expect(result?.requestedInput.requireLeaderSuperSpecialCriteria).toBe(true);
    expect(result?.input.requireLeaderSuperSpecialCriteria).toBe(false);
    expect(result?.relaxation).toEqual({
      usedFallback: true,
      droppedTypes: [],
      droppedClasses: [],
      droppedCharacterTags: [],
      droppedCharacterNames: [],
      minimumLeaderSuperEffectMatchingSlots: null,
      allowedLeadersWithSuperEffects: true,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: true,
      ignoredSuperTandemCriteria: false,
      ignoredSuperSpecialCriteriaCharacterNames: ['Monkey D. Luffy'],
    });
  });

  it('still allows the leader super special fallback when type or class strict mode is enabled', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue([
        createLeaderWithSuperCriteriaRecord(
          7101,
          'Monkey D. Luffy',
          createNonRosterSuperCriteria(),
        ),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createCharacterRecord({
          id: 7102,
          name: 'Roronoa Zoro',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts chain by 1.2x for 1 turn.',
          },
        }),
      ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      requireAllSelectedTypesInTeam: true,
    });

    expect(result).not.toBeNull();
    expect(result?.input.requireLeaderSuperSpecialCriteria).toBe(false);
    expect(result?.relaxation.ignoredLeaderSuperSpecialCriteria).toBe(true);
    expect(result?.relaxation.droppedTypes).toEqual([]);
    expect(result?.relaxation.droppedClasses).toEqual([]);
  });

  it('relaxes the leader super effect scope filter one matching slot at a time', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue([
        createLeaderWithSuperEffectScopeRecord(7240, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superTypeEffect: 'Changes DEX characters to Super DEX.',
        }),
        createSuperEffectScopeSubRecord(7241, {
          type: 'DEX',
          primaryClass: 'Fighter',
        }),
        createSuperEffectScopeSubRecord(7242, {
          type: 'DEX',
          primaryClass: 'Slasher',
        }),
        createSuperEffectScopeSubRecord(7243, {
          type: 'DEX',
          primaryClass: 'Driven',
        }),
        createSuperEffectScopeSubRecord(7244, {
          type: 'STR',
          primaryClass: 'Powerhouse',
        }),
        createSuperEffectScopeSubRecord(7245, {
          type: 'STR',
          primaryClass: 'Shooter',
        }),
      ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      requireAllSlotsInLeaderSuperEffectScope: true,
    });

    expect(result).toBeNull();
  });

  it('relaxes an invalid manual friend captain while preserving strict leader super effect scope', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue([
        createLeaderWithSuperEffectScopeRecord(7250, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superTypeEffect: 'Changes DEX characters to Super DEX.',
        }),
        createLeaderWithSuperEffectScopeRecord(7251, {
          type: 'PSY',
          primaryClass: 'Striker',
          superClassEffect: 'Transforms Fighter characters into Super Fighter characters.',
        }),
        createCharacterRecord({
          id: 7252,
          name: 'Roronoa Zoro',
          type: 'DEX',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts chain by 1.2x for 1 turn.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
      ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      requireAllSlotsInLeaderSuperEffectScope: true,
      requireLeaderSuperSpecialCriteria: true,
      captainCharacterId: 7250,
      friendCaptainCharacterId: 7251,
      lockedCharacterIds: [7250, 7251],
    });

    expect(result).not.toBeNull();
    expect(result?.slots[1]?.character.id).not.toBe(7251);
    expect(result?.slots.every((slot) => slot.character.type.includes('DEX'))).toBe(true);
    expect(result?.relaxation.ignoredLeaderSuperEffectScope).toBe(false);
  });

  it('allows super leaders before dropping types or classes when the default exact attempt fails', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue([
        createLeaderWithSuperEffectScopeRecord(7256, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superTypeEffect: 'Changes DEX characters to Super DEX.',
        }),
        createLeaderWithSuperEffectScopeRecord(7257, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superClassEffect: 'Transforms Fighter characters into Super Fighter characters.',
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX']);

    expect(result).not.toBeNull();
    expect(result?.requestedInput.requireAllSlotsInLeaderSuperEffectScope).toBe(false);
    expect(result?.input.requireAllSlotsInLeaderSuperEffectScope).toBe(false);
    expect(result?.relaxation.usedFallback).toBe(true);
    expect(result?.relaxation.allowedLeadersWithSuperEffects).toBe(true);
    expect(result?.relaxation.droppedTypes).toEqual([]);
    expect(result?.relaxation.droppedClasses).toEqual([]);
    expect([7256, 7257]).toContain(result?.slots[0]?.character.id ?? -1);
    expect([7256, 7257]).toContain(result?.slots[1]?.character.id ?? -1);
  });

  it('re-allows super leaders before dropping types during flexible fallback attempts', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX', 'INT'], {
      requireFullCaptainAbilityCoverage: false,
      requireSuperTandemCriteria: false,
    });

    expect(result).not.toBeNull();
    expect(result?.relaxation.usedFallback).toBe(true);
    expect(result?.relaxation.allowedLeadersWithSuperEffects).toBe(true);
    expect(result?.relaxation.droppedTypes).toEqual(['INT']);
  });

  it('keeps the requested strict super scope enabled when no selected unit has super effects', async () => {
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue([
          createCaptainRecord(),
          createAtkSubRecord(),
          createAffinitySubRecord(),
          createUtilitySubRecord(),
          createConsistencySubRecord(),
        ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      requireAllSlotsInLeaderSuperEffectScope: true,
    });

    expect(result).not.toBeNull();
    expect(result?.requestedInput.requireAllSlotsInLeaderSuperEffectScope).toBe(true);
    expect(result?.input.requireAllSlotsInLeaderSuperEffectScope).toBe(true);
    expect(result?.relaxation.allowedLeadersWithSuperEffects).toBe(false);
  });

  it('drops the weakest uncovered class in flexible mode when exact class coverage fails', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Shooter'], ['DEX'], {
      requireFullCaptainAbilityCoverage: false,
      requireSuperTandemCriteria: false,
    });

    expect(result).not.toBeNull();
    expect(result?.requestedInput.selectedClasses).toEqual(['Fighter', 'Shooter']);
    expect(result?.input.selectedClasses).toEqual(['Fighter']);
    expect(result?.relaxation).toEqual({
      usedFallback: true,
      droppedTypes: [],
      droppedClasses: ['Shooter'],
      droppedCharacterTags: [],
      droppedCharacterNames: [],
      minimumLeaderSuperEffectMatchingSlots: null,
      allowedLeadersWithSuperEffects: true,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: true,
      ignoredSuperTandemCriteria: false,
    });
  });

  it('relaxes class coverage independently of removed special-support rules', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createTeamwideSpecialScopedRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Shooter'], ['DEX', 'PSY']);

    expect(result).not.toBeNull();
    expect(result?.requestedInput.selectedClasses).toEqual(['Fighter', 'Shooter']);
    expect(result?.input.selectedClasses).toEqual(['Fighter']);
  });

  it('drops the weakest uncovered type in flexible mode when exact type coverage fails', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX', 'INT'], {
      requireFullCaptainAbilityCoverage: false,
      requireSuperTandemCriteria: false,
    });

    expect(result).not.toBeNull();
    expect(result?.requestedInput.types).toEqual(['DEX', 'INT']);
    expect(result?.input.types).toEqual(['DEX']);
    expect(result?.relaxation).toEqual({
      usedFallback: true,
      droppedTypes: ['INT'],
      droppedClasses: [],
      droppedCharacterTags: [],
      droppedCharacterNames: [],
      minimumLeaderSuperEffectMatchingSlots: null,
      allowedLeadersWithSuperEffects: true,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: true,
      ignoredSuperTandemCriteria: false,
    });
  });

  it('drops relaxed character tag and name filters when fallback needs to recover a team', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      selectedCharacterTags: ['Minks'],
      selectedCharacterNames: ['zoro'],
      requireFullCaptainAbilityCoverage: false,
      requireSuperTandemCriteria: false,
    });

    expect(result).not.toBeNull();
    expect(result?.input.selectedCharacterTags).toEqual([]);
    expect(result?.input.selectedCharacterNames).toEqual([]);
    expect(result?.relaxation.droppedCharacterTags).toEqual(['Minks']);
    expect(result?.relaxation.droppedCharacterNames).toEqual(['zoro']);
  });

  it('does not relax filters when any strict toggle is enabled', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX', 'INT'], {
      requireAllSelectedTypesInTeam: true,
    });

    expect(result).toBeNull();
  });

  it('forwards progress snapshots from the worker runtime', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const worker = new FakeWorker((request) => {
      if (request.type !== 'run') {
        throw new Error(`Unexpected request type: ${request.type}`);
      }

      worker.emitMessage({
        type: 'progress',
        runId: request.runId,
        snapshot: {
          stage: 'exactAttempt',
          candidateCount: 6,
          completedAttempts: 0,
          totalAttempts: 1,
          attemptCountFinal: false,
          elapsedMs: 12,
          estimatedRemainingMs: null,
          averageFallbackAttemptMs: null,
          completedFallbackAttempts: 0,
          currentDroppedTypes: [],
          currentDroppedClasses: [],
          currentAllowedLeadersWithSuperEffects: false,
          currentIgnoredLeaderSuperSpecialCriteria: false,
          messageKey: 'progress.exactAttempt',
          messageParams: {
            current: 1,
            total: 1,
          },
        },
      });
      worker.emitMessage({
        type: 'result',
        runId: request.runId,
        result: null,
      });
    });
    const progressSnapshots: AutoBuildProgressSnapshot[] = [];

    const createWorkerSpy = vi.spyOn(
      service as unknown as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValue(worker as never);

    await service.buildTeam(
      ['Fighter', 'Slasher'],
      ['DEX', 'PSY'],
      {},
      {
        onProgress: (snapshot) => progressSnapshots.push(snapshot),
      },
    );

    expect(progressSnapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: 'loadingCandidates',
          elapsedMs: 0,
          estimatedRemainingMs: null,
          averageFallbackAttemptMs: null,
          completedFallbackAttempts: 0,
        }),
        expect.objectContaining({
          stage: 'exactAttempt',
          elapsedMs: 12,
          estimatedRemainingMs: null,
          averageFallbackAttemptMs: null,
          completedFallbackAttempts: 0,
          messageKey: 'progress.exactAttempt',
          messageParams: {
            current: 1,
            total: 1,
          },
        }),
      ]),
    );
  });

  it('rejects with cancellation and terminates the worker when the signal aborts', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const worker = new FakeWorker();
    const abortController = new AbortController();

    const createWorkerSpy = vi.spyOn(
      service as unknown as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValue(worker as never);

    const buildPromise = service.buildTeam(
      ['Fighter', 'Slasher'],
      ['DEX', 'PSY'],
      {},
      {
        signal: abortController.signal,
      },
    );

    await Promise.resolve();
    abortController.abort();

    await expect(buildPromise).rejects.toBeInstanceOf(AutoTeamBuildCancelledError);
    expect(worker.terminated).toBe(true);
  });

  it('falls back to the main-thread engine when no worker is available', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const createWorkerSpy = vi.spyOn(
      service as unknown as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValue(null);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY']);

    expect(createWorkerSpy).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
    expect(result?.relaxation.usedFallback).toBe(false);
    expect(result?.coverage.coversAllSelectedClasses).toBe(true);
  });

  it('keeps the single-worker search path when workerCount is 1', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const worker = new FakeWorker((request) => {
      if (request.type !== 'run') {
        throw new Error(`Unexpected request type: ${request.type}`);
      }

      worker.emitMessage({
        type: 'result',
        runId: request.runId,
        result: null,
      });
    });
    const createWorkerSpy = vi.spyOn(
      service as unknown as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValue(worker as never);

    await service.buildTeam(
      ['Fighter', 'Slasher'],
      ['DEX', 'PSY'],
      {},
      {
        workerCount: 1,
      },
    );

    expect(worker.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'run',
        }),
      ]),
    );
  });

  it('grows the pooled worker count for later fallback attempts when getWorkerCount increases', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    let desiredWorkerCount = 2;
    let deferredWorkerARunId: string | null = null;
    let deferredWorkerBRunId: string | null = null;
    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type !== 'runAttempt') {
        return;
      }

      if (
        request.input.types.length === 2 &&
        request.input.selectedClasses.length === 1 &&
        request.requireLeadersWithoutSuperEffects
      ) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
        return;
      }

      if (deferredWorkerARunId === null) {
        deferredWorkerARunId = request.runId;
        return;
      }

      workerA.emitMessage({
        type: 'result',
        runId: request.runId,
        result: buildWorkerResult(createInput(['DEX'], ['Fighter'])),
      });
    });
    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type === 'runAttempt' && deferredWorkerBRunId === null) {
        deferredWorkerBRunId = request.runId;
        return;
      }

      if (request.type === 'runAttempt') {
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
      }
    });
    const workerC = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerC.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type === 'runAttempt') {
        workerC.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(['DEX'], ['Fighter'])),
        });
      }
    });
    const createWorkerSpy = vi.spyOn(
      service as unknown as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy
      .mockReturnValueOnce(workerA as never)
      .mockReturnValueOnce(workerB as never)
      .mockReturnValueOnce(workerC as never);

    const buildPromise = service.buildTeam(
      ['Fighter'],
      ['DEX', 'INT'],
      { requireLeaderSuperSpecialCriteria: false },
      {
        workerCount: 2,
        getWorkerCount: () => desiredWorkerCount,
      },
    );

    await flushMicrotasks();

    desiredWorkerCount = 3;

    workerA.emitMessage({
      type: 'result',
      runId: deferredWorkerARunId,
      result: null,
    });

    await flushMicrotasks();

    expect(createWorkerSpy).toHaveBeenCalledTimes(3);
    expect(workerC.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'init',
        }),
      ]),
    );

    workerB.emitMessage({
      type: 'result',
      runId: deferredWorkerBRunId,
      result: null,
    });

    const result = await buildPromise;

    expect(result?.input.types).toEqual(['DEX']);
    expect(workerC.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'runAttempt',
        }),
      ]),
    );
  });

  it('keeps exact result priority when a speculative fallback finishes first', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    let exactRunId: string | null = null;
    const fallbackResult = buildWorkerResult(createInput(['DEX'], ['Fighter']));
    const exactResult = buildWorkerResult(createInput(['DEX', 'INT'], ['Fighter']));
    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type === 'runAttempt') {
        exactRunId = request.runId;
      }
    });
    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type === 'runAttempt') {
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: fallbackResult,
        });
      }
    });
    const createWorkerSpy = vi.spyOn(
      service as unknown as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValueOnce(workerA as never).mockReturnValueOnce(workerB as never);

    let settled = false;
    const buildPromise = service
      .buildTeam(
        ['Fighter'],
        ['DEX', 'INT'],
        {
          requireFullCaptainAbilityCoverage: false,
          requireLeaderSuperSpecialCriteria: false,
          requireSuperTandemCriteria: false,
        },
        { workerCount: 2 },
      )
      .then((result) => {
        settled = true;
        return result;
      });

    await flushMicrotasks();

    expect(settled).toBe(false);
    expect(exactRunId).not.toBeNull();

    workerA.emitMessage({
      type: 'result',
      runId: exactRunId,
      result: exactResult,
    });

    const result = await buildPromise;

    expect(result?.input).toEqual(exactResult.input);
    expect(result?.input).not.toEqual(fallbackResult.input);
  });

  it('reuses a speculative fallback result when the exact attempt fails', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    let exactRunId: string | null = null;
    let fallbackRunAttemptCount = 0;
    const fallbackResult = buildWorkerResult(createInput(['DEX'], ['Fighter']));
    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type === 'runAttempt') {
        exactRunId = request.runId;
      }
    });
    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type === 'runAttempt') {
        fallbackRunAttemptCount += 1;
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: fallbackResult,
        });
      }
    });
    const createWorkerSpy = vi.spyOn(
      service as unknown as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValueOnce(workerA as never).mockReturnValueOnce(workerB as never);

    let settled = false;
    const buildPromise = service
      .buildTeam(
        ['Fighter'],
        ['DEX', 'INT'],
        {
          requireFullCaptainAbilityCoverage: false,
          requireLeaderSuperSpecialCriteria: false,
          requireSuperTandemCriteria: false,
        },
        { workerCount: 2 },
      )
      .then((result) => {
        settled = true;
        return result;
      });

    await flushMicrotasks();

    expect(settled).toBe(false);
    expect(exactRunId).not.toBeNull();
    expect(fallbackRunAttemptCount).toBe(1);

    workerA.emitMessage({
      type: 'result',
      runId: exactRunId,
      result: null,
    });

    const result = await buildPromise;

    expect(result?.input).toEqual(fallbackResult.input);
    expect(fallbackRunAttemptCount).toBe(1);
  });

  it('shrinks idle pooled workers immediately when the desired worker count is lower', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    let workerARunAttemptCount = 0;
    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type !== 'runAttempt') {
        return;
      }

      workerARunAttemptCount += 1;
      workerA.emitMessage({
        type: 'result',
        runId: request.runId,
        result:
          workerARunAttemptCount === 1
            ? null
            : buildWorkerResult(createInput(['DEX'], ['Fighter'])),
      });
    });
    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({ type: 'ready' });
      }
    });
    const workerC = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerC.emitMessage({ type: 'ready' });
      }
    });
    const createWorkerSpy = vi.spyOn(
      service as unknown as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy
      .mockReturnValueOnce(workerA as never)
      .mockReturnValueOnce(workerB as never)
      .mockReturnValueOnce(workerC as never);

    const result = await service.buildTeam(
      ['Fighter'],
      ['DEX', 'INT'],
      { requireLeaderSuperSpecialCriteria: false },
      {
        workerCount: 3,
        getWorkerCount: () => 1,
      },
    );

    expect(result?.input.types).toEqual(['DEX']);
    expect(workerB.requests).toEqual([
      expect.objectContaining({
        type: 'init',
      }),
    ]);
    expect(workerC.requests).toEqual([
      expect.objectContaining({
        type: 'init',
      }),
    ]);
    expect(workerB.terminated).toBe(true);
    expect(workerC.terminated).toBe(true);
  });

  it('retires busy pooled workers after their current attempt completes', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const abortController = new AbortController();
    let desiredWorkerCount = 3;
    let deferredWorkerARunId: string | null = null;
    let deferredWorkerBRunId: string | null = null;
    let deferredWorkerCRunId: string | null = null;

    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type !== 'runAttempt') {
        return;
      }

      if (
        request.input.types.length === 2 &&
        request.input.selectedClasses.length === 1 &&
        request.requireLeadersWithoutSuperEffects
      ) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
        return;
      }

      deferredWorkerARunId ??= request.runId;
    });
    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type === 'runAttempt') {
        deferredWorkerBRunId ??= request.runId;
      }
    });
    const workerC = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerC.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type !== 'runAttempt') {
        return;
      }

      deferredWorkerCRunId ??= request.runId;
    });
    const createWorkerSpy = vi.spyOn(
      service as unknown as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy
      .mockReturnValueOnce(workerA as never)
      .mockReturnValueOnce(workerB as never)
      .mockReturnValueOnce(workerC as never);

    const buildPromise = service.buildTeam(
      ['Fighter'],
      ['DEX', 'INT'],
      { requireLeaderSuperSpecialCriteria: false },
      {
        workerCount: 3,
        getWorkerCount: () => desiredWorkerCount,
        signal: abortController.signal,
      },
    );
    void buildPromise.catch(() => undefined);

    await flushMicrotasks();
    await flushMicrotasks();

    expect(deferredWorkerARunId).not.toBeNull();
    expect(deferredWorkerBRunId).not.toBeNull();
    expect(deferredWorkerCRunId).not.toBeNull();

    desiredWorkerCount = 1;

    workerA.emitMessage({
      type: 'result',
      runId: deferredWorkerARunId,
      result: null,
    });

    await flushMicrotasks();

    expect(workerA.terminated).toBe(true);
    expect(workerB.terminated).toBe(false);

    workerB.emitMessage({
      type: 'result',
      runId: deferredWorkerBRunId,
      result: null,
    });

    await flushMicrotasks();

    expect(workerB.terminated).toBe(true);

    abortController.abort();
    await flushMicrotasks();
  });

  it('continues pooled fallback work when live worker growth initialization fails', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    let desiredWorkerCount = 2;
    let deferredWorkerARunId: string | null = null;
    let deferredWorkerBRunId: string | null = null;

    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type !== 'runAttempt') {
        return;
      }

      if (
        request.input.types.length === 2 &&
        request.input.selectedClasses.length === 1 &&
        request.requireLeadersWithoutSuperEffects
      ) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
        return;
      }

      if (deferredWorkerARunId === null) {
        deferredWorkerARunId = request.runId;
        return;
      }

      workerA.emitMessage({
        type: 'result',
        runId: request.runId,
        result: buildWorkerResult(createInput(['DEX'], ['Fighter'])),
      });
    });
    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type === 'runAttempt' && deferredWorkerBRunId === null) {
        deferredWorkerBRunId = request.runId;
        return;
      }

      if (request.type === 'runAttempt') {
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
      }
    });
    const workerC = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerC.emitMessage({
          type: 'error',
          errorMessage: 'dynamic init failed',
        });
      }
    });
    const createWorkerSpy = vi.spyOn(
      service as unknown as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy
      .mockReturnValueOnce(workerA as never)
      .mockReturnValueOnce(workerB as never)
      .mockReturnValueOnce(workerC as never);

    const buildPromise = service.buildTeam(
      ['Fighter'],
      ['DEX', 'INT'],
      { requireLeaderSuperSpecialCriteria: false },
      {
        workerCount: 2,
        getWorkerCount: () => desiredWorkerCount,
      },
    );

    await flushMicrotasks();

    desiredWorkerCount = 3;

    workerA.emitMessage({
      type: 'result',
      runId: deferredWorkerARunId,
      result: null,
    });

    await flushMicrotasks();

    expect(createWorkerSpy).toHaveBeenCalledTimes(3);
    expect(workerC.terminated).toBe(true);

    workerB.emitMessage({
      type: 'result',
      runId: deferredWorkerBRunId,
      result: null,
    });

    const result = await buildPromise;

    expect(result?.input.types).toEqual(['DEX']);
  });

  it('uses the current active pooled worker count when estimating remaining fallback time', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const abortController = new AbortController();
    const progressSnapshots: AutoBuildProgressSnapshot[] = [];
    let desiredWorkerCount = 2;
    let now = 0;
    let deferredWorkerARunId: string | null = null;
    let deferredWorkerBRunId: string | null = null;
    const performanceNowSpy = vi.spyOn(globalThis.performance, 'now').mockImplementation(() => now);

    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type !== 'runAttempt') {
        return;
      }

      if (
        request.input.types.length === 2 &&
        request.input.selectedClasses.length === 1 &&
        request.requireLeadersWithoutSuperEffects
      ) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
        return;
      }

      deferredWorkerARunId ??= request.runId;
    });
    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type === 'runAttempt') {
        deferredWorkerBRunId ??= request.runId;
      }
    });
    const workerC = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerC.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type !== 'runAttempt') {
        return;
      }
    });
    const createWorkerSpy = vi.spyOn(
      service as unknown as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy
      .mockReturnValueOnce(workerA as never)
      .mockReturnValueOnce(workerB as never)
      .mockReturnValueOnce(workerC as never);

    try {
      const buildPromise = service.buildTeam(
        ['Fighter'],
        ['DEX', 'INT'],
        { requireLeaderSuperSpecialCriteria: false },
        {
          workerCount: 2,
          getWorkerCount: () => desiredWorkerCount,
          signal: abortController.signal,
          onProgress: (snapshot) => progressSnapshots.push(snapshot),
        },
      );
      void buildPromise.catch(() => undefined);

      await flushMicrotasks();
      await flushMicrotasks();

      expect(deferredWorkerARunId).not.toBeNull();
      expect(deferredWorkerBRunId).not.toBeNull();

      desiredWorkerCount = 3;
      now = 100;
      workerA.emitMessage({
        type: 'result',
        runId: deferredWorkerARunId,
        result: null,
      });

      await flushMicrotasks();

      abortController.abort();
      await flushMicrotasks();
    } finally {
      performanceNowSpy.mockRestore();
    }

    const resizedSnapshot = [...progressSnapshots]
      .reverse()
      .find(
        (snapshot) =>
          snapshot.stage === 'fallbackAttempt' &&
          snapshot.completedFallbackAttempts >= 1 &&
          snapshot.averageFallbackAttemptMs !== null &&
          (snapshot.estimatedRemainingMs ?? 0) > 0,
      );

    expect(resizedSnapshot).toBeDefined();

    const remainingFallbackAttempts = Math.max(
      resizedSnapshot!.totalAttempts - resizedSnapshot!.completedAttempts - 1,
      0,
    );
    const remainingAndInFlightAttempts = remainingFallbackAttempts + 1;
    const threeWorkerEstimate =
      (resizedSnapshot!.averageFallbackAttemptMs! * remainingAndInFlightAttempts) / 3;
    const twoWorkerEstimate =
      (resizedSnapshot!.averageFallbackAttemptMs! * remainingAndInFlightAttempts) / 2;

    expect(resizedSnapshot!.estimatedRemainingMs).toBe(threeWorkerEstimate);
    expect(resizedSnapshot!.estimatedRemainingMs).not.toBe(twoWorkerEstimate);
  });

  it('resolves a later valid pooled fallback result without waiting for earlier in-flight attempts', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const deferredFallbacks: Array<{ worker: PooledFakeWorker; runId: string }> = [];
    let deferredValidFallback: { worker: PooledFakeWorker; runId: string } | null = null;
    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type !== 'runAttempt') {
        return;
      }

      if (
        request.input.types.length === 2 &&
        request.input.selectedClasses.length === 1 &&
        request.requireLeadersWithoutSuperEffects
      ) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
        return;
      }

      if (
        request.input.types.length === 2 &&
        request.input.selectedClasses.length === 1 &&
        !request.requireLeadersWithoutSuperEffects
      ) {
        deferredFallbacks.push({ worker: workerA, runId: request.runId });
        return;
      }

      if (request.input.types.length === 2 && request.input.selectedClasses.length === 0) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
        return;
      }

      if (request.input.types.length === 1 && request.input.selectedClasses.length === 1) {
        deferredValidFallback = { worker: workerA, runId: request.runId };
      }
    });
    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({ type: 'ready' });
        return;
      }

      if (
        request.type === 'runAttempt' &&
        request.input.types.length === 2 &&
        request.input.selectedClasses.length === 1 &&
        !request.requireLeadersWithoutSuperEffects
      ) {
        deferredFallbacks.push({ worker: workerB, runId: request.runId });
        return;
      }

      if (
        request.type === 'runAttempt' &&
        request.input.types.length === 2 &&
        request.input.selectedClasses.length === 0
      ) {
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
        return;
      }

      if (
        request.type === 'runAttempt' &&
        request.input.types.length === 1 &&
        request.input.selectedClasses.length === 1
      ) {
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(['DEX'], ['Fighter'])),
        });
      }
    });
    const createWorkerSpy = vi.spyOn(
      service as unknown as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValueOnce(workerA as never).mockReturnValueOnce(workerB as never);

    let settled = false;
    const buildPromise = service
      .buildTeam(
        ['Fighter'],
        ['DEX', 'INT'],
        {
          requireFullCaptainAbilityCoverage: false,
          requireLeaderSuperSpecialCriteria: false,
          requireSuperTandemCriteria: false,
        },
        { workerCount: 2 },
      )
      .then((result) => {
        settled = true;
        return result;
      });

    await flushMicrotasks();
    await flushMicrotasks();
    expect(deferredFallbacks).toHaveLength(1);
    expect(deferredValidFallback).not.toBeNull();
    expect(settled).toBe(false);

    deferredValidFallback!.worker.emitMessage({
      type: 'result',
      runId: deferredValidFallback!.runId,
      result: buildWorkerResult(createInput(['DEX'], ['Fighter'])),
    });

    await flushMicrotasks();
    await flushMicrotasks();
    expect(settled).toBe(true);

    const result = await buildPromise;

    expect(result?.input.types).toEqual(['DEX']);
    expect(result?.input.selectedClasses).toEqual(['Fighter']);
    expect(workerA.terminated).toBe(true);
    expect(workerB.terminated).toBe(true);
  });

  it('redispatches pooled fallback work on the next microtask without a timer-based pause', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    let deferredWorkerARunId: string | null = null;
    let deferredWorkerBRunId: string | null = null;
    let workerARunAttemptCount = 0;
    let workerBRunAttemptCount = 0;

    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type !== 'runAttempt') {
        return;
      }

      workerARunAttemptCount += 1;

      if (workerARunAttemptCount === 1) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
        return;
      }

      if (workerARunAttemptCount === 2) {
        deferredWorkerARunId = request.runId;
        return;
      }

      workerA.emitMessage({
        type: 'result',
        runId: request.runId,
        result: buildWorkerResult(createInput(['DEX'], ['Fighter'])),
      });
    });

    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type !== 'runAttempt') {
        return;
      }

      workerBRunAttemptCount += 1;

      if (workerBRunAttemptCount === 1) {
        deferredWorkerBRunId = request.runId;
      }
    });

    const createWorkerSpy = vi.spyOn(
      service as unknown as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValueOnce(workerA as never).mockReturnValueOnce(workerB as never);

    const buildPromise = service.buildTeam(
      ['Fighter'],
      ['DEX', 'INT'],
      { requireLeaderSuperSpecialCriteria: false },
      { workerCount: 2 },
    );

    await flushMicrotasks();

    expect(deferredWorkerARunId).not.toBeNull();
    expect(deferredWorkerBRunId).not.toBeNull();
    expect(workerARunAttemptCount).toBe(2);
    expect(workerBRunAttemptCount).toBe(1);

    workerA.emitMessage({
      type: 'result',
      runId: deferredWorkerARunId,
      result: null,
    });

    await flushMicrotasks();

    expect(workerARunAttemptCount).toBeGreaterThan(2);
    expect(workerBRunAttemptCount).toBe(1);

    workerB.emitMessage({
      type: 'result',
      runId: deferredWorkerBRunId,
      result: null,
    });

    const result = await buildPromise;

    expect(result?.input.types).toEqual(['DEX']);
    expect(result?.input.selectedClasses).toEqual(['Fighter']);
    expect(workerA.terminated).toBe(true);
    expect(workerB.terminated).toBe(true);
  });

  it('skips earlier pooled fallback results that miss requested coverage', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type !== 'runAttempt') {
        return;
      }

      if (request.input.types.length === 2 && request.input.selectedClasses.length === 1) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
        return;
      }

      if (request.input.types.length === 2 && request.input.selectedClasses.length === 0) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(['DEX', 'INT'], []), {
            coveredSelectedClasses: [],
            coversAllSelectedClasses: false,
            selectedClassMatches: 0,
          }),
        });
        return;
      }

      if (request.input.types.length === 1 && request.input.selectedClasses.length === 1) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(['DEX'], ['Fighter'])),
        });
      }
    });
    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({ type: 'ready' });
        return;
      }

      if (
        request.type === 'runAttempt' &&
        request.input.types.length === 2 &&
        request.input.selectedClasses.length === 1 &&
        !request.requireLeadersWithoutSuperEffects
      ) {
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
        return;
      }

      if (
        request.type === 'runAttempt' &&
        request.input.types.length === 2 &&
        request.input.selectedClasses.length === 0
      ) {
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(['DEX', 'INT'], []), {
            coveredSelectedClasses: [],
            coversAllSelectedClasses: false,
            selectedClassMatches: 0,
          }),
        });
        return;
      }

      if (
        request.type === 'runAttempt' &&
        request.input.types.length === 1 &&
        request.input.selectedClasses.length === 1
      ) {
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(['DEX'], ['Fighter'])),
        });
      }
    });
    const createWorkerSpy = vi.spyOn(
      service as unknown as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValueOnce(workerA as never).mockReturnValueOnce(workerB as never);

    const result = await service.buildTeam(
      ['Fighter'],
      ['DEX', 'INT'],
      { requireLeaderSuperSpecialCriteria: false },
      { workerCount: 2 },
    );

    expect(result?.input.types).toEqual(['DEX']);
    expect(result?.input.selectedClasses).toEqual(['Fighter']);
    expect(result?.coverage.coversAllSelectedClasses).toBe(true);
  });

  it('skips earlier pooled fallback results that miss required ability coverage', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type !== 'runAttempt') {
        return;
      }

      if (request.input.types.length === 2 && request.input.selectedClasses.length === 1) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
        return;
      }

      if (request.input.types.length === 2 && request.input.selectedClasses.length === 0) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(['DEX', 'INT'], []), {
            coveredSelectedClasses: ['Fighter'],
            coversAllSelectedClasses: true,
            selectedClassMatches: 1,
            abilityRequirements: {
              matched: [],
              missing: [
                {
                  abilityKey: 'remove_bind',
                  minTurns: null,
                  slotTokens: [],
                  requiredCharacterCount: 1,
                },
              ],
              matchesAll: false,
            },
          }),
        });
        return;
      }

      if (request.input.types.length === 1 && request.input.selectedClasses.length === 1) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(['DEX'], ['Fighter'])),
        });
      }
    });
    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({ type: 'ready' });
        return;
      }

      if (
        request.type === 'runAttempt' &&
        request.input.types.length === 2 &&
        request.input.selectedClasses.length === 1 &&
        !request.requireLeadersWithoutSuperEffects
      ) {
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
        return;
      }

      if (
        request.type === 'runAttempt' &&
        request.input.types.length === 2 &&
        request.input.selectedClasses.length === 0
      ) {
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(['DEX', 'INT'], []), {
            coveredSelectedClasses: ['Fighter'],
            coversAllSelectedClasses: true,
            selectedClassMatches: 1,
            abilityRequirements: {
              matched: [],
              missing: [
                {
                  abilityKey: 'remove_bind',
                  minTurns: null,
                  slotTokens: [],
                  requiredCharacterCount: 1,
                },
              ],
              matchesAll: false,
            },
          }),
        });
        return;
      }

      if (
        request.type === 'runAttempt' &&
        request.input.types.length === 1 &&
        request.input.selectedClasses.length === 1
      ) {
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(['DEX'], ['Fighter'])),
        });
      }
    });
    const createWorkerSpy = vi.spyOn(
      service as unknown as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValueOnce(workerA as never).mockReturnValueOnce(workerB as never);

    const result = await service.buildTeam(
      ['Fighter'],
      ['DEX', 'INT'],
      { requireLeaderSuperSpecialCriteria: false },
      { workerCount: 2 },
    );

    expect(result?.input.types).toEqual(['DEX']);
    expect(result?.input.selectedClasses).toEqual(['Fighter']);
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
  });

  it('returns null when pooled fallback results never satisfy requested coverage', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type !== 'runAttempt') {
        return;
      }

      if (request.input.types.length === 2 && request.input.selectedClasses.length === 1) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
        return;
      }

      if (request.input.selectedClasses.length === 0) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(request.input.types, []), {
            coveredSelectedClasses: [],
            coversAllSelectedClasses: false,
            selectedClassMatches: 0,
          }),
        });
        return;
      }

      workerA.emitMessage({
        type: 'result',
        runId: request.runId,
        result: null,
      });
    });
    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type !== 'runAttempt') {
        return;
      }

      if (request.input.types.length === 1 && request.input.selectedClasses.length === 1) {
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(request.input.types, ['Fighter']), {
            abilityRequirements: {
              matched: [],
              missing: [
                {
                  abilityKey: 'remove_bind',
                  minTurns: null,
                  slotTokens: [],
                  requiredCharacterCount: 1,
                },
              ],
              matchesAll: false,
            },
          }),
        });
        return;
      }

      workerB.emitMessage({
        type: 'result',
        runId: request.runId,
        result: null,
      });
    });
    const createWorkerSpy = vi.spyOn(
      service as unknown as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValueOnce(workerA as never).mockReturnValueOnce(workerB as never);

    const result = await service.buildTeam(
      ['Fighter'],
      ['DEX', 'INT'],
      { requireFullCaptainAbilityCoverage: false },
      { workerCount: 2 },
    );

    expect(result).toBeNull();
    expect(workerA.terminated).toBe(true);
    expect(workerB.terminated).toBe(true);
  });

  it('reports bounded pooled fallback progress for the preferred leader fast path', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const progressSnapshots: AutoBuildProgressSnapshot[] = [];
    const successfulWorkerResult = buildAutoTeamResult(
      createStrictMixedTeamRecords(),
      createInput(['DEX'], ['Fighter', 'Slasher']),
    );
    let runAttemptCount = 0;

    expect(successfulWorkerResult).not.toBeNull();

    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type === 'runAttempt') {
        runAttemptCount += 1;
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: runAttemptCount === 1 ? null : successfulWorkerResult,
        });
      }
    });
    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type === 'runAttempt') {
        runAttemptCount += 1;
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: runAttemptCount === 1 ? null : successfulWorkerResult,
        });
      }
    });
    const createWorkerSpy = vi.spyOn(
      service as unknown as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValueOnce(workerA as never).mockReturnValueOnce(workerB as never);

    const result = await service.buildTeam(
      createSyntheticClasses(8),
      ['DEX', 'STR', 'QCK', 'PSY'],
      {
        requireLeaderSuperSpecialCriteria: true,
      },
      {
        workerCount: 2,
        onProgress: (snapshot) => progressSnapshots.push(snapshot),
      },
    );

    expect(result).toBeNull();
    expect(runAttemptCount).toBeGreaterThanOrEqual(2);
    expect(
      progressSnapshots.find((snapshot) => snapshot.stage === 'exactAttempt')?.totalAttempts,
    ).toBe(257);
    expect(
      progressSnapshots.find(
        (snapshot) => snapshot.stage === 'fallbackAttempt' && snapshot.totalAttempts === 257,
      ),
    ).toBeDefined();
    expect(progressSnapshots.at(-1)?.totalAttempts).toBe(257);
    expect(progressSnapshots.at(-1)?.attemptCountFinal).toBe(true);
    expect(progressSnapshots.at(-1)?.stage).toBe('completed');
    expect(progressSnapshots.at(-1)?.totalAttempts).toBeLessThan(31_744);
  });

  it('composes initialized pooled worker attempt progress into UI snapshots', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const progressSnapshots: AutoBuildProgressSnapshot[] = [];
    const emitAttemptProgressThenMiss = (
      worker: PooledFakeWorker,
      request: AutoTeamBuilderWorkerRequest,
    ): void => {
      if (request.type === 'init') {
        worker.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type === 'runAttempt') {
        worker.emitMessage({
          type: 'attemptProgress',
          runId: request.runId,
          progress: {
            completedWorkUnits: 32,
            totalWorkUnits: 128,
            checkedCandidates: 32,
            totalCandidatesToCheck: 1161,
            currentCaptainId: 4556,
            currentCaptainName: 'Captain Test',
            currentFriendCaptainId: 4549,
            currentFriendCaptainName: 'Friend Test',
          },
        });
        worker.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
      }
    };
    const workerA = new PooledFakeWorker((request) =>
      emitAttemptProgressThenMiss(workerA, request),
    );
    const workerB = new PooledFakeWorker((request) =>
      emitAttemptProgressThenMiss(workerB, request),
    );
    const createWorkerSpy = vi.spyOn(
      service as unknown as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValueOnce(workerA as never).mockReturnValueOnce(workerB as never);

    await service.buildTeam(
      ['Fighter'],
      ['DEX', 'INT'],
      { requireFullCaptainAbilityCoverage: false },
      {
        workerCount: 2,
        onProgress: (snapshot) => progressSnapshots.push(snapshot),
      },
    );

    expect(
      progressSnapshots.find(
        (snapshot) =>
          (snapshot.stage === 'exactAttempt' || snapshot.stage === 'fallbackAttempt') &&
          snapshot.completedWorkUnits === 32 &&
          snapshot.totalWorkUnits === 128,
      ),
    ).toMatchObject({
      checkedCandidates: 32,
      totalCandidatesToCheck: 1161,
      activeWorkerCount: 2,
      currentCaptainId: 4556,
      currentCaptainName: 'Captain Test',
      currentFriendCaptainId: 4549,
      currentFriendCaptainName: 'Friend Test',
      messageKey: expect.stringMatching(/^progress\.(exactAttempt|fallbackAttempt)$/),
    });
  });

  it('throttles deep pooled fallback searches and keeps the preferred leader attempt set bounded', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const progressSnapshots: AutoBuildProgressSnapshot[] = [];
    const successfulWorkerResult = buildAutoTeamResult(
      createStrictMixedTeamRecords(),
      createInput(['DEX'], ['Fighter', 'Slasher']),
    );
    let runAttemptCount = 0;
    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type === 'runAttempt') {
        runAttemptCount += 1;
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: runAttemptCount === 1 ? null : successfulWorkerResult,
        });
      }
    });
    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type === 'runAttempt') {
        runAttemptCount += 1;
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: runAttemptCount === 1 ? null : successfulWorkerResult,
        });
      }
    });
    const createWorkerSpy = vi.spyOn(
      service as unknown as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValueOnce(workerA as never).mockReturnValueOnce(workerB as never);

    await expect(
      service.buildTeam(
        createSyntheticClasses(12),
        ['DEX', 'STR', 'QCK', 'PSY'],
        {
          requireLeaderSuperSpecialCriteria: true,
        },
        {
          workerCount: 4,
          getWorkerCount: () => 4,
          onProgress: (snapshot) => progressSnapshots.push(snapshot),
        },
      ),
    ).rejects.toBeInstanceOf(AutoTeamBuildSearchTooLargeError);

    expect(createWorkerSpy).toHaveBeenCalledTimes(2);
    expect(
      progressSnapshots.find((snapshot) => snapshot.stage === 'exactAttempt')?.totalAttempts,
    ).toBe(257);
    expect(progressSnapshots.some((snapshot) => snapshot.totalAttempts === 257)).toBe(true);
  });

  it('does not retry a deep pooled worker failure on the main thread', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type === 'runAttempt') {
        workerA.emitError();
      }
    });
    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({ type: 'ready' });
      }
    });
    const createWorkerSpy = vi.spyOn(
      service as unknown as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValueOnce(workerA as never).mockReturnValueOnce(workerB as never);

    await expect(
      service.buildTeam(
        createSyntheticClasses(12),
        ['DEX', 'STR', 'QCK', 'PSY'],
        {
          requireLeaderSuperSpecialCriteria: true,
        },
        {
          workerCount: 4,
        },
      ),
    ).rejects.toBeInstanceOf(AutoTeamBuildSearchTooLargeError);

    expect(createWorkerSpy).toHaveBeenCalledTimes(2);
  });

  it('falls back to the main-thread engine when pooled worker initialization fails', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
      }
    });
    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({
          type: 'error',
          errorMessage: 'init failed',
        });
      }
    });
    const createWorkerSpy = vi.spyOn(
      service as unknown as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValueOnce(workerA as never).mockReturnValueOnce(workerB as never);

    const result = await service.buildTeam(
      ['Fighter'],
      ['DEX', 'INT'],
      {
        requireFullCaptainAbilityCoverage: false,
        requireSuperTandemCriteria: false,
      },
      { workerCount: 2 },
    );

    expect(result).not.toBeNull();
    expect(result?.input.types).toEqual(['DEX']);
    expect(workerA.terminated).toBe(true);
    expect(workerB.terminated).toBe(true);
  });

  it('fails strict class mode when a forced leader does not match all selected classes', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5931,
          type: 'DEX',
          primaryClass: 'Fighter',
          secondaryClass: 'Slasher',
          detail: {
            specialText: 'Boosts ATK of Fighter and Slasher characters by 2.25x for 1 turn.',
          },
        }),
        createCharacterRecord({
          id: 5932,
          type: 'DEX',
          primaryClass: 'Fighter',
          secondaryClass: 'Slasher',
          detail: {
            specialText: 'Boosts color affinity of DEX characters by 2x for 1 turn.',
          },
        }),
        createCharacterRecord({
          id: 5933,
          type: 'DEX',
          primaryClass: 'Fighter',
          secondaryClass: 'Slasher',
          detail: {
            specialText:
              'Reduces Bind and Despair duration by 5 turns and reduces Threshold Damage Reduction duration by 5 turns.',
          },
        }),
        createCharacterRecord({
          id: 5934,
          type: 'DEX',
          primaryClass: 'Fighter',
          secondaryClass: 'Slasher',
          detail: {
            specialText:
              'Changes crew orbs into Matching Orbs and reduces Special Cooldown by 1 turn.',
          },
        }),
      ],
      createInput(['DEX'], ['Fighter', 'Slasher'], {
        requireAllSelectedClassesPerCharacter: true,
        lockedCharacterIds: [5900],
        captainCharacterId: 5900,
        friendCaptainCharacterId: 5900,
      }),
    );

    expect(result).toBeNull();
  });
});

it('builds ranked teams from a locked-leader roster pool', async () => {
  const repository = {
    getAutoBuilderCandidates: vi.fn().mockResolvedValue(createCrewForgeRosterRecords()),
  };
  const service = new AutoTeamBuilderService(repository as never);

  const result = await service.buildRankedTeamsFromRoster({
    rosterCharacterIds: [5900, 5905, 5880, 5870, 5860, 8301, 8302],
    captainCharacterId: 5900,
    friendCaptainCharacterId: 5905,
    resultLimit: 10,
    requireUniqueBaseCharacterNames: true,
  });

  expect(result.results.length).toBeGreaterThan(0);
  expect(result.results.every((team) => team.slots[0]?.character.id === 5900)).toBe(true);
  expect(result.results.every((team) => team.slots[1]?.character.id === 5905)).toBe(true);
  expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
    ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
    null,
    {
      allowedCharacterIds: [5900, 5905, 5880, 5870, 5860, 8301, 8302],
      lockedCharacterIds: [5900, 5905],
      excludedCharacterIds: [],
    },
  );
});

it('dedupes leader-swapped and sub-order-equivalent ranked teams', async () => {
  const repository = {
    getAutoBuilderCandidates: vi.fn().mockResolvedValue(createCrewForgeRosterRecords()),
  };
  const service = new AutoTeamBuilderService(repository as never);

  const result = await service.buildRankedTeamsFromRoster({
    rosterCharacterIds: [5900, 5905, 5880, 5870, 5860, 8301],
    resultLimit: 50,
  });
  const teamKeys = result.results.map((team) => team.teamKey);

  expect(teamKeys).toEqual([...new Set(teamKeys)]);
});

it('ranks teams by distinct ability count before secondary coverage metrics', async () => {
  const repository = {
    getAutoBuilderCandidates: vi.fn().mockResolvedValue(createCrewForgeRosterRecords()),
  };
  const service = new AutoTeamBuilderService(repository as never);

  const result = await service.buildRankedTeamsFromRoster({
    rosterCharacterIds: [5900, 5905, 5880, 5870, 5860, 8301, 8302],
    captainCharacterId: 5900,
    friendCaptainCharacterId: 5905,
    resultLimit: 10,
  });

  expect(result.results[0]?.ranking.distinctAbilityCount).toBeGreaterThanOrEqual(
    result.results[1]?.ranking.distinctAbilityCount ?? -1,
  );
  expect(result.results[0]?.abilityBreakdown.duplicateAbilities).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        key: 'remove_paralysis',
        count: 2,
      }),
    ]),
  );
});

it('ranks newer roster teams ahead of higher powerScore teams after coverage ties', async () => {
  const repository = {
    getAutoBuilderCandidates: vi.fn().mockResolvedValue([
      createCaptainRecord(),
      createUniversalCaptainRecord(),
      createCharacterRecord({
        id: 6200,
        name: 'Newer Low-Cost Redundant Sub',
        cost: 20,
        primaryClass: 'Fighter',
        detail: {
          specialText: 'Deals 100x character ATK in typeless damage to one enemy.',
        },
      }),
      createAtkSubRecord(),
      createAffinitySubRecord(),
      createUtilitySubRecord(),
      createCharacterRecord({
        id: 267,
        name: 'Older High-Cost Redundant Sub',
        cost: 65,
        primaryClass: 'Fighter',
        detail: {
          specialText: 'Deals 100x character ATK in typeless damage to one enemy.',
        },
      }),
    ]),
  };
  const service = new AutoTeamBuilderService(repository as never);

  const result = await service.buildRankedTeamsFromRoster({
    rosterCharacterIds: [5900, 5905, 6200, 5890, 5880, 5870, 267],
    captainCharacterId: 5900,
    friendCaptainCharacterId: 5905,
    resultLimit: 10,
  });
  const firstTeamIds = result.results[0]?.slots.map((slot) => slot.character.id) ?? [];

  expect(firstTeamIds).toContain(6200);
  expect(firstTeamIds).not.toContain(267);
});

it('blocks ranked teams that violate party conflict rules', async () => {
  const repository = {
    getAutoBuilderCandidates: vi.fn().mockResolvedValue([
      createCharacterRecord({
        id: 8201,
        name: 'Monkey D. Luffy',
        type: 'DEX',
        primaryClass: 'Fighter',
        detail: {
          captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
        },
      }),
      createCharacterRecord({
        id: 8202,
        name: 'Monkey D. Luffy - Gear 2',
        type: 'DEX',
        primaryClass: 'Fighter',
        detail: {
          captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.25x.',
        },
      }),
      createAtkSubRecord(),
      createAffinitySubRecord(),
      createUtilitySubRecord(),
      createConsistencySubRecord(),
    ]),
  };
  const service = new AutoTeamBuilderService(repository as never);

  const result = await service.buildRankedTeamsFromRoster({
    rosterCharacterIds: [8201, 8202, 5880, 5870, 5860, 5850],
    resultLimit: 10,
    requireUniqueBaseCharacterNames: true,
  });

  expect(
    result.results.some((team) => {
      const slotIds = team.slots.map((slot) => slot.character.id);

      return slotIds.includes(8201) && slotIds.includes(8202);
    }),
  ).toBe(false);
});

function createInput(
  types: AutoTeamBuilderType[] = [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
  selectedClasses: string[] = ['Fighter'],
  overrides: Partial<
    Pick<
      AutoBuildInput,
      | 'requireAllSelectedTypesInTeam'
      | 'requireAllSelectedClassesPerCharacter'
      | 'selectedCharacterTags'
      | 'selectedCharacterNames'
      | 'requireAllSelectedCharacterTagsInTeam'
      | 'requireAllSelectedCharacterNamesInTeam'
      | 'requireAllSlotsInLeaderSuperEffectScope'
      | 'requireFullCaptainAbilityCoverage'
      | 'requireBothLeadersFullCaptainAbilityCoverage'
      | 'minimumLeaderSuperEffectMatchingSlots'
      | 'requireLeaderSuperSpecialCriteria'
      | 'strictSuperSpecialCriteriaCoverage'
      | 'requireSuperTandemCriteria'
      | 'strictSuperTandemCriteriaCoverage'
      | 'requireUniqueBaseCharacterNames'
      | 'favoritesOnly'
      | 'allowAnyFriendCaptainAutoFill'
      | 'favoriteShipsOnly'
      | 'favoriteShipIds'
      | 'leaderBoostFilters'
      | 'leaderBoostRanges'
      | 'costRange'
      | 'leaderCostRange'
      | 'subCostRange'
      | 'maxTotalCost'
      | 'manualSlots'
      | 'lockedCharacterIds'
      | 'excludedCharacterIds'
      | 'captainCharacterId'
      | 'friendCaptainCharacterId'
      | 'excludedShipIds'
      | 'requiredAbilities'
      | 'requiredCharacterGroups'
      | 'battleRequirements'
    >
  > = {
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    selectedCharacterTags: [],
    selectedCharacterNames: [],
    requireAllSelectedCharacterTagsInTeam: false,
    requireAllSelectedCharacterNamesInTeam: false,
    requireAllSlotsInLeaderSuperEffectScope: false,
    requireFullCaptainAbilityCoverage: false,
    requireBothLeadersFullCaptainAbilityCoverage: false,
    requireLeaderSuperSpecialCriteria: false,
    strictSuperSpecialCriteriaCoverage: false,
    requireSuperTandemCriteria: false,
    strictSuperTandemCriteriaCoverage: false,
    requireUniqueBaseCharacterNames: false,
    favoritesOnly: false,
    allowAnyFriendCaptainAutoFill: false,
    favoriteShipsOnly: false,
    favoriteShipIds: [],
    leaderBoostFilters: ['HP', 'ATK'],
    leaderBoostRanges: createEmptyAutoBuildLeaderBoostRanges(),
    costRange: createEmptyAutoBuildCostRange(),
    leaderCostRange: createEmptyAutoBuildCostRange(),
    subCostRange: createEmptyAutoBuildCostRange(),
    maxTotalCost: null,
    lockedCharacterIds: [],
    excludedCharacterIds: [],
    captainCharacterId: null,
    friendCaptainCharacterId: null,
    excludedShipIds: [],
  },
): AutoBuildInput {
  const lockedCharacterIds = overrides.lockedCharacterIds ?? [];
  const excludedCharacterIds = overrides.excludedCharacterIds ?? [];
  const captainCharacterId = overrides.captainCharacterId ?? null;
  const friendCaptainCharacterId = overrides.friendCaptainCharacterId ?? null;

  return {
    types,
    selectedClasses,
    selectedCharacterTags: overrides.selectedCharacterTags ?? [],
    selectedCharacterNames: overrides.selectedCharacterNames ?? [],
    requiredAbilities: overrides.requiredAbilities ?? [],
    requiredCharacterGroups: overrides.requiredCharacterGroups ?? [],
    battleRequirements: overrides.battleRequirements ?? [],
    enemyMechanics: [],
    requireAllSelectedTypesInTeam: overrides.requireAllSelectedTypesInTeam ?? false,
    requireAllSelectedClassesPerCharacter: overrides.requireAllSelectedClassesPerCharacter ?? false,
    requireAllSelectedCharacterTagsInTeam: overrides.requireAllSelectedCharacterTagsInTeam ?? false,
    requireAllSelectedCharacterNamesInTeam:
      overrides.requireAllSelectedCharacterNamesInTeam ?? false,
    requireAllSlotsInLeaderSuperEffectScope:
      overrides.requireAllSlotsInLeaderSuperEffectScope ?? false,
    requireFullCaptainAbilityCoverage: overrides.requireFullCaptainAbilityCoverage ?? false,
    requireBothLeadersFullCaptainAbilityCoverage:
      overrides.requireBothLeadersFullCaptainAbilityCoverage ?? false,
    minimumLeaderSuperEffectMatchingSlots: overrides.requireAllSlotsInLeaderSuperEffectScope
      ? (overrides.minimumLeaderSuperEffectMatchingSlots ?? 6)
      : null,
    requireLeaderSuperSpecialCriteria: overrides.requireLeaderSuperSpecialCriteria ?? false,
    strictSuperSpecialCriteriaCoverage: overrides.strictSuperSpecialCriteriaCoverage ?? false,
    requireSuperTandemCriteria: overrides.requireSuperTandemCriteria ?? false,
    strictSuperTandemCriteriaCoverage: overrides.strictSuperTandemCriteriaCoverage ?? false,
    requireUniqueBaseCharacterNames: overrides.requireUniqueBaseCharacterNames ?? false,
    favoritesOnly: overrides.favoritesOnly ?? false,
    allowAnyFriendCaptainAutoFill: overrides.allowAnyFriendCaptainAutoFill ?? false,
    favoriteShipsOnly: overrides.favoriteShipsOnly ?? false,
    favoriteShipIds: overrides.favoriteShipIds ?? [],
    leaderBoostFilters: overrides.leaderBoostFilters ?? ['HP', 'ATK'],
    leaderBoostRanges: overrides.leaderBoostRanges ?? createEmptyAutoBuildLeaderBoostRanges(),
    costRange: overrides.costRange ?? createEmptyAutoBuildCostRange(),
    leaderCostRange:
      overrides.leaderCostRange ?? overrides.costRange ?? createEmptyAutoBuildCostRange(),
    subCostRange: overrides.subCostRange ?? overrides.costRange ?? createEmptyAutoBuildCostRange(),
    maxTotalCost: overrides.maxTotalCost ?? null,
    manualSlots:
      overrides.manualSlots ??
      createManualSlotsFromLegacySelection(
        lockedCharacterIds,
        captainCharacterId,
        friendCaptainCharacterId,
      ),
    lockedCharacterIds,
    excludedCharacterIds,
    captainCharacterId,
    friendCaptainCharacterId,
    manualShipId: null,
    requireManualShip: false,
    excludedShipIds: overrides.excludedShipIds ?? [],
    candidateLimit: AUTO_TEAM_CANDIDATE_LIMIT,
  };
}

function createManualSlots(
  overrides: Partial<Record<AutoBuildManualSlotSelection['role'], number[]>> = {},
  requiredOverrides: Partial<Record<AutoBuildManualSlotSelection['role'], number | null>> = {},
): AutoBuildManualSlotSelection[] {
  return createEmptyAutoBuildManualSlots().map((slot) => ({
    role: slot.role,
    characterIds: [...(overrides[slot.role] ?? [])],
    requiredCharacterId: requiredOverrides[slot.role] ?? null,
  }));
}

function expectCompleteAutoTeam(result: AutoBuildResult | null): asserts result is AutoBuildResult {
  expect(result).not.toBeNull();
  expect(result?.slots).toHaveLength(6);
  expect(result?.slots.every((slot) => slot.character)).toBe(true);
}

async function expectManualLeaderSweepCase(
  characterId: number,
  expectedCharacter: Partial<CharacterDetailRecord>,
): Promise<void> {
  const requiredLeader = loadGeneratedCharacterRecord(characterId);
  const repository = {
    getAutoBuilderCandidates: vi
      .fn()
      .mockResolvedValue(createManualLeaderSweepRecords(requiredLeader)),
  };
  const service = new AutoTeamBuilderService(repository as never);

  const result = await service.buildTeam(
    [...AUTO_TEAM_BUILDER_CLASSES],
    [...AUTO_TEAM_BUILDER_TYPES],
    {
      requireUniqueBaseCharacterNames: true,
      leaderBoostFilters: ['HP', 'ATK'],
      manualSlots: createManualSlots(
        {
          captain: [requiredLeader.id],
          friendCaptain: [requiredLeader.id],
        },
        {
          captain: requiredLeader.id,
          friendCaptain: requiredLeader.id,
        },
      ),
    },
  );

  expectCompleteAutoTeam(result);
  expect(requiredLeader).toMatchObject(expectedCharacter);
  expect(result.slots[0]?.character.id).toBe(requiredLeader.id);
  expect(result.slots[1]?.character.id).toBe(requiredLeader.id);
  expect(result.slots[0]?.reasonChips).toContain('Manual pick');
  expect(result.slots[1]?.reasonChips).toContain('Manual pick');
}

function createManualLeaderSweepRecords(
  requiredLeader: CharacterDetailRecord,
): CharacterDetailRecord[] {
  const baseId = 900000 + requiredLeader.id * 10;
  const { type, primaryClass, secondaryClass, characterTags, cost, stars } =
    resolveManualLeaderSweepFixtureScope(requiredLeader);
  const helperDetailScope =
    characterTags.length > 0
      ? {
          characterTags,
        }
      : {};

  return [
    requiredLeader,
    createCharacterRecord({
      id: baseId,
      name: `Manual Sweep Friend Captain ${requiredLeader.id}`,
      type,
      primaryClass,
      secondaryClass,
      cost,
      stars,
      detail: {
        ...helperDetailScope,
        captainAbility: 'Boosts ATK of all characters by 5x and HP by 1.3x.',
      },
    }),
    createCharacterRecord({
      id: baseId + 1,
      type,
      primaryClass,
      secondaryClass,
      cost,
      stars,
      detail: {
        ...helperDetailScope,
        specialText: `Boosts ATK of [${type}] characters by 2.25x for 1 turn.`,
      },
    }),
    createCharacterRecord({
      id: baseId + 2,
      type,
      primaryClass,
      secondaryClass,
      cost,
      stars,
      detail: {
        ...helperDetailScope,
        specialText: `Boosts color affinity of [${type}] characters by 2x for 1 turn.`,
      },
    }),
    createCharacterRecord({
      id: baseId + 3,
      type,
      primaryClass,
      secondaryClass,
      cost,
      stars,
      detail: {
        ...helperDetailScope,
        specialText: 'Reduces Bind and Despair duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: baseId + 4,
      type,
      primaryClass,
      secondaryClass,
      cost,
      stars,
      detail: {
        ...helperDetailScope,
        specialText: 'Changes crew orbs into Matching Orbs and reduces Special Cooldown by 1 turn.',
      },
    }),
  ];
}

function resolveManualLeaderSweepFixtureScope(requiredLeader: CharacterDetailRecord): {
  type: AutoTeamBuilderType;
  primaryClass: string;
  secondaryClass: string | null;
  characterTags: string[];
  cost: number;
  stars: number;
} {
  const fixtureTier = resolveManualLeaderSweepFixtureTier(requiredLeader);
  const fixtureConditions = fixtureTier?.characterConditions;
  const coverageTypes = (fixtureConditions?.types ?? []).filter(isAutoTeamBuilderType);
  const type =
    coverageTypes[0] ??
    (isAutoTeamBuilderType(requiredLeader.type)
      ? requiredLeader.type
      : AUTO_TEAM_BUILDER_DEFAULT_TYPE);
  const coverageClasses = (fixtureConditions?.classes ?? []).filter(isAutoTeamBuilderClass);
  const leaderClasses = [requiredLeader.primaryClass, requiredLeader.secondaryClass].filter(
    (characterClass): characterClass is string =>
      typeof characterClass === 'string' && isAutoTeamBuilderClass(characterClass),
  );
  const fixtureClasses = coverageClasses.length > 0 ? coverageClasses : leaderClasses;
  const primaryClass = fixtureClasses[0] ?? 'Fighter';
  const secondaryClass =
    fixtureClasses.find((characterClass) => characterClass !== primaryClass) ?? null;

  return {
    type,
    primaryClass,
    secondaryClass,
    characterTags: [...(fixtureConditions?.characterTags ?? [])],
    cost: resolveManualLeaderSweepFixtureNumber(fixtureConditions?.costRange, requiredLeader.cost),
    stars: resolveManualLeaderSweepFixtureNumber(
      fixtureConditions?.rarityRange,
      requiredLeader.stars,
    ),
  };
}

function resolveManualLeaderSweepFixtureTier(requiredLeader: CharacterDetailRecord) {
  const tiers =
    requiredLeader.detail.captainAbilityCoverage?.entries.flatMap((entry) => entry.tiers) ?? [];
  const teamTargetableTiers = tiers.filter((tier) => !tier.characterConditions.selfOnly);

  return (
    teamTargetableTiers.find((tier) => {
      const conditions = tier.characterConditions;
      return (
        conditions.types.length > 0 ||
        conditions.classes.length > 0 ||
        conditions.characterTags.length > 0
      );
    }) ??
    teamTargetableTiers.find((tier) => {
      const conditions = tier.characterConditions;
      return conditions.costRange !== undefined || conditions.rarityRange !== undefined;
    }) ??
    teamTargetableTiers.find((tier) => tier.characterConditions.universal) ??
    teamTargetableTiers[0]
  );
}

function resolveManualLeaderSweepFixtureNumber(
  range: { min?: number; max?: number } | undefined,
  fallback: number,
): number {
  if (!range) {
    return fallback;
  }
  const min = range.min ?? fallback;
  const max = range.max ?? fallback;

  if (fallback < min) {
    return min;
  }
  if (fallback > max) {
    return max;
  }

  return fallback;
}

function isAutoTeamBuilderType(value: string): value is AutoTeamBuilderType {
  return AUTO_TEAM_BUILDER_TYPES.some((type) => type === value);
}

function isAutoTeamBuilderClass(value: string): boolean {
  return AUTO_TEAM_BUILDER_CLASSES.some((characterClass) => characterClass === value);
}

let generatedPreviewCharacters: CharacterDetailRecord[] | null = null;
let generatedSeedCharactersById: Map<number, CharacterDetailRecord> | null = null;

function loadGeneratedCharacterRecord(characterId: number): CharacterDetailRecord {
  generatedPreviewCharacters ??=
    (
      JSON.parse(
        readFileSync(resolve(process.cwd(), 'public/assets/data/optc-preview.json'), 'utf8'),
      ) as { characters?: CharacterDetailRecord[] }
    ).characters ?? [];

  const previewRecord = generatedPreviewCharacters.find(
    (character) => character.id === characterId,
  );

  if (previewRecord) {
    return cloneGeneratedCharacterRecord(previewRecord);
  }

  generatedSeedCharactersById ??= loadGeneratedSeedCharactersById();

  const seedRecord = generatedSeedCharactersById.get(characterId);

  if (seedRecord) {
    return cloneGeneratedCharacterRecord(seedRecord);
  }

  throw new Error(
    `Generated character #${characterId} was not found in optc-preview.json or optc-seed.sql`,
  );
}

function cloneGeneratedCharacterRecord(record: CharacterDetailRecord): CharacterDetailRecord {
  const cloned = JSON.parse(JSON.stringify(record)) as CharacterDetailRecord;
  // Mirror the production repository flow so no-text characters get the trivial
  // scope:'none' baseline tier injected by `normalizeCaptainAbilityCoverage`.
  return {
    ...cloned,
    detail: {
      ...cloned.detail,
      captainAbilityCoverage: normalizeCaptainAbilityCoverage(cloned.detail.captainAbilityCoverage),
    },
  };
}

function loadGeneratedSeedCharactersById(): Map<number, CharacterDetailRecord> {
  const sql = readFileSync(resolve(process.cwd(), 'public/assets/data/optc-seed.sql'), 'utf8');
  const detailsById = new Map<number, CharacterDetailRecord['detail']>();
  const recordsById = new Map<number, CharacterDetailRecord>();
  const detailMarker = 'INSERT INTO character_details (character_id, detail_json)';
  const characterMarker = 'INSERT INTO characters (';
  let searchIndex = 0;

  while (searchIndex < sql.length) {
    const insertIndex = sql.indexOf(detailMarker, searchIndex);

    if (insertIndex === -1) {
      break;
    }

    const valuesIndex = sql.indexOf('VALUES', insertIndex);
    const tupleStartIndex = sql.indexOf('(', valuesIndex);

    if (valuesIndex === -1 || tupleStartIndex === -1) {
      throw new Error(`Malformed character_details insert near ${insertIndex}.`);
    }

    const parsedTuple = parseSqlTupleValues(sql, tupleStartIndex);
    const characterId = Number(parsedTuple.values[0]);
    const detailJson = parsedTuple.values[1];

    if (!Number.isInteger(characterId) || typeof detailJson !== 'string') {
      throw new Error(`Malformed character_details values near ${insertIndex}.`);
    }

    detailsById.set(characterId, JSON.parse(detailJson) as CharacterDetailRecord['detail']);
    searchIndex = parsedTuple.endIndex + 1;
  }

  searchIndex = 0;

  while (searchIndex < sql.length) {
    const insertIndex = sql.indexOf(characterMarker, searchIndex);

    if (insertIndex === -1) {
      break;
    }

    const valuesIndex = sql.indexOf('VALUES', insertIndex);
    const tupleStartIndex = sql.indexOf('(', valuesIndex);

    if (valuesIndex === -1 || tupleStartIndex === -1) {
      throw new Error(`Malformed characters insert near ${insertIndex}.`);
    }

    const parsedTuple = parseSqlTupleValues(sql, tupleStartIndex);
    const values = parsedTuple.values;
    const characterId = Number(values[0]);
    const name = values[1];
    const type = values[3];
    const primaryClass = values[4];

    if (
      !Number.isInteger(characterId) ||
      typeof name !== 'string' ||
      typeof type !== 'string' ||
      typeof primaryClass !== 'string'
    ) {
      throw new Error(`Malformed characters values near ${insertIndex}.`);
    }

    recordsById.set(
      characterId,
      createCharacterRecord({
        id: characterId,
        name,
        searchText: typeof values[23] === 'string' ? values[23] : undefined,
        isIncomplete: Number(values[2]) === 1,
        type,
        primaryClass,
        secondaryClass: typeof values[5] === 'string' ? values[5] : null,
        stars: Number(values[7]),
        starsLabel: typeof values[8] === 'string' ? values[8] : undefined,
        cost: Number(values[9]),
        combo: Number(values[10]),
        captainHpBoost: Number(values[18]),
        captainAtkBoost: Number(values[19]),
        captainAverageBoost: Number(values[20]),
        stats: {
          min: {
            hp: toNullableNumber(values[11]),
            atk: toNullableNumber(values[12]),
            rcv: toNullableNumber(values[13]),
          },
          max: {
            hp: toNullableNumber(values[14]),
            atk: toNullableNumber(values[15]),
            rcv: toNullableNumber(values[16]),
          },
          growth: toNullableNumber(values[17]),
        },
        regionAvailability: parseSqlJsonValue(values[21], {
          exactLocal: false,
          thumbnailGlobal: false,
          thumbnailJapan: false,
        }),
        assets: parseSqlJsonValue(values[22], {
          exactLocal: null,
          thumbnailGlobal: null,
          thumbnailJapan: null,
        }),
        detail: detailsById.get(characterId),
      }),
    );
    searchIndex = parsedTuple.endIndex + 1;
  }

  return recordsById;
}

function parseSqlTupleValues(
  sql: string,
  startIndex: number,
): { values: Array<string | number | null>; endIndex: number } {
  const values: Array<string | number | null> = [];
  let index = startIndex + 1;

  while (index < sql.length) {
    while (/\s/u.test(sql[index] ?? '')) {
      index += 1;
    }

    if (sql[index] === ')') {
      return { values, endIndex: index };
    }

    if (sql[index] === "'") {
      const parsedString = parseSqlStringLiteral(sql, index);
      values.push(parsedString.value);
      index = parsedString.endIndex + 1;
    } else {
      const tokenStartIndex = index;

      while (index < sql.length && sql[index] !== ',' && sql[index] !== ')') {
        index += 1;
      }

      const token = sql.slice(tokenStartIndex, index).trim();
      values.push(/^NULL$/iu.test(token) ? null : Number(token));
    }

    while (/\s/u.test(sql[index] ?? '')) {
      index += 1;
    }

    if (sql[index] === ',') {
      index += 1;
      continue;
    }

    if (sql[index] === ')') {
      return { values, endIndex: index };
    }
  }

  throw new Error(`Unterminated SQL tuple near ${startIndex}.`);
}

function parseSqlStringLiteral(
  sql: string,
  startIndex: number,
): { value: string; endIndex: number } {
  let value = '';

  for (let index = startIndex + 1; index < sql.length; index += 1) {
    const character = sql[index];

    if (character !== "'") {
      value += character;
      continue;
    }

    if (sql[index + 1] === "'") {
      value += "'";
      index += 1;
      continue;
    }

    return { value, endIndex: index };
  }

  throw new Error(`Unterminated SQL string literal near ${startIndex}.`);
}

function toNullableNumber(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

function parseSqlJsonValue<T>(value: string | number | null, fallback: T): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : fallback;
}

function createManualSlotsFromLegacySelection(
  lockedCharacterIds: number[],
  captainCharacterId: number | null,
  friendCaptainCharacterId: number | null,
): AutoBuildManualSlotSelection[] {
  const selectedLeaderIds = [captainCharacterId, friendCaptainCharacterId].filter(
    (characterId): characterId is number => characterId !== null,
  );

  return createManualSlots({
    captain: captainCharacterId ? [captainCharacterId] : [],
    friendCaptain: friendCaptainCharacterId ? [friendCaptainCharacterId] : [],
    sub1: lockedCharacterIds
      .filter((characterId) => !selectedLeaderIds.includes(characterId))
      .slice(0, 1),
    sub2: lockedCharacterIds
      .filter((characterId) => !selectedLeaderIds.includes(characterId))
      .slice(1, 2),
    sub3: lockedCharacterIds
      .filter((characterId) => !selectedLeaderIds.includes(characterId))
      .slice(2, 3),
    sub4: lockedCharacterIds
      .filter((characterId) => !selectedLeaderIds.includes(characterId))
      .slice(3, 4),
  });
}

function createCaptainCoveragePruneRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 8300,
      name: 'Coverage Captain',
      primaryClass: 'Fighter',
      type: 'DEX',
      detail: {
        captainAbility: 'Boosts ATK of [DEX] characters by 5x and their HP by 1.3x.',
        specialText: 'Boosts orb effects of [DEX] characters by 2.25x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 8301,
      primaryClass: 'Fighter',
      type: 'DEX',
      detail: {
        specialText: 'Reduces Bind duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 8302,
      primaryClass: 'Fighter',
      type: 'DEX',
      detail: {
        specialText: 'Reduces Despair duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 8303,
      primaryClass: 'Fighter',
      type: 'DEX',
      detail: {
        specialText: 'Boosts ATK of [DEX] characters by 2.25x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 8304,
      primaryClass: 'Fighter',
      type: 'DEX',
      detail: {
        specialText: 'Changes orbs of [DEX] characters into Matching Orbs.',
      },
    }),
    createCharacterRecord({
      id: 8305,
      primaryClass: 'Fighter',
      type: 'PSY',
      detail: {
        specialText: 'Reduces Paralysis duration by 5 turns.',
      },
    }),
  ];
}

function createSimpleCaptainCoverageFallbackRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 8360,
      name: 'Simple Fallback Captain',
      primaryClass: 'Fighter',
      type: 'DEX',
      detail: {
        captainAbility:
          'Boosts ATK of [DEX] characters by 5x and their HP by 1.3x. If HP is below 50%, boosts ATK of [PSY] characters by 6x instead.',
        specialText: 'Boosts orb effects of [DEX] characters by 2.25x for 1 turn.',
      },
    }),
    ...[8361, 8362, 8363, 8364].map((id) =>
      createCharacterRecord({
        id,
        primaryClass: 'Fighter',
        type: 'DEX',
        detail: {
          specialText: 'Reduces Bind duration by 5 turns.',
        },
      }),
    ),
  ];
}

function createCaptainRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5900,
    primaryClass: 'Fighter',
    secondaryClass: 'Free Spirit',
    detail: {
      captainAbility:
        'Boosts ATK of DEX and Fighter characters by 5.25x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
      specialText:
        'Boosts orb effects of DEX and Fighter characters by 2.25x for 1 turn and changes orbs into Matching Orbs.',
    },
  });
}

function createBindLeaderRecord(id: number): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    primaryClass: 'Fighter',
    secondaryClass: 'Free Spirit',
    detail: {
      captainAbility:
        'Boosts ATK of DEX and Fighter characters by 5.25x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
      specialText:
        'Boosts orb effects of DEX and Fighter characters by 2.25x for 1 turn and changes orbs into Matching Orbs. Reduces Bind duration by 5 turns.',
      builderAbilities: [
        {
          key: 'remove_bind',
          label: 'Remove Bind',
          minTurns: 5,
          isCompleteRemoval: false,
          slotTokens: [],
          source: 'specialText',
        },
      ],
    },
  });
}

function createCaptainAbilityBindLeaderRecord(id: number): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    primaryClass: 'Fighter',
    secondaryClass: 'Free Spirit',
    detail: {
      captainAbility:
        'Boosts ATK of DEX and Fighter characters by 5.25x and HP by 1.3x, reduces Bind duration by 5 turns.',
      specialText:
        'Boosts orb effects of DEX and Fighter characters by 2.25x for 1 turn and changes orbs into Matching Orbs.',
      builderAbilities: [createBuilderAbility('remove_bind', 'Remove Bind', 5, 'captainAbility')],
    },
  });
}

function createLeaderPriorityCaptainRecord({
  id,
  name,
  cost,
  atkMultiplier,
  hpMultiplier = 1.3,
  universal = false,
}: {
  id: number;
  name: string;
  cost: number;
  atkMultiplier: number;
  hpMultiplier?: number;
  universal?: boolean;
}): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    name,
    cost,
    captainHpBoost: hpMultiplier,
    captainAtkBoost: atkMultiplier,
    captainAverageBoost: (hpMultiplier + atkMultiplier) / 2,
    primaryClass: 'Fighter',
    secondaryClass: 'Free Spirit',
    detail: {
      captainAbility: universal
        ? `Boosts ATK of all characters by ${atkMultiplier}x and HP by ${hpMultiplier}x.`
        : `Boosts ATK of DEX and Fighter characters by ${atkMultiplier}x and HP by ${hpMultiplier}x.`,
      specialText: 'Changes crew orbs into Matching Orbs and reduces Special Cooldown by 1 turn.',
    },
  });
}

function createBigMomCaptainRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 2500,
    name: 'Big Mom - Emperor Suffering from Hunger Pangs',
    type: 'STR',
    cost: 65,
    captainHpBoost: 1.3,
    captainAtkBoost: 3.5,
    captainAverageBoost: 2.4,
    primaryClass: 'Powerhouse',
    secondaryClass: 'Driven',
    detail: {
      captainAbility: BIG_MOM_CAPTAIN_ABILITY,
      specialText: 'Changes orbs, including [BLOCK] orbs, into [STR] orbs.',
    },
  });
}

function createBigMomScopeSubRecord(id: number, type: AutoTeamBuilderType): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    name: `Big Mom Scope Sub ${id}`,
    type,
    primaryClass: 'Powerhouse',
    secondaryClass: 'Driven',
    detail: {
      specialText: 'Boosts orb effects of Powerhouse characters by 2x for 1 turn.',
    },
  });
}

function createBigMomLeaderTeamRecords(): CharacterDetailRecord[] {
  return [
    createBigMomCaptainRecord(),
    createBigMomScopeSubRecord(2601, 'STR'),
    createBigMomScopeSubRecord(2602, 'DEX'),
    createBigMomScopeSubRecord(2603, 'QCK'),
    createBigMomScopeSubRecord(2604, 'STR'),
    createBigMomScopeSubRecord(2605, 'PSY'),
    createBigMomScopeSubRecord(2606, 'INT'),
  ];
}

function createStrictMixedCaptainRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5907,
    type: 'DEX',
    primaryClass: 'Fighter',
    secondaryClass: 'Slasher',
    detail: {
      captainAbility:
        'Boosts ATK of DEX, QCK, Fighter and Slasher characters by 5.25x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
      specialText:
        'Boosts orb effects of DEX and QCK characters by 2.25x for 1 turn and changes orbs into Matching Orbs.',
    },
  });
}

function createUniversalCaptainRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5905,
    type: 'PSY',
    primaryClass: 'Fighter',
    detail: {
      captainAbility:
        'Boosts ATK of all characters by 5x and HP by 1.4x, reduces Special Cooldown of crew by 1 turn.',
      specialText:
        'Boosts orb effects of all characters by 2x for 1 turn and changes orbs into Matching Orbs.',
    },
  });
}

function createGuaranteedExtraDropLeaderRecord(
  id: number,
  name: string,
  type: AutoTeamBuilderType,
): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    name,
    type,
    primaryClass: 'Fighter',
    secondaryClass: 'Free Spirit',
    cost: 40,
    detail: {
      captainAbility:
        'Boosts ATK of all characters by 3x, boosts HP by 1.2x and guarantees duplicating a drop upon completion of the island.',
      specialText:
        'Boosts ATK of all characters by 2x for 1 turn and changes crew orbs into Matching Orbs.',
      builderAbilities: [
        {
          key: 'extra_drop_any',
          label: 'Any Extra Drop',
          minTurns: null,
          isCompleteRemoval: false,
          slotTokens: [],
          source: 'captainAbility',
        },
        {
          key: 'extra_drop_guaranteed',
          label: 'Guaranteed Extra Drop',
          minTurns: null,
          isCompleteRemoval: false,
          slotTokens: [],
          source: 'captainAbility',
        },
      ],
    },
  });
}

function createPartialMultiTypeCaptainRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5906,
    type: 'DEX',
    primaryClass: 'Fighter',
    detail: {
      captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.25x and HP by 1.3x.',
      specialText: 'Boosts color affinity of DEX characters by 2x for 1 turn.',
    },
  });
}

function createAtkSubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5890,
    primaryClass: 'Fighter',
    detail: {
      specialText: 'Boosts ATK of Fighter characters by 2.5x for 1 turn.',
    },
  });
}

function createSlasherQckAtkSubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5891,
    type: 'QCK',
    primaryClass: 'Slasher',
    detail: {
      specialText: 'Boosts ATK of Slasher characters by 2.5x for 1 turn.',
    },
  });
}

function createAffinitySubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5880,
    primaryClass: 'Fighter',
    detail: {
      specialText: 'Boosts color affinity of DEX characters by 2x for 1 turn.',
    },
  });
}

function createUtilitySubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5870,
    primaryClass: 'Fighter',
    detail: {
      specialText:
        'Reduces Bind and Despair duration by 5 turns and reduces Threshold Damage Reduction duration by 5 turns.',
    },
  });
}

function createConsistencySubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5860,
    primaryClass: 'Fighter',
    detail: {
      specialText: 'Changes crew orbs into Matching Orbs and reduces Special Cooldown by 1 turn.',
    },
  });
}

function createOffClassRedundantSubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5850,
    primaryClass: 'Slasher',
    detail: {
      specialText: 'Boosts ATK of DEX characters by 2.5x for 1 turn.',
    },
  });
}

function createSingleTypeRecords(): CharacterDetailRecord[] {
  return [
    createCaptainRecord(),
    createAtkSubRecord(),
    createAffinitySubRecord(),
    createUtilitySubRecord(),
    createConsistencySubRecord(),
  ];
}

function createExtraDropLeaderSelectionRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 1588,
      name: 'Sanji - Prince, Kingdom of Germa',
      type: 'INT',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      detail: {
        captainAbility:
          'Boosts ATK of Fighter and Powerhouse characters by 4.5x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
        specialText:
          'Boosts orb effects of Fighter characters by 2x for 1 turn and changes crew orbs into Matching Orbs.',
      },
    }),
    createGuaranteedExtraDropLeaderRecord(2035, 'Buggy the Genius Jester', 'INT'),
    createGuaranteedExtraDropLeaderRecord(1391, 'Captain Buggy', 'DEX'),
    createAtkSubRecord(),
    createAffinitySubRecord(),
    createUtilitySubRecord(),
    createConsistencySubRecord(),
    createOffClassRedundantSubRecord(),
  ];
}

function createSubOnlyExtraDropTeamRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 1588,
      name: 'Sanji - Prince, Kingdom of Germa',
      type: 'INT',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      detail: {
        captainAbility:
          'Boosts ATK of Fighter and Powerhouse characters by 4.5x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
        specialText:
          'Boosts orb effects of Fighter characters by 2x for 1 turn and changes crew orbs into Matching Orbs.',
      },
    }),
    createGuaranteedExtraDropLeaderRecord(2035, 'Buggy the Genius Jester', 'INT'),
    createAtkSubRecord(),
    createAffinitySubRecord(),
    createUtilitySubRecord(),
    createConsistencySubRecord(),
    createOffClassRedundantSubRecord(),
  ];
}

function createSyntheticClasses(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `Synthetic Class ${index + 1}`);
}

function createManualLeaderSlots(characterId: number): AutoBuildManualSlotSelection[] {
  return createEmptyAutoBuildManualSlots().map((slot) =>
    slot.role === 'captain' || slot.role === 'friendCaptain'
      ? {
          ...slot,
          characterIds: [characterId],
          requiredCharacterId: characterId,
        }
      : slot,
  );
}

function createSynthetic4556FavoriteIds(): number[] {
  return [4556, 4554, 4549, 4548, 4541];
}

function createSynthetic4556Preset(): {
  manualSelection: {
    manualSlots: AutoBuildManualSlotSelection[];
    captainLeaderId: number;
    friendCaptainLeaderId: number;
  };
  filters: { selectedTypes: string[]; selectedClasses: string[]; favoritesOnly: boolean };
} {
  return {
    manualSelection: {
      manualSlots: createManualLeaderSlots(4556),
      captainLeaderId: 4556,
      friendCaptainLeaderId: 4556,
    },
    filters: {
      selectedTypes: [...AUTO_TEAM_BUILDER_TYPES],
      selectedClasses: [...AUTO_TEAM_BUILDER_CLASSES],
      favoritesOnly: true,
    },
  };
}

function createExported4556ReproRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 4556,
      primaryClass: 'Fighter',
      secondaryClass: 'Free Spirit',
      detail: {
        captainAbility:
          'Boosts ATK of DEX and Fighter characters by 5.25x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
        specialText:
          'Boosts orb effects of DEX and Fighter characters by 2.25x for 1 turn and changes orbs into Matching Orbs.',
      },
    }),
    createCharacterRecord({
      id: 4554,
      primaryClass: 'Fighter',
      detail: { specialText: 'Boosts ATK of Fighter characters by 2.5x for 1 turn.' },
    }),
    createCharacterRecord({
      id: 4549,
      primaryClass: 'Fighter',
      detail: { specialText: 'Boosts color affinity of DEX characters by 2x for 1 turn.' },
    }),
    createCharacterRecord({
      id: 4548,
      primaryClass: 'Fighter',
      detail: {
        specialText:
          'Reduces Bind and Despair duration by 5 turns and reduces Threshold Damage Reduction duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 4541,
      primaryClass: 'Fighter',
      detail: {
        specialText: 'Changes crew orbs into Matching Orbs and reduces Special Cooldown by 1 turn.',
      },
    }),
  ];
}

class FakeWorker extends EventTarget {
  public terminated = false;
  public readonly requests: AutoTeamBuilderWorkerRequest[] = [];

  public constructor(
    private readonly onPostMessage?: (request: AutoTeamBuilderWorkerRequest) => void,
  ) {
    super();
  }

  public postMessage(request: AutoTeamBuilderWorkerRequest): void {
    this.requests.push(request);
    this.onPostMessage?.(request);
  }

  public terminate(): void {
    this.terminated = true;
  }

  public emitMessage(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }

  public emitError(): void {
    this.dispatchEvent(new Event('error') as ErrorEvent);
  }
}

class PooledFakeWorker extends FakeWorker {}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function buildWorkerResult(
  input: AutoBuildInput,
  overrides: {
    requestedInput?: AutoBuildInput;
    coveredSelectedClasses?: string[];
    coveredSelectedTypes?: AutoTeamBuilderType[];
    coveredSelectedCharacterTags?: string[];
    coveredSelectedCharacterNames?: string[];
    coversAllSelectedClasses?: boolean;
    coversAllSelectedTypes?: boolean;
    coversAllSelectedCharacterTags?: boolean;
    coversAllSelectedCharacterNames?: boolean;
    selectedClassMatches?: number;
    selectedTypeMatches?: number;
    selectedCharacterTagMatches?: number;
    selectedCharacterNameMatches?: number;
    abilityRequirements?: Partial<AutoBuildResult['coverage']['abilityRequirements']>;
  } = {},
): AutoBuildResult {
  const abilityRequirements = {
    requested: [] as AutoBuildResult['coverage']['abilityRequirements']['requested'],
    matched: [] as AutoBuildResult['coverage']['abilityRequirements']['matched'],
    missing: [] as AutoBuildResult['coverage']['abilityRequirements']['missing'],
    matchesAll: true,
    ...overrides.abilityRequirements,
  };

  return {
    input,
    requestedInput: overrides.requestedInput ?? input,
    candidateCount: 6,
    slots: [],
    coverage: {
      leaderCriteria: {
        source: 'captainAbility',
        coverageMode: 'simpleBoostScope',
        captainLeaderId: null,
        friendCaptainLeaderId: null,
        leaderIds: [],
        leaderNames: [],
        leaderBranchSelections: [],
        dualLeaderMode: 'single',
        derivedAllowedClasses: [],
        derivedAllowedTypes: [],
        derivedAllowedCharacterTags: [],
        dominantTypeRequirements: [],
        hasCostRestriction: false,
        maxAllowedCost: null,
        hasClassRestriction: false,
        hasTypeRestriction: false,
        hasCharacterTagRestriction: false,
        requiresDominantType: false,
        tagConditionSets: [],
        matchingSlots: 0,
        totalSlots: 0,
        allSlotsMatch: true,
        leaderTierCoverages: [],
        allLeaderTiersCovered: true,
      },
      abilityRequirements: {
        ...abilityRequirements,
      },
      requiredCharacterGroups: {
        requested: [],
        matched: [],
        missing: [],
        matchesAll: true,
      },
      burst: [],
      consistency: [],
      utility: [],
      coveredSelectedClasses: overrides.coveredSelectedClasses ?? [...input.selectedClasses],
      coveredSelectedTypes: overrides.coveredSelectedTypes ?? [...input.types],
      coveredSelectedCharacterTags: overrides.coveredSelectedCharacterTags ?? [
        ...input.selectedCharacterTags,
      ],
      coveredSelectedCharacterNames: overrides.coveredSelectedCharacterNames ?? [
        ...input.selectedCharacterNames,
      ],
      coversAllSelectedClasses: overrides.coversAllSelectedClasses ?? true,
      coversAllSelectedTypes: overrides.coversAllSelectedTypes ?? true,
      coversAllSelectedCharacterTags: overrides.coversAllSelectedCharacterTags ?? true,
      coversAllSelectedCharacterNames: overrides.coversAllSelectedCharacterNames ?? true,
      selectedClassMatches: overrides.selectedClassMatches ?? input.selectedClasses.length,
      selectedTypeMatches: overrides.selectedTypeMatches ?? input.types.length,
      selectedCharacterTagMatches:
        overrides.selectedCharacterTagMatches ?? input.selectedCharacterTags.length,
      selectedCharacterNameMatches:
        overrides.selectedCharacterNameMatches ?? input.selectedCharacterNames.length,
    },
    relaxation: {
      usedFallback: true,
      droppedTypes: ['INT'],
      droppedClasses: [],
      droppedCharacterTags: [],
      droppedCharacterNames: [],
      minimumLeaderSuperEffectMatchingSlots: null,
      allowedLeadersWithSuperEffects: false,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: false,
      ignoredSuperTandemCriteria: false,
    },
    shipSelection: null,
  };
}

function createAllClassStrictTeamRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 5930,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        captainAbility:
          'Boosts ATK of DEX, Fighter and Slasher characters by 5.1x and HP by 1.35x, reduces Special Cooldown of crew by 1 turn.',
        specialText:
          'Boosts orb effects of DEX characters by 2x for 1 turn and changes orbs into Matching Orbs.',
      },
    }),
    createCharacterRecord({
      id: 5931,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText: 'Boosts ATK of Fighter and Slasher characters by 2.25x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 5932,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText: 'Boosts color affinity of DEX characters by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 5933,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText:
          'Reduces Bind and Despair duration by 5 turns and reduces Threshold Damage Reduction duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 5934,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText: 'Changes crew orbs into Matching Orbs and reduces Special Cooldown by 1 turn.',
      },
    }),
  ];
}

function createInsufficientStrictClassTeamRecords(): CharacterDetailRecord[] {
  return [
    ...createAllClassStrictTeamRecords().slice(0, 4),
    createCharacterRecord({
      id: 5935,
      type: 'DEX',
      primaryClass: 'Fighter',
      detail: {
        specialText: 'Boosts ATK of Fighter characters by 2x for 1 turn.',
      },
    }),
  ];
}

function createStrictMixedTeamRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 5925,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        captainAbility:
          'Boosts ATK of DEX, PSY, Fighter and Slasher characters by 5.1x and HP by 1.35x, reduces Special Cooldown of crew by 1 turn.',
        specialText:
          'Boosts orb effects of DEX and PSY characters by 2x for 1 turn and changes orbs into Matching Orbs.',
      },
    }),
    createCharacterRecord({
      id: 5926,
      type: 'PSY',
      primaryClass: 'Slasher',
      detail: {
        specialText: 'Boosts ATK of Slasher characters by 2.25x for 1 turn.',
      },
    }),
    createAffinitySubRecord(),
    createUtilitySubRecord(),
    createConsistencySubRecord(),
  ];
}

function createPreparedContextStressRecords(): CharacterDetailRecord[] {
  return [
    createCaptainRecord(),
    createCharacterRecord({
      id: 9830,
      name: 'Dual Counter',
      primaryClass: 'Fighter',
      detail: {
        specialText: 'Reduces Special Bind and ATK Down duration by 5 turns.',
        sailorAbilities: ['Reduces Special Bind duration on this character by 5 turns.'],
        characterTags: ['Straw Hat Pirates'],
        builderAbilities: [
          createBuilderAbility('remove_special_bind', 'Remove Special Bind', 5, 'specialText'),
          createBuilderAbility('remove_atk_down', 'Remove ATK Down', 5, 'specialText'),
          createBuilderAbility(
            'crewmate_recover_special_bind',
            'Crewmate Special Bind Recovery',
            5,
            'sailorAbilities',
          ),
        ],
      },
    }),
    createCharacterRecord({
      id: 9828,
      name: 'Bind Specialist',
      type: 'DEX',
      primaryClass: 'Fighter',
      detail: {
        specialText: 'Reduces Special Bind duration by 5 turns.',
        sailorAbilities: ['Reduces Special Bind duration on this character by 5 turns.'],
        characterTags: ['Straw Hat Pirates'],
        builderAbilities: [
          createBuilderAbility('remove_special_bind', 'Remove Special Bind', 5, 'specialText'),
          createBuilderAbility(
            'crewmate_recover_special_bind',
            'Crewmate Special Bind Recovery',
            5,
            'sailorAbilities',
          ),
        ],
      },
    }),
    createCharacterRecord({
      id: 9829,
      name: 'ATK Down Specialist',
      type: 'DEX',
      primaryClass: 'Fighter',
      detail: {
        specialText: 'Reduces ATK Down duration by 5 turns.',
        characterTags: ['Straw Hat Pirates'],
        builderAbilities: [
          createBuilderAbility('remove_atk_down', 'Remove ATK Down', 5, 'specialText'),
        ],
      },
    }),
    createAffinitySubRecord(),
    createUtilitySubRecord(),
  ];
}

function createCrewForgeRosterRecords(): CharacterDetailRecord[] {
  return [
    createCaptainRecord(),
    createUniversalCaptainRecord(),
    createAffinitySubRecord(),
    createUtilitySubRecord(),
    createConsistencySubRecord(),
    createCharacterRecord({
      id: 8301,
      name: 'Forge Utility One',
      primaryClass: 'Fighter',
      detail: {
        specialText: 'Reduces Bind duration by 5 turns and reduces Paralysis duration by 5 turns.',
        builderAbilities: [
          {
            key: 'remove_bind',
            label: 'Remove Bind',
            minTurns: 5,
            isCompleteRemoval: false,
            slotTokens: [],
            source: 'specialText',
          },
          {
            key: 'remove_paralysis',
            label: 'Remove Paralysis',
            minTurns: 5,
            isCompleteRemoval: false,
            slotTokens: [],
            source: 'specialText',
          },
        ],
      },
    }),
    createCharacterRecord({
      id: 8302,
      name: 'Forge Utility Two',
      primaryClass: 'Fighter',
      detail: {
        specialText:
          'Reduces Despair duration by 5 turns and reduces Paralysis duration by 5 turns.',
        builderAbilities: [
          {
            key: 'remove_despair',
            label: 'Remove Despair',
            minTurns: 5,
            isCompleteRemoval: false,
            slotTokens: [],
            source: 'specialText',
          },
          {
            key: 'remove_paralysis',
            label: 'Remove Paralysis',
            minTurns: 5,
            isCompleteRemoval: false,
            slotTokens: [],
            source: 'specialText',
          },
        ],
      },
    }),
  ];
}

function createDualLeaderMixedTeamRecords(): CharacterDetailRecord[] {
  return [
    ...createStrictMixedTeamRecords(),
    createCharacterRecord({
      id: 5927,
      type: 'PSY',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        captainAbility:
          'Boosts ATK of DEX, PSY, Fighter and Slasher characters by 4.8x and HP by 1.25x.',
        specialText:
          'Boosts color affinity of DEX and PSY characters by 2x for 1 turn and changes adjacent orbs into Matching Orbs.',
      },
    }),
  ];
}

function createKaidoLeaderTeamRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 2700,
      name: 'Kaido - The Strongest Creature Alive',
      type: 'DEX',
      primaryClass: 'Powerhouse',
      secondaryClass: 'Striker',
      detail: {
        captainAbility:
          "Reduces Special Cooldown of Striker and Powerhouse characters by 2 turns at the start of the fight boosts ATK of Striker and Powerhouse characters by 4x, their HP by 1.25x, and deals 400x character's ATK in [DEX] damage to all enemies at the end of each turn. At the start of the fight, this character activates their own special.",
        specialText:
          "Deals 20% of enemies' current HP in damage to all enemies and deals 400x character's ATK in [DEX] damage to all enemies at the end of each turn for 99+ turns.",
      },
    }),
    createCharacterRecord({
      id: 2701,
      type: 'STR',
      primaryClass: 'Powerhouse',
      detail: {
        specialText: 'Boosts ATK of Powerhouse characters by 2.5x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2702,
      type: 'QCK',
      primaryClass: 'Striker',
      detail: {
        specialText: 'Boosts color affinity of Striker characters by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2703,
      type: 'PSY',
      primaryClass: 'Shooter',
      secondaryClass: 'Powerhouse',
      detail: {
        specialText: 'Reduces Bind and Despair duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 2704,
      type: 'INT',
      primaryClass: 'Striker',
      secondaryClass: 'Cerebral',
      detail: {
        specialText: 'Changes crew orbs into Matching Orbs and reduces Special Cooldown by 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2705,
      type: 'DEX',
      primaryClass: 'Cerebral',
      secondaryClass: 'Driven',
      detail: {
        specialText:
          'Boosts ATK of Cerebral and Driven characters by 2.5x for 1 turn and boosts orb effects by 2.25x.',
      },
    }),
  ];
}

function createBrookLeaderTeamRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 4426,
      name: 'Brook - Freezing Chill of the Dead',
      type: 'PSY',
      primaryClass: 'Slasher',
      secondaryClass: 'Free Spirit',
      captainHpBoost: 1.4,
      captainAtkBoost: 5.25,
      captainAverageBoost: 3.325,
      detail: {
        captainAbility: BROOK_CAPTAIN_ABILITY,
        specialText:
          'Boosts Color Affinity of PSY, Slasher and Free Spirit characters by 2.75x for 2 turns.',
        characterTags: ['Straw Hat Pirates'],
      },
    }),
    createCharacterRecord({
      id: 4430,
      type: 'DEX',
      primaryClass: 'Slasher',
      detail: {
        specialText: 'Boosts ATK of Slasher characters by 2.5x for 1 turn.',
        characterTags: ['Paramythia-type'],
      },
    }),
    createCharacterRecord({
      id: 4431,
      type: 'QCK',
      primaryClass: 'Free Spirit',
      detail: {
        specialText: 'Boosts orb effects of Free Spirit characters by 2.25x for 1 turn.',
        characterTags: ['Scientist'],
      },
    }),
    createCharacterRecord({
      id: 4432,
      type: 'STR',
      primaryClass: 'Slasher',
      secondaryClass: 'Powerhouse',
      detail: {
        specialText: 'Reduces Bind and Despair duration by 5 turns.',
        characterTags: ['Straw Hat Pirates'],
      },
    }),
    createCharacterRecord({
      id: 4433,
      type: 'INT',
      primaryClass: 'Shooter',
      secondaryClass: 'Free Spirit',
      detail: {
        specialText: 'Changes crew orbs into Matching Orbs.',
        characterTags: ['Paramythia-type'],
      },
    }),
    createCharacterRecord({
      id: 9000,
      type: 'INT',
      primaryClass: 'Driven',
      secondaryClass: 'Cerebral',
      detail: {
        specialText:
          'Boosts ATK of Driven and Cerebral characters by 3x for 1 turn and changes crew orbs into Matching Orbs.',
      },
    }),
    createCharacterRecord({
      id: 9001,
      type: 'STR',
      primaryClass: 'Striker',
      secondaryClass: 'Powerhouse',
      detail: {
        specialText:
          'Boosts orb effects of Striker and Powerhouse characters by 3x for 1 turn and reduces Special Cooldown by 1 turn.',
      },
    }),
  ];
}

function createKidLeaderTeamRecords(): CharacterDetailRecord[] {
  const kidCaptainAbility =
    'Reduces Special Cooldown of all characters by 1 turn and reduces Special Cooldown of this character by 4 turns at the start of the fight, boosts ATK of [STR], Striker and Driven characters by 5x, boosts HP of [STR], Striker and Driven characters by 1.3x, and makes [STR] and [INT] orbs beneficial for all characters. If HP is below 50% at the start of the turn, boosts ATK of [STR], Striker and Driven characters by 6x instead, and reduces damage received by 25%. If your crew has 4+ [Kid Pirates], [Worst Generation] or [Land of Wano Arc] characters or your crew has 6 [Kid Pirates], [Worst Generation] or [Egghead Arc] characters, reduces Despair duration by 10 turns, and boosts base ATK of [Paramythia-type] characters by 500.';

  return [
    createCharacterRecord({
      id: 4549,
      name: 'Eustass "Captain" Kid - Aimed Damned Punk',
      type: 'STR',
      primaryClass: 'Striker',
      secondaryClass: 'Driven',
      captainHpBoost: 1.3,
      captainAtkBoost: 5,
      captainAverageBoost: 3.15,
      detail: {
        captainAbility: kidCaptainAbility,
        specialText: 'Boosts ATK of [STR], Striker and Driven characters by 3x for 1 turn.',
        characterTags: ['Kid Pirates', 'Worst Generation', 'Egghead Arc'],
        builderAbilities: [
          createBuilderAbility('remove_despair', 'Remove Despair', 10, 'captainAbility'),
        ],
      },
    }),
    createCharacterRecord({
      id: 8101,
      type: 'STR',
      primaryClass: 'Shooter',
      detail: {
        specialText: 'Boosts ATK of STR characters by 2.5x for 1 turn.',
        characterTags: ['Worst Generation'],
      },
    }),
    createCharacterRecord({
      id: 8102,
      type: 'QCK',
      primaryClass: 'Driven',
      detail: {
        specialText: 'Boosts orb effects of Driven characters by 2.25x for 1 turn.',
        characterTags: ['Land of Wano Arc'],
      },
    }),
    createCharacterRecord({
      id: 8103,
      type: 'DEX',
      primaryClass: 'Striker',
      detail: {
        specialText: 'Reduces Bind and Despair duration by 5 turns.',
        characterTags: ['Egghead Arc'],
      },
    }),
    createCharacterRecord({
      id: 8104,
      type: 'INT',
      primaryClass: 'Driven',
      detail: {
        specialText: 'Changes crew orbs into Matching Orbs and reduces Special Cooldown by 1 turn.',
        characterTags: ['Kid Pirates'],
      },
    }),
    createCharacterRecord({
      id: 9900,
      type: 'STR',
      primaryClass: 'Shooter',
      detail: {
        specialText:
          'Boosts ATK of all characters by 3x for 1 turn and boosts orb effects by 3x for 1 turn.',
      },
    }),
  ];
}

function createKidCaptainRequirementRecords(): CharacterDetailRecord[] {
  return [
    ...createKidLeaderTeamRecords(),
    createLeaderPriorityCaptainRecord({
      id: 4557,
      name: 'Newer Universal Leader',
      cost: 65,
      atkMultiplier: 5.75,
      hpMultiplier: 1.5,
      universal: true,
    }),
    createCharacterRecord({
      id: 3750,
      name: 'Kaido - Dragon Confronting the Moonlight',
      type: 'QCK',
      primaryClass: 'Driven',
      secondaryClass: 'Powerhouse',
      detail: {
        specialText: 'Reduces Special Bind duration by 5 turns.',
        characterTags: ['Animal Kingdom Pirates', 'Land of Wano Arc'],
        builderAbilities: [
          createBuilderAbility('remove_special_bind', 'Remove Special Bind', 5),
          createBuilderAbility(
            'crewmate_recover_special_bind',
            'Status Effect Recovery: Special Bind',
            5,
            'sailorAbilities',
          ),
        ],
      },
    }),
    createCharacterRecord({
      id: 3870,
      name: 'Jack the Drought - Settling a Score',
      type: 'INT',
      primaryClass: 'Driven',
      secondaryClass: 'Striker',
      detail: {
        specialText: 'Reduces Bind duration by 6 turns.',
        characterTags: ['Animal Kingdom Pirates', 'Land of Wano Arc'],
        builderAbilities: [
          createBuilderAbility('remove_atk_down', 'Remove ATK Down', 6),
          createBuilderAbility('remove_bind', 'Remove Bind', 6),
        ],
      },
    }),
    createCharacterRecord({
      id: 4556,
      name: 'Portgas D. Ace - The Man Who Came for an Emperor of the Sea',
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Striker',
      detail: {
        specialText: "Reduces all enemies' DEF Up duration by 6 turns.",
        characterTags: ['Spade Pirates', 'Land of Wano Arc'],
        builderAbilities: [
          createBuilderAbility('remove_bind', 'Remove Bind', 6),
          createBuilderAbility('remove_enemy_increased_defense', 'Remove Increased Defense', 6),
        ],
      },
    }),
    createCharacterRecord({
      id: 3431,
      name: 'Sasaki - Tobi Roppo Assembled',
      type: 'DEX',
      primaryClass: 'Driven',
      secondaryClass: 'Powerhouse',
      detail: {
        specialText: "Reduces enemies' Threshold Damage Reduction and Resilience by 5 turns.",
        characterTags: [],
        builderAbilities: [
          createBuilderAbility(
            'remove_threshold_damage_reduction',
            'Remove Threshold Damage Reduction',
            5,
          ),
          createBuilderAbility('remove_resilience', 'Remove Resilience', 5),
        ],
      },
    }),
  ];
}

function createAbilityRequirement(
  abilityKey: string,
  minTurns: number | null,
): AutoBuildInput['requiredAbilities'][number] {
  return {
    abilityKey,
    minTurns,
    slotTokens: [],
    requiredCharacterCount: 1,
  };
}

function createBattleRequirement(
  id: string,
  abilities: AutoBuildInput['requiredAbilities'],
): NonNullable<AutoBuildInput['battleRequirements']>[number] {
  return createBattleRequirementWithGroups(id, [abilities]);
}

function createBattleRequirementWithGroups(
  id: string,
  abilityGroups: AutoBuildInput['requiredAbilities'][],
): NonNullable<AutoBuildInput['battleRequirements']>[number] {
  return {
    id,
    title: id,
    enemyMechanics: [],
    requiredCharacterGroups: abilityGroups.map((abilities, index) => ({
      id: `${id}-group-${index + 1}`,
      abilities,
    })),
  };
}

function createDualTagConditionLeaderTeamRecords(): CharacterDetailRecord[] {
  return [
    createDualTagConditionRecord(5810, 'Straw Hat Leader', ['Straw Hat Pirates', 'Scientist']),
    createDualTagConditionRecord(5811, 'Scientist Leader', ['Straw Hat Pirates', 'Scientist']),
    createDualTagConditionSubRecord(5812, ['Straw Hat Pirates', 'Scientist']),
    createDualTagConditionSubRecord(5813, ['Straw Hat Pirates', 'Scientist']),
    createDualTagConditionSubRecord(5814, ['Straw Hat Pirates', 'Scientist']),
    createDualTagConditionSubRecord(5815, ['Straw Hat Pirates', 'Scientist']),
    createDualTagConditionSubRecord(9910, ['Straw Hat Pirates']),
  ];
}

function createDualTagConditionRecord(
  id: number,
  name: string,
  characterTags: string[],
): CharacterDetailRecord {
  const tag = id === 5810 ? 'Straw Hat Pirates' : 'Scientist';

  return createCharacterRecord({
    id,
    name,
    type: 'DEX',
    primaryClass: 'Fighter',
    secondaryClass: 'Free Spirit',
    detail: {
      captainAbility: `Boosts ATK of DEX and Fighter characters by 5x and HP by 1.3x. If your crew has 4+ [${tag}] characters, reduces Despair duration by 10 turns.`,
      specialText: 'Boosts ATK of DEX characters by 2.5x for 1 turn.',
      characterTags,
    },
  });
}

function createDualTagConditionSubRecord(
  id: number,
  characterTags: string[],
): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    type: 'DEX',
    primaryClass: 'Fighter',
    secondaryClass: 'Free Spirit',
    detail: {
      specialText: 'Boosts orb effects of DEX characters by 2.25x for 1 turn.',
      characterTags,
    },
  });
}

function createBothLeaderStrictCoverageRecords(): CharacterDetailRecord[] {
  const character1Text =
    'Boosts ATK of [QCK], Fighter and Powerhouse characters by 4.75x, boosts ATK of all other characters by 3.5x, and boosts HP of [QCK], Fighter and Powerhouse characters by 1.35x. If your crew has 4+ [Egghead Arc] or [Navy] characters, increases boost effects of ATK Up and Orb Amplification buffs by 1.1x.';
  const character2Text =
    'Boosts ATK of [DEX], Fighter and Powerhouse characters by 4.75x, boosts ATK of all other characters by 3.5x, and boosts HP of [DEX], Fighter and Powerhouse characters by 1.35x. If your crew has 4+ [Egghead Arc] or [Navy] characters, increases boost effects of ATK Up and Orb Amplification buffs by 1.1x.';

  return [
    createCharacterRecord({
      id: 4202,
      name: 'Jinbe - Warning Allowed Captain',
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      detail: {
        captainAbility: 'Boosts ATK of Fighter characters by 5.5x and HP by 1.3x.',
        specialText: 'Boosts orb effects of Fighter characters by 2.5x for 1 turn.',
        partyConflictKeys: ['manual-captain-choice'],
        characterTags: ['Straw Hat Pirates'],
      },
    }),
    createCharacterRecord({
      id: 4556,
      name: 'Portgas D. Ace - Strict Captain',
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Striker',
      detail: {
        captainAbility: 'Boosts ATK of Fighter characters by 5.25x and HP by 1.3x.',
        specialText: 'Boosts ATK of Fighter characters by 2.75x for 1 turn.',
        partyConflictKeys: ['manual-captain-choice'],
        characterTags: ['Navy'],
      },
    }),
    createCharacterRecord({
      id: 4521,
      name: 'Garp & Coby - Combined Fists of Mentor and Protege',
      type: 'QCK,DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      detail: {
        captainAbility: character1Text,
        captainAbilityVariants: [
          {
            key: 'character1',
            label: 'Captain Ability (Character 1)',
            text: character1Text,
          },
          {
            key: 'character2',
            label: 'Captain Ability (Character 2)',
            text: character2Text,
          },
          {
            key: 'combined',
            label: 'Captain Ability (Combined)',
            text: 'Boosts ATK of [DEX], [QCK], Fighter and Powerhouse characters by 5.75x.',
          },
        ],
        specialText: 'Boosts ATK of Fighter and Powerhouse characters by 2.25x for 1 turn.',
        characterTags: ['Navy'],
      },
    }),
    createStrictCoverageFighterSub(4561, ['Navy']),
    createStrictCoverageFighterSub(4562, ['Egghead Arc']),
    createStrictCoverageFighterSub(4563, []),
    createStrictCoverageFighterSub(4564, []),
  ];
}

function createStrictCoverageFighterSub(
  id: number,
  characterTags: string[],
): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    type: 'STR',
    primaryClass: 'Fighter',
    secondaryClass: 'Powerhouse',
    detail: {
      specialText: 'Reduces Bind duration by 5 turns.',
      characterTags,
    },
  });
}

function createIntersectedLeaderTeamRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 2710,
      type: 'DEX',
      primaryClass: 'Powerhouse',
      secondaryClass: 'Striker',
      detail: {
        captainAbility:
          'Boosts ATK of DEX, PSY, Powerhouse and Striker characters by 5x and HP by 1.3x.',
        specialText: 'Boosts orb effects of Powerhouse characters by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2711,
      type: 'PSY',
      primaryClass: 'Powerhouse',
      secondaryClass: 'Cerebral',
      detail: {
        captainAbility:
          'Boosts ATK of DEX, PSY, Powerhouse and Cerebral characters by 4.8x and HP by 1.25x.',
        specialText: 'Boosts color affinity of Powerhouse characters by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2712,
      type: 'DEX',
      primaryClass: 'Powerhouse',
      secondaryClass: 'Fighter',
      detail: {
        specialText: 'Boosts ATK of Powerhouse characters by 2.25x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2713,
      type: 'PSY',
      primaryClass: 'Driven',
      secondaryClass: 'Powerhouse',
      detail: {
        specialText: 'Reduces Bind and Despair duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 2714,
      type: 'DEX',
      primaryClass: 'Powerhouse',
      secondaryClass: 'Slasher',
      detail: {
        specialText: 'Changes crew orbs into Matching Orbs and reduces Special Cooldown by 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2715,
      type: 'PSY',
      primaryClass: 'Powerhouse',
      secondaryClass: 'Shooter',
      detail: {
        specialText: 'Boosts color affinity of DEX and PSY characters by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2716,
      type: 'PSY',
      primaryClass: 'Striker',
      secondaryClass: 'Cerebral',
      detail: {
        specialText:
          'Boosts ATK of Striker and Cerebral characters by 2.75x for 1 turn and boosts orb effects by 2.5x.',
      },
    }),
  ];
}

function createStrictDualCharacterLeaderRecords(): CharacterDetailRecord[] {
  const character1Text =
    'Boosts ATK of [QCK], Fighter and Powerhouse characters by 4.75x, boosts ATK of all other characters by 3.5x, and boosts HP of [QCK], Fighter and Powerhouse characters by 1.35x.';
  const character2Text =
    'Boosts ATK of [DEX], Fighter and Powerhouse characters by 4.75x, boosts ATK of all other characters by 3.5x, and boosts HP of [DEX], Fighter and Powerhouse characters by 1.35x.';

  return [
    createCharacterRecord({
      id: 4521,
      name: 'Garp & Coby - Combined Fists of Mentor and Protege',
      type: 'QCK,DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      detail: {
        captainAbility: character1Text,
        captainAbilityVariants: [
          {
            key: 'character1',
            label: 'Captain Ability (Character 1)',
            text: character1Text,
          },
          {
            key: 'character2',
            label: 'Captain Ability (Character 2)',
            text: character2Text,
          },
          {
            key: 'combined',
            label: 'Captain Ability (Combined)',
            text: 'Boosts ATK and HP of all characters by 5.75x.',
          },
        ],
        specialText: 'Boosts ATK of Fighter and Powerhouse characters by 2.25x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 4522,
      type: 'PSY',
      primaryClass: 'Fighter',
      secondaryClass: 'Cerebral',
      detail: {
        specialText: 'Boosts orb effects of Fighter characters by 2.25x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 4523,
      type: 'STR',
      primaryClass: 'Powerhouse',
      secondaryClass: 'Shooter',
      detail: {
        specialText: 'Boosts color affinity of Powerhouse characters by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 4524,
      type: 'DEX,QCK',
      primaryClass: 'Fighter',
      secondaryClass: 'Cerebral',
      detail: {
        specialText: 'Reduces Bind and Despair duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 4525,
      type: 'DEX',
      primaryClass: 'Shooter',
      secondaryClass: 'Cerebral',
      detail: {
        specialText: 'Changes crew orbs into Matching Orbs.',
      },
    }),
    createCharacterRecord({
      id: 4526,
      type: 'QCK',
      primaryClass: 'Shooter',
      secondaryClass: 'Cerebral',
      detail: {
        specialText: 'Reduces Paralysis duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 4527,
      type: 'INT',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText: 'Reduces Special Cooldown by 1 turn.',
      },
    }),
  ];
}

function createVsEitherBranchLeaderRecords(): CharacterDetailRecord[] {
  const character1Text =
    "Reduces Switch Effect of all characters by 3 and reduces VS Gauge of all characters by 6 at the start of the fight, changes all orbs into [TND] orbs at the start of the fight, boosts ATK of [INT], Slasher and Free Spirit characters by 5.5x, by 6x instead after the 3rd PERFECTs in a row, boosts ATK of all other characters by 3.5x, boosts HP of [INT], Slasher and Free Spirit characters by 1.35x, and makes [INT] and [TND] orbs beneficial for all characters. If crew uses a special to reduce enemies' Increased Defense, reduces the duration by 2 additional turns.";
  const character2Text =
    "Reduces Switch Effect of all characters by 3 and reduces VS Gauge of all characters by 6 at the start of the fight, changes all orbs into [RCV] orbs at the start of the fight, boosts ATK of [STR], Driven and Cerebral characters by 5.5x, by 6x instead after the 3rd PERFECTs in a row, boosts ATK of all other characters by 3.5x, boosts HP of [STR], Driven and Cerebral characters by 1.35x, and makes [STR] and [RCV] orbs beneficial for all characters. If crew uses a special to reduce enemies' Threshold Damage Reduction, reduces the duration by 2 additional turns.";

  return [
    createCharacterRecord({
      id: 4469,
      name: 'Zoro VS Lucci - Battling Swords and Hand Pistols',
      type: 'INT,STR',
      primaryClass: 'Slasher',
      secondaryClass: 'Driven',
      detail: {
        captainAbility: character1Text,
        captainAbilityVariants: [
          {
            key: 'character1',
            label: 'Captain Ability (Character 1)',
            text: character1Text,
          },
          {
            key: 'character2',
            label: 'Captain Ability (Character 2)',
            text: character2Text,
          },
        ],
        specialText:
          "Reduces enemies' Increased Defense and Threshold Damage Reduction by 7 turns.",
      },
    }),
    createCharacterRecord({
      id: 4470,
      type: 'INT',
      primaryClass: 'Shooter',
      secondaryClass: 'Powerhouse',
      detail: {
        specialText: 'Boosts orb effects of [INT] characters by 2.25x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 4471,
      type: 'PSY',
      primaryClass: 'Slasher',
      secondaryClass: 'Shooter',
      detail: {
        specialText: 'Boosts ATK of Slasher characters by 2.25x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 4472,
      type: 'STR',
      primaryClass: 'Shooter',
      secondaryClass: 'Powerhouse',
      detail: {
        specialText: 'Boosts color affinity of [STR] characters by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 4473,
      type: 'QCK',
      primaryClass: 'Driven',
      secondaryClass: 'Shooter',
      detail: {
        specialText: 'Reduces Bind and Despair duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 4474,
      type: 'QCK',
      primaryClass: 'Shooter',
      secondaryClass: 'Powerhouse',
      detail: {
        specialText: 'Changes crew orbs into Matching Orbs.',
      },
    }),
  ];
}

function createVsManualBranchSelectionRecords(): CharacterDetailRecord[] {
  const [captain] = createVsEitherBranchLeaderRecords();

  return [
    captain!,
    createCharacterRecord({
      id: 4601,
      type: 'INT',
      primaryClass: 'Shooter',
      secondaryClass: 'Powerhouse',
      detail: { specialText: 'Boosts orb effects by 2x.' },
    }),
    createCharacterRecord({
      id: 4602,
      type: 'PSY',
      primaryClass: 'Slasher',
      secondaryClass: 'Shooter',
      detail: { specialText: 'Boosts ATK by 2x.' },
    }),
    createCharacterRecord({
      id: 4603,
      type: 'DEX',
      primaryClass: 'Free Spirit',
      secondaryClass: 'Shooter',
      detail: { specialText: 'Reduces Bind duration by 5 turns.' },
    }),
    createCharacterRecord({
      id: 4604,
      type: 'QCK',
      primaryClass: 'Slasher',
      secondaryClass: 'Cerebral',
      detail: { specialText: 'Changes crew orbs into Matching Orbs.' },
    }),
    createCharacterRecord({
      id: 4611,
      type: 'STR',
      primaryClass: 'Shooter',
      secondaryClass: 'Powerhouse',
      detail: { specialText: 'Boosts color affinity by 2x.' },
    }),
  ];
}

function createVsManualBranchSelectionRecordsWithEmptyCombinedLeaderClasses(): CharacterDetailRecord[] {
  const [captain, ...records] = createVsManualBranchSelectionRecords();

  return [
    {
      ...captain!,
      type: 'INT,STR',
      classes: [],
      primaryClass: '',
      secondaryClass: null,
    },
    ...records,
  ];
}

function createStrictDualTargetCaptainPairRecords(): CharacterDetailRecord[] {
  const character1Text =
    'Boosts ATK of [QCK], Fighter and Powerhouse characters by 4.75x, boosts ATK of all other characters by 3.5x, and boosts HP of [QCK], Fighter and Powerhouse characters by 1.35x.';
  const character2Text =
    'Boosts ATK of [DEX], Fighter and Powerhouse characters by 4.75x, boosts ATK of all other characters by 3.5x, and boosts HP of [DEX], Fighter and Powerhouse characters by 1.35x.';

  return [
    createCharacterRecord({
      id: 4521,
      name: 'Garp & Coby - Combined Fists of Mentor and Protege',
      type: 'QCK,DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      detail: {
        captainAbility: character1Text,
        captainAbilityVariants: [
          {
            key: 'character1',
            label: 'Captain Ability (Character 1)',
            text: character1Text,
          },
          {
            key: 'character2',
            label: 'Captain Ability (Character 2)',
            text: character2Text,
          },
          {
            key: 'combined',
            label: 'Captain Ability (Combined)',
            text: 'Boosts ATK and HP of all characters by 5.75x.',
          },
        ],
        specialText: 'Boosts ATK of Fighter and Powerhouse characters by 2.25x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 4306,
      name: 'Bartholomew Kuma - Selfless Impulse',
      type: 'STR',
      primaryClass: 'Powerhouse',
      secondaryClass: 'Shooter',
      detail: {
        captainAbility:
          'Boosts ATK of [STR] and [DEX] characters by 5x, boosts HP of [STR] and [DEX] characters by 2x.',
        specialText: 'Reduces Bind duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 4310,
      name: 'Universal Fighter Captain',
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      detail: {
        captainAbility:
          'Boosts ATK of all characters by 5x and boosts HP of all characters by 1.3x.',
        specialText: 'Reduces Despair duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 4311,
      type: 'DEX',
      primaryClass: 'Fighter',
      detail: {
        specialText: 'Boosts orb effects of Fighter characters by 2.25x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 4312,
      type: 'STR',
      primaryClass: 'Powerhouse',
      detail: {
        specialText: 'Boosts color affinity of Powerhouse characters by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 4313,
      type: 'STR,DEX',
      primaryClass: 'Fighter',
      detail: {
        specialText: 'Changes crew orbs into Matching Orbs.',
      },
    }),
    createCharacterRecord({
      id: 4314,
      type: 'DEX',
      primaryClass: 'Powerhouse',
      detail: {
        specialText: 'Reduces Paralysis duration by 5 turns.',
      },
    }),
  ];
}

function createStrictTypeOnlyCaptainTeamRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 4306,
      name: 'Bartholomew Kuma - Selfless Impulse',
      type: 'STR',
      primaryClass: 'Powerhouse',
      secondaryClass: 'Shooter',
      detail: {
        captainAbility:
          'Boosts ATK of [STR] and [DEX] characters by 5x, boosts HP of [STR] and [DEX] characters by 2x.',
        specialText: 'Reduces Bind duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 4307,
      type: 'DEX',
      primaryClass: 'Fighter',
      detail: {
        specialText: 'Boosts ATK of [DEX] characters by 2.25x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 4309,
      type: 'STR',
      primaryClass: 'Powerhouse',
      detail: {
        specialText: 'Boosts orb effects of [STR] characters by 2.25x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 4311,
      type: 'STR,DEX',
      primaryClass: 'Cerebral',
      detail: {
        specialText: 'Reduces Bind and Despair duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 4312,
      type: 'DEX',
      primaryClass: 'Driven',
      detail: {
        specialText: 'Changes crew orbs into Matching Orbs.',
      },
    }),
    createCharacterRecord({
      id: 4322,
      name: 'Luffy & Lucci - Overlapping Guns',
      type: 'DEX,QCK',
      primaryClass: 'Fighter',
      detail: {
        specialText: 'Boosts chain by 1.2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 4348,
      name: 'Sabo & Bonney - Chance Meeting Between Intruders',
      type: 'PSY,DEX',
      primaryClass: 'Cerebral',
      detail: {
        specialText: 'Reduces Paralysis duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 4268,
      name: 'Big Mom & Katakuri - Beginning of Hell',
      type: 'QCK,DEX',
      primaryClass: 'Driven',
      detail: {
        specialText: 'Reduces Threshold Damage Reduction duration by 5 turns.',
      },
    }),
  ];
}

function createScopeFreeLeaderTeamRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 2720,
      type: 'DEX',
      primaryClass: 'Fighter',
      detail: {
        captainAbility: 'Boosts ATK by 5x and HP by 1.3x and reduces Special Cooldown by 1 turn.',
        specialText: 'Boosts orb effects by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2721,
      type: 'PSY',
      primaryClass: 'Fighter',
      detail: {
        specialText: 'Boosts ATK of Fighter characters by 2.25x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2722,
      type: 'DEX',
      primaryClass: 'Shooter',
      detail: {
        specialText: 'Boosts color affinity of DEX characters by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2723,
      type: 'PSY',
      primaryClass: 'Cerebral',
      detail: {
        specialText: 'Reduces Bind and Despair duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 2724,
      type: 'DEX',
      primaryClass: 'Driven',
      detail: {
        specialText: 'Changes crew orbs into Matching Orbs and reduces Special Cooldown by 1 turn.',
      },
    }),
  ];
}

function createBuggyLeaderTeamRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 2035,
      name: 'Buggy the Genius Jester',
      type: 'INT',
      cost: 40,
      primaryClass: 'Driven',
      secondaryClass: 'Shooter',
      detail: {
        captainAbility:
          'Boosts ATK of Cost 40 or less characters by 1.75x and reduces ATK and HP of Cost 41 or higher characters by 50%. Guarantees duplicating a drop upon completion of the island.',
        specialText:
          'Boosts ATK of Cost 40 or less characters by 2x for 2 turns. Changes orbs of Cost 40 or lower characters into Matching Orbs.',
      },
    }),
    createCharacterRecord({
      id: 2534,
      name: 'Luffy & Law - Miracle-Making Generation',
      type: 'DEX',
      cost: 55,
      primaryClass: 'Fighter',
      secondaryClass: 'Free Spirit',
      detail: {
        specialText:
          'Boosts ATK of all characters by 2.5x for 1 turn, boosts color affinity of all characters by 2x for 1 turn and changes crew orbs into Matching Orbs.',
      },
    }),
    createCharacterRecord({
      id: 2577,
      name: 'Dogstorm & Cat Viper - Antagonistic Kings of Day and Night',
      type: 'PSY',
      cost: 55,
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText:
          'Boosts orb effects of all characters by 2.5x for 1 turn and reduces Bind and Despair duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 3872,
      name: 'Black Maria - Entrapping Flammable Threads',
      type: 'QCK',
      cost: 30,
      primaryClass: 'Driven',
      secondaryClass: 'Cerebral',
      detail: {
        specialText:
          'Boosts orb effects of all characters by 2.25x for 1 turn and changes crew orbs into Matching Orbs.',
      },
    }),
    createCharacterRecord({
      id: 3577,
      name: 'Robin - Emperor-Felling Flower',
      type: 'PSY',
      cost: 30,
      primaryClass: 'Cerebral',
      secondaryClass: 'Free Spirit',
      detail: {
        specialText:
          'Boosts color affinity of all characters by 2x for 1 turn and reduces Paralysis duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 3601,
      type: 'STR',
      cost: 40,
      primaryClass: 'Powerhouse',
      secondaryClass: 'Striker',
      detail: {
        specialText: 'Boosts ATK of all characters by 2.25x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 3602,
      type: 'DEX',
      cost: 35,
      primaryClass: 'Shooter',
      secondaryClass: 'Driven',
      detail: {
        specialText: 'Reduces Bind and Despair duration by 5 turns.',
      },
    }),
  ];
}

function createTeamwideSpecialScopedRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 5940,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        captainAbility:
          'Boosts ATK of DEX, PSY, Fighter and Slasher characters by 5x and HP by 1.3x.',
        specialText:
          'Boosts orb effects of Fighter and Slasher characters by 2.25x for 1 turn and boosts the chain multiplier of Fighter and Slasher characters by +1.1 for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 5941,
      type: 'PSY',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText: 'Boosts ATK of Fighter and Slasher characters by 2.5x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 5942,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText: 'Boosts color affinity of Fighter and Slasher characters by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 5943,
      type: 'PSY',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText:
          'Boosts the chain multiplier of Fighter and Slasher characters by +1.3 for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 5944,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText: 'Changes crew orbs into Matching Orbs.',
      },
    }),
  ];
}

function createBuilderAbility(
  key: string,
  label: string,
  minTurns: number | null,
  source: AutoBuildAbilitySource = 'specialText',
): CharacterDetailRecord['detail']['builderAbilities'][number] {
  return {
    key,
    label,
    minTurns,
    isCompleteRemoval: false,
    slotTokens: [],
    source,
  };
}

function createBindBattleRequirement(
  id: string,
): NonNullable<AutoBuildInput['battleRequirements']>[number] {
  return {
    id,
    title: id,
    enemyMechanics: [],
    requiredCharacterGroups: [
      {
        id: `${id}-bind`,
        abilities: [
          {
            abilityKey: 'remove_bind',
            minTurns: 5,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
        ],
      },
    ],
  };
}

function createCharacterRecord(
  overrides: Omit<Partial<CharacterDetailRecord>, 'detail' | 'id' | 'primaryClass'> & {
    id: number;
    detail?: Partial<CharacterDetailRecord['detail']>;
    primaryClass: string;
  },
): CharacterDetailRecord {
  const secondaryClass = overrides.secondaryClass ?? null;
  const classes = [overrides.primaryClass, secondaryClass].filter((value): value is string =>
    Boolean(value),
  );

  return {
    id: overrides.id,
    name: overrides.name ?? `Unit ${overrides.id}`,
    searchText: overrides.searchText,
    isIncomplete: overrides.isIncomplete ?? false,
    type: overrides.type ?? AUTO_TEAM_BUILDER_DEFAULT_TYPE,
    classes,
    primaryClass: overrides.primaryClass,
    secondaryClass,
    stars: overrides.stars ?? 6,
    cost: overrides.cost ?? 55,
    combo: overrides.combo ?? 4,
    captainHpBoost: overrides.captainHpBoost ?? 1.3,
    captainAtkBoost: overrides.captainAtkBoost ?? 5,
    captainAverageBoost: overrides.captainAverageBoost ?? 3.15,
    stats: overrides.stats ?? {
      min: { hp: 1000, atk: 400, rcv: 120 },
      max: { hp: 3900, atk: 1900, rcv: 340 },
      growth: 3,
    },
    regionAvailability: overrides.regionAvailability ?? {
      exactLocal: true,
      thumbnailGlobal: true,
      thumbnailJapan: false,
    },
    assets: overrides.assets ?? {
      exactLocal: null,
      thumbnailGlobal: null,
      thumbnailJapan: null,
    },
    imageUrl: overrides.imageUrl ?? 'assets/placeholders/character-card.svg',
    detailImageUrl: overrides.detailImageUrl ?? 'assets/placeholders/character-card.svg',
    detail: {
      characterId: overrides.id,
      captainAbility: overrides.detail?.captainAbility ?? null,
      captainAbilityVariants: overrides.detail?.captainAbilityVariants ?? [],
      captainAbilityCoverage: overrides.detail?.captainAbilityCoverage,
      captainNotes: overrides.detail?.captainNotes ?? null,
      specialName: overrides.detail?.specialName ?? null,
      specialText: overrides.detail?.specialText ?? null,
      specialNotes: overrides.detail?.specialNotes ?? null,
      superSpecialText: overrides.detail?.superSpecialText ?? null,
      superSpecialCriteriaText: overrides.detail?.superSpecialCriteriaText ?? null,
      superSpecialNotes: overrides.detail?.superSpecialNotes ?? null,
      superSpecialCriteria: overrides.detail?.superSpecialCriteria ?? null,
      partyConflictKeys: overrides.detail?.partyConflictKeys ?? [],
      characterTags: overrides.detail?.characterTags ?? [],
      builderAbilities: overrides.detail?.builderAbilities ?? [],
      sailorAbilities: overrides.detail?.sailorAbilities ?? [],
      sailorNotes: overrides.detail?.sailorNotes ?? null,
      potentialAbilities: overrides.detail?.potentialAbilities ?? [],
      supportData: overrides.detail?.supportData ?? [],
      swapData: overrides.detail?.swapData ?? null,
      vsSpecial: overrides.detail?.vsSpecial ?? null,
      superType: overrides.detail?.superType ?? null,
      superTandemData: overrides.detail?.superTandemData ?? null,
      superClass: overrides.detail?.superClass ?? null,
      rumbleData: overrides.detail?.rumbleData ?? null,
    },
  };
}

function createLeaderWithSuperCriteriaRecord(
  id: number,
  name: string,
  superSpecialCriteria: NonNullable<CharacterDetailRecord['detail']['superSpecialCriteria']>,
): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    name,
    primaryClass: 'Fighter',
    secondaryClass: 'Free Spirit',
    detail: {
      captainAbility:
        'Boosts ATK of DEX and Fighter characters by 5.25x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
      specialText:
        'Boosts orb effects of DEX and Fighter characters by 2.25x for 1 turn and changes orbs into Matching Orbs.',
      superSpecialText: 'Transforms Fighter characters into a Super class.',
      superSpecialCriteriaText: superSpecialCriteria.rawText,
      superSpecialCriteria,
    },
  });
}

function createSuperTandemData(
  criteria: NonNullable<CharacterDetailRecord['detail']['superSpecialCriteria']>,
): NonNullable<CharacterDetailRecord['detail']['superTandemData']> {
  return {
    requirement: criteria.rawText,
    levels: [
      {
        level: 5,
        effect: 'Boosts Tandem ATK of Free Spirit and Cerebral characters by 3x for 1 turn.',
      },
    ],
    criteria,
  };
}

function createSuperTandemSubRecord(
  id: number,
  name: string,
  superTandemCriteria: NonNullable<CharacterDetailRecord['detail']['superSpecialCriteria']>,
): CharacterDetailRecord {
  const criteria = {
    ...superTandemCriteria,
    requiresCaptain: false,
  };

  return createCharacterRecord({
    id,
    name,
    primaryClass: 'Fighter',
    secondaryClass: 'Free Spirit',
    detail: {
      specialText: 'Boosts ATK of crew by 2x for 1 turn.',
      superTandemData: createSuperTandemData(criteria),
    },
  });
}

function createLeaderWithSuperTandemCriteriaRecord(
  id: number,
  name: string,
  superTandemCriteria: NonNullable<CharacterDetailRecord['detail']['superSpecialCriteria']>,
): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    name,
    primaryClass: 'Fighter',
    secondaryClass: 'Free Spirit',
    detail: {
      captainAbility:
        'Boosts ATK of DEX and Fighter characters by 5.25x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
      specialText:
        'Boosts orb effects of DEX and Fighter characters by 2.25x for 1 turn and changes orbs into Matching Orbs.',
      superClass: {
        specialEffect: 'Transforms Fighter characters into Super Fighter characters.',
      },
      superTandemData: createSuperTandemData(superTandemCriteria),
    },
  });
}

function createLeaderWithSuperEffectScopeRecord(
  id: number,
  {
    type = 'DEX',
    primaryClass = 'Fighter',
    secondaryClass = 'Free Spirit',
    superTypeEffect = null,
    superClassEffect = null,
  }: {
    type?: string;
    primaryClass?: string;
    secondaryClass?: string | null;
    superTypeEffect?: string | null;
    superClassEffect?: string | null;
  } = {},
): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    name: `Leader ${id}`,
    type,
    primaryClass,
    secondaryClass,
    detail: {
      captainAbility: 'Boosts ATK of all characters by 5x and HP by 1.3x.',
      specialText: 'Boosts orb effects of all characters by 2x for 1 turn.',
      superType: superTypeEffect ? { specialEffect: superTypeEffect } : null,
      superClass: superClassEffect ? { specialEffect: superClassEffect } : null,
    },
  });
}

function createSuperEffectScopeSubRecord(
  id: number,
  {
    type = 'DEX',
    primaryClass = 'Fighter',
    secondaryClass = null,
  }: {
    type?: string;
    primaryClass?: string;
    secondaryClass?: string | null;
  } = {},
): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    name: `Scoped Sub ${id}`,
    type,
    primaryClass,
    secondaryClass,
    detail: {
      specialText: 'Boosts ATK by 2x for 1 turn.',
    },
  });
}

function createStrSuperSpecialSubRecord(id: number): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    name: `STR Super Special ${id}`,
    type: 'STR',
    primaryClass: 'Fighter',
    secondaryClass: 'Free Spirit',
    detail: {
      specialText: 'Boosts ATK by 2x for 1 turn.',
      superSpecialText: 'Transforms STR characters into Super STR characters.',
      superSpecialCriteriaText:
        'When any 3 [Straw Hat Pirates], [Giant], or [Four Emperors] characters are on the crew not including self, can be launched when character is a crewmate.',
      superSpecialCriteria: {
        rawText:
          'When any 3 [Straw Hat Pirates], [Giant], or [Four Emperors] characters are on the crew not including self, can be launched when character is a crewmate.',
        requiresCaptain: false,
        excludesSelf: true,
        hasNonRosterBranches: false,
        parserStatus: 'roster_only',
        rosterBranches: [
          {
            branchType: 'character_count_any',
            requiredCount: 3,
            matchMode: 'any_candidate',
            options: [
              { label: '[Straw Hat Pirates]', acceptedKeys: ['straw hat pirates'] },
              { label: '[Giant]', acceptedKeys: ['giant'] },
              { label: '[Four Emperors]', acceptedKeys: ['four emperors'] },
            ],
          },
        ],
      },
    },
  });
}

function createTaggedStrSubRecord(
  id: number,
  characterTags: string[],
  type = 'STR',
): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    name: `${characterTags[0] ?? 'Tagged'} Unit ${id}`,
    type,
    searchText: characterTags.join(' ').toLowerCase(),
    primaryClass: 'Fighter',
    secondaryClass: 'Free Spirit',
    detail: {
      specialText: 'Boosts ATK by 2x for 1 turn.',
      characterTags,
    },
  });
}

function createRosterSuperCriteria(
  requiredCount: number,
  labels: string[],
): NonNullable<CharacterDetailRecord['detail']['superSpecialCriteria']> {
  return {
    rawText: `This character must be captain and your crew must consist of any ${requiredCount} of the following: ${labels.join(', ')}.`,
    requiresCaptain: true,
    hasNonRosterBranches: false,
    parserStatus: 'roster_only',
    rosterBranches: [
      {
        branchType: 'character_count_any',
        requiredCount,
        options: labels.map((label) => ({
          label,
          acceptedKeys: [label.toLowerCase()],
        })),
      },
    ],
  };
}

function createMixedRosterSuperCriteria(
  requiredCount: number,
  labels: string[],
): NonNullable<CharacterDetailRecord['detail']['superSpecialCriteria']> {
  return {
    ...createRosterSuperCriteria(requiredCount, labels),
    rawText: `This character must be captain and 5 turns must pass or your crew must consist of any ${requiredCount} of the following: ${labels.join(', ')}.`,
    hasNonRosterBranches: true,
    parserStatus: 'mixed',
  };
}

function createUnsupportedSuperCriteria(): NonNullable<
  CharacterDetailRecord['detail']['superSpecialCriteria']
> {
  return {
    rawText: 'This super special criteria cannot be parsed into roster requirements.',
    requiresCaptain: false,
    hasNonRosterBranches: true,
    parserStatus: 'unsupported',
    rosterBranches: [],
  };
}

function createNonRosterSuperCriteria(): NonNullable<
  CharacterDetailRecord['detail']['superSpecialCriteria']
> {
  return {
    rawText: 'This character must be captain and HP must be below 30%.',
    requiresCaptain: true,
    hasNonRosterBranches: true,
    parserStatus: 'non_roster_only',
    rosterBranches: [],
  };
}

function createUnsupportedSuperSpecialSubRecord(id: number): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    name: `Unsupported Super Special ${id}`,
    primaryClass: 'Fighter',
    detail: {
      specialText: 'Boosts ATK of crew by 2x for 1 turn.',
      superSpecialText: 'Transforms Fighter characters into a Super class.',
      superSpecialCriteriaText:
        'This super special activation text is not supported by the roster parser.',
      superSpecialCriteria: createUnsupportedSuperCriteria(),
    },
  });
}

function createNonRosterSuperSpecialSubRecord(id: number): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    name: `Non-roster Super Special ${id}`,
    primaryClass: 'Fighter',
    detail: {
      specialText: 'Boosts ATK of crew by 2x for 1 turn.',
      superSpecialText: 'Transforms Fighter characters into a Super class.',
      superSpecialCriteriaText: createNonRosterSuperCriteria().rawText,
      superSpecialCriteria: createNonRosterSuperCriteria(),
    },
  });
}

function createNonRosterSuperTandemSubRecord(id: number): CharacterDetailRecord {
  const criteria = createNonRosterSuperCriteria();

  return createCharacterRecord({
    id,
    name: `Non-roster Super Tandem ${id}`,
    primaryClass: 'Fighter',
    detail: {
      specialText: 'Boosts ATK of crew by 2x for 1 turn.',
      superTandemData: createSuperTandemData(criteria),
    },
  });
}

function createShipRecord(id: number, name: string, description: string): ShipRecord {
  return {
    id,
    name,
    thumb: null,
    thumbUrl: null,
    description,
  };
}
