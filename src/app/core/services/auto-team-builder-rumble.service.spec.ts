import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_RUMBLE_BUFF_FOCUS,
  type RumbleBuildProgressSnapshot,
} from '../models/auto-team-builder-rumble.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import { AutoTeamBuilderRumbleService } from './auto-team-builder-rumble.service';

describe('AutoTeamBuilderRumbleService', () => {
  it('resolves basedOn rumble inheritance before scoring', () => {
    const service = createService();
    const base = createCharacter(100, {
      rumbleData: {
        id: 100,
        stats: {
          rumbleType: 'ATK',
          def: 180,
          spd: 160,
        },
        special: [
          {
            cooldown: 20,
            effects: [{ effect: 'damage', amount: 5 }],
          },
        ],
      },
    });
    const inherited = createCharacter(101, {
      rumbleData: {
        id: 101,
        basedOn: 100,
      },
    });

    const normalized = service.normalizeRumbleData(
      inherited,
      new Map([
        [base.id, base],
        [inherited.id, inherited],
      ]),
    );

    expect(normalized?.rumbleType).toBe('ATK');
    expect(normalized?.def).toBe(180);
    expect(normalized?.cooldown).toBe(20);
    expect(normalized?.specialEffects.length).toBeGreaterThan(0);
  });

  it('summarizes base rumble levels and inherited resistance without using LLB levels', () => {
    const service = createService();
    const base = createCharacter(1663, {
      rumbleData: {
        id: 1663,
        ability: [
          { effects: [{ effect: 'buff', level: 1 }] },
          {
            effects: [
              {
                attributes: ['ATK'],
                condition: {
                  families: ['Marshall D. Teach (Blackbeard)'],
                  team: 'crew',
                  type: 'character',
                },
                effect: 'buff',
                level: 2,
                targeting: { targets: ['crew'] },
              },
            ],
          },
        ],
        llbability: Array.from({ length: 5 }, () => ({ effects: [] })),
        special: [
          { cooldown: 30, effects: [{ effect: 'damage', amount: 1 }] },
          { cooldown: 30, effects: [{ effect: 'damage', amount: 2 }] },
          {
            cooldown: 30,
            effects: [
              {
                amount: 3,
                effect: 'damage',
                range: { direction: 'forward', size: 'large' },
                targeting: { count: 1, targets: ['enemies'] },
                type: 'fixed',
              },
            ],
          },
        ],
        llbspecial: Array.from({ length: 10 }, () => ({ effects: [] })),
        resilience: [{ attribute: 'Paralysis', chance: 70, type: 'debuff' }],
        llbresilience: [
          { attribute: 'Paralysis', chance: 100, type: 'debuff' },
          { attribute: '[DEX]', percentage: 40, type: 'damage' },
        ],
      },
    });
    const inherited = createCharacter(1664, {
      rumbleData: {
        id: 1664,
        basedOn: 1663,
      },
    });

    const normalized = service.normalizeRumbleData(
      inherited,
      new Map([
        [base.id, base],
        [inherited.id, inherited],
      ]),
    );

    expect(normalized?.maxPassiveLevel).toBe(2);
    expect(normalized?.maxSpecialLevel).toBe(3);
    expect(normalized?.maxPassiveEffects).toEqual(['ATK • Lv 2 • crew']);
    expect(normalized?.maxSpecialCooldown).toBe(30);
    expect(normalized?.maxSpecialEffects).toEqual(['damage • Amount 3 • fixed • 1 enemy']);
    expect(JSON.stringify(normalized?.maxPassiveEffects)).not.toContain('Condition');
    expect(JSON.stringify(normalized?.maxSpecialEffects)).not.toContain('Range');
    expect(normalized?.baseResistances).toEqual(['70% chance to resist Paralysis']);
    expect(normalized?.llbResistances).toEqual([
      '100% chance to resist Paralysis',
      '40% damage reduction from DEX enemies',
    ]);
  });

  it('returns five active slots and three bench slots when enough candidates exist', () => {
    const service = createService();
    const result = service.buildTeamFromCandidates(
      Array.from({ length: 10 }, (_, index) =>
        createCharacter(5000 + index, {
          type: index % 2 === 0 ? 'DEX' : 'STR',
          partyConflictKeys: [`unit-${index}`],
          rumbleData: createRumbleData(index),
        }),
      ),
    );

    expect(result.activeSlots).toHaveLength(5);
    expect(result.benchSlots).toHaveLength(3);
    expect(result.selectedCount).toBe(8);
    expect(result.totalScore).toBeGreaterThan(0);
  });

  it('keeps the selected Rumble team at or below 300 cost', () => {
    const service = createService();
    const expensiveCandidates = Array.from({ length: 8 }, (_, index) =>
      createCharacter(5050 + index, {
        partyConflictKeys: [`expensive-${index}`],
        rumbleData: {
          ...createRumbleData(index),
          cost: 80,
        },
      }),
    );

    const result = service.buildTeamFromCandidates(expensiveCandidates);
    const totalCost = resolveSelectedRumbleCost(result);

    expect(totalCost).toBeLessThanOrEqual(300);
    expect(result.activeSlots.length + result.benchSlots.length).toBeLessThan(8);
  });

  it('fills full active and bench slots when eight units fit under 300 Rumble cost', () => {
    const service = createService();
    const candidates = Array.from({ length: 8 }, (_, index) =>
      createCharacter(5060 + index, {
        partyConflictKeys: [`cost-fit-${index}`],
        rumbleData: {
          ...createRumbleData(index),
          cost: 30,
        },
      }),
    );

    const result = service.buildTeamFromCandidates(candidates);

    expect(result.activeSlots).toHaveLength(5);
    expect(result.benchSlots).toHaveLength(3);
    expect(resolveSelectedRumbleCost(result)).toBe(240);
  });

  it('reports inner Rumble build progress before completion', async () => {
    const candidates = Array.from({ length: 12 }, (_, index) =>
      createCharacter(5075 + index, {
        partyConflictKeys: [`progress-${index}`],
        rumbleData: createRumbleData(index),
      }),
    );
    const service = createService(candidates);
    const progressSnapshots: RumbleBuildProgressSnapshot[] = [];

    await service.buildBestTeams(
      {},
      {
        onProgress: (snapshot) => progressSnapshots.push(snapshot),
      },
      2,
    );

    expect(progressSnapshots.some((snapshot) => snapshot.stage === 'scoringCandidates')).toBe(true);
    expect(progressSnapshots.some((snapshot) => snapshot.stage === 'selectingSlots')).toBe(true);
    expect(progressSnapshots.some((snapshot) => snapshot.stage === 'improvingTeam')).toBe(true);
    expect(progressSnapshots.at(-1)?.stage).toBe('completed');
    expect(
      progressSnapshots
        .filter((snapshot) => snapshot.stage !== 'completed')
        .every(
          (snapshot) =>
            snapshot.completedWorkUnits === undefined ||
            snapshot.totalWorkUnits === undefined ||
            snapshot.completedWorkUnits <= snapshot.totalWorkUnits,
        ),
    ).toBe(true);
    expect(
      progressSnapshots.find((snapshot) => snapshot.stage === 'selectingSlots')
        ?.totalCandidatesToCheck,
    ).toBeGreaterThan(0);
  });

  it('returns the top two unique full teams within the Rumble cost cap', () => {
    const service = createService();
    const candidates = Array.from({ length: 12 }, (_, index) =>
      createCharacter(5080 + index, {
        type: index % 2 === 0 ? 'DEX' : 'STR',
        partyConflictKeys: [`multi-team-${index}`],
        rumbleData: {
          ...createRumbleData(index),
          cost: 30,
        },
      }),
    );

    const results = service.buildTeamsFromCandidates(candidates, {}, 2);
    const resultKeys = results.map((result) => collectSelectedIds(result).sort().join(':'));

    expect(results).toHaveLength(2);
    expect(new Set(resultKeys).size).toBe(2);
    expect(results[0].totalScore).toBeGreaterThanOrEqual(results[1].totalScore);
    results.forEach((result) => {
      expect(result.activeSlots).toHaveLength(5);
      expect(result.benchSlots).toHaveLength(3);
      expect(resolveSelectedRumbleCost(result)).toBeLessThanOrEqual(300);
    });
  });

  it('can select a late-pool team buffer when its buffs make the team stronger', () => {
    const service = createService();
    const anchorCandidates = Array.from({ length: 12 }, (_, index) =>
      createCharacter(6100 + index, {
        partyConflictKeys: [`late-buffer-anchor-${index}`],
        rumbleData: {
          ...createRumbleData(index),
          ability: [{ effects: [{ effect: 'damage', amount: 2 + index }] }],
        },
      }),
    );
    const lateBuffer = createCharacter(6999, {
      name: 'Late Broad Buffer',
      partyConflictKeys: ['late-broad-buffer'],
      rumbleData: createCrewBuffRumbleData(6999, ['ATK', 'DEF', 'Special CT'], 60),
    });

    const result = service.buildTeamFromCandidates([...anchorCandidates, lateBuffer]);

    expect(collectSelectedIds(result)).toContain(lateBuffer.id);
  });

  it('keeps requested type and class coverage when possible', () => {
    const service = createService();
    const result = service.buildTeamFromCandidates(
      [
        createCharacter(5101, {
          type: 'DEX',
          primaryClass: 'Fighter',
          classes: ['Fighter'],
          rumbleData: createRumbleData(1),
        }),
        createCharacter(5102, {
          type: 'STR',
          primaryClass: 'Slasher',
          classes: ['Slasher'],
          rumbleData: createRumbleData(2),
        }),
        ...Array.from({ length: 8 }, (_, index) =>
          createCharacter(5110 + index, {
            type: 'QCK',
            primaryClass: 'Shooter',
            classes: ['Shooter'],
            partyConflictKeys: [`filler-${index}`],
            rumbleData: createRumbleData(index + 3),
          }),
        ),
      ],
      {
        types: ['DEX', 'STR'],
        selectedClasses: ['Fighter', 'Slasher'],
      },
    );

    expect(result.droppedTypes).toEqual([]);
    expect(result.droppedClasses).toEqual([]);
    expect(result.typeCoverage).toEqual(expect.arrayContaining(['DEX', 'STR']));
    expect(result.classCoverage).toEqual(expect.arrayContaining(['Fighter', 'Slasher']));
  });

  it('relaxes impossible soft requested type coverage instead of blocking', () => {
    const service = createService();
    const result = service.buildTeamFromCandidates(
      Array.from({ length: 8 }, (_, index) =>
        createCharacter(5200 + index, {
          type: 'DEX',
          primaryClass: 'Fighter',
          classes: ['Fighter'],
          partyConflictKeys: [`unique-${index}`],
          rumbleData: createRumbleData(index),
        }),
      ),
      {
        types: ['DEX', 'INT'],
        selectedClasses: ['Fighter', 'Slasher'],
      },
    );

    expect(result.candidateCount).toBe(8);
    expect(result.selectedCount).toBe(8);
    expect(result.requestedTypes).toEqual(['DEX', 'INT']);
    expect(result.resolvedTypes).toEqual(['DEX']);
    expect(result.droppedTypes).toContain('INT');
    expect(result.droppedClasses).toContain('Slasher');
  });

  it('excludes units with unselected or extra types when only-selected types is enabled', () => {
    const service = createService();
    const result = service.buildTeamFromCandidates(
      [
        ...Array.from({ length: 8 }, (_, index) =>
          createCharacter(5250 + index, {
            type: 'DEX',
            partyConflictKeys: [`selected-type-${index}`],
            rumbleData: createRumbleData(index),
          }),
        ),
        createCharacter(5265, {
          type: 'STR',
          partyConflictKeys: ['str-unit'],
          rumbleData: createRumbleData(20),
        }),
        createCharacter(5266, {
          type: 'DEX / STR',
          partyConflictKeys: ['dual-type-unit'],
          rumbleData: createRumbleData(21),
        }),
      ],
      {
        types: ['DEX'],
        onlySelectedTypes: true,
      },
    );

    expect(result.candidateCount).toBe(8);
    expect(result.selectedCount).toBe(8);
    expect(result.typeCoverage).toEqual(['DEX']);
    expect(result.droppedTypes).toEqual([]);
    expect(
      [...result.activeSlots, ...result.benchSlots].some((slot) =>
        slot.unit.character.type.includes('STR'),
      ),
    ).toBe(false);
  });

  it('allows dual-class units when one selected class matches the only-selected class filter', () => {
    const service = createService();
    const result = service.buildTeamFromCandidates(
      Array.from({ length: 8 }, (_, index) =>
        createCharacter(5270 + index, {
          primaryClass: 'Fighter',
          secondaryClass: index === 0 ? 'Slasher' : null,
          classes: index === 0 ? ['Fighter', 'Slasher'] : ['Fighter'],
          partyConflictKeys: [`selected-class-${index}`],
          rumbleData: createRumbleData(index),
        }),
      ),
      {
        selectedClasses: ['Slasher'],
        onlySelectedClasses: true,
      },
    );

    expect(result.candidateCount).toBe(1);
    expect(result.selectedCount).toBe(1);
    expect(result.activeSlots[0]?.unit.character.classes).toEqual(['Fighter', 'Slasher']);
  });

  it('blocks hard only-selected filters when no values are selected', () => {
    const service = createService();
    const typeResult = service.buildTeamFromCandidates(
      Array.from({ length: 8 }, (_, index) =>
        createCharacter(5290 + index, {
          type: 'DEX',
          partyConflictKeys: [`blocked-hard-filter-${index}`],
          rumbleData: createRumbleData(index),
        }),
      ),
      {
        onlySelectedTypes: true,
      },
    );
    const classResult = service.buildTeamFromCandidates(
      Array.from({ length: 8 }, (_, index) =>
        createCharacter(5320 + index, {
          type: 'DEX',
          partyConflictKeys: [`blocked-hard-class-filter-${index}`],
          rumbleData: createRumbleData(index),
        }),
      ),
      {
        onlySelectedClasses: true,
      },
    );

    expect(typeResult.candidateCount).toBe(0);
    expect(typeResult.selectedCount).toBe(0);
    expect(classResult.candidateCount).toBe(0);
    expect(classResult.selectedCount).toBe(0);
  });

  it('keeps any-type behavior when no types are selected', () => {
    const service = createService();
    const result = service.buildTeamFromCandidates(
      Array.from({ length: 8 }, (_, index) =>
        createCharacter(5280 + index, {
          type: 'DEX',
          partyConflictKeys: [`any-type-${index}`],
          rumbleData: createRumbleData(index),
        }),
      ),
      {
        types: [],
      },
    );

    expect(result.selectedCount).toBe(8);
    expect(result.requestedTypes).toEqual([]);
    expect(result.droppedTypes).toEqual([]);
  });

  it('limits the Rumble candidate pool to favorites when favorite-only is enabled', () => {
    const service = createService();
    const result = service.buildTeamFromCandidates(
      [
        createCharacter(5301, { type: 'DEX', rumbleData: createRumbleData(1) }),
        createCharacter(5302, { type: 'STR', rumbleData: createRumbleData(2) }),
      ],
      {
        favoritesOnly: true,
        favoriteCharacterIds: [5302],
        types: ['DEX'],
        onlySelectedTypes: true,
      },
    );

    expect(result.candidateCount).toBe(0);
    expect(
      [...result.activeSlots, ...result.benchSlots].map((slot) => slot.unit.character.id),
    ).toEqual([]);
  });

  it('returns an empty result when favorite-only has no saved favorites', async () => {
    const service = createService([
      createCharacter(5401, { type: 'DEX', rumbleData: createRumbleData(1) }),
    ]);

    const result = await service.buildBestTeam({ favoritesOnly: true, favoriteCharacterIds: [] });

    expect(result.candidateCount).toBe(0);
    expect(result.selectedCount).toBe(0);
  });

  it('avoids duplicate in-game conflict keys across active and bench slots', () => {
    const service = createService();
    const result = service.buildTeamFromCandidates([
      createCharacter(6001, {
        partyConflictKeys: ['monkey d. luffy'],
        rumbleData: createRumbleData(20),
      }),
      createCharacter(6002, {
        partyConflictKeys: ['monkey d. luffy'],
        rumbleData: createRumbleData(30),
      }),
      ...Array.from({ length: 8 }, (_, index) =>
        createCharacter(6010 + index, {
          partyConflictKeys: [`unique-${index}`],
          rumbleData: createRumbleData(index),
        }),
      ),
    ]);
    const selectedLuffyVariants = [...result.activeSlots, ...result.benchSlots].filter((slot) =>
      slot.unit.conflictKeys.includes('monkey d. luffy'),
    );

    expect(selectedLuffyVariants).toHaveLength(1);
  });

  it('avoids Cora and Corazon variants even when stored conflict keys do not overlap', () => {
    const service = createService();
    const result = service.buildTeamFromCandidates([
      createCharacter(6021, {
        name: 'Corazon & Law: Moonlight Day-Off - Creepy Night Halloween',
        maxHp: 6000,
        maxAtk: 3000,
        maxRcv: 700,
        partyConflictKeys: ['corazon & law: moonlight day-off'],
        rumbleData: createRumbleData(40),
      }),
      createCharacter(6022, {
        name: 'Cora - Grateful Love',
        maxHp: 5900,
        maxAtk: 2950,
        maxRcv: 680,
        partyConflictKeys: ['cora'],
        rumbleData: createRumbleData(39),
      }),
      ...Array.from({ length: 8 }, (_, index) =>
        createCharacter(6030 + index, {
          partyConflictKeys: [`filler-${index}`],
          rumbleData: createRumbleData(index),
        }),
      ),
    ]);
    const selectedCoraVariants = [...result.activeSlots, ...result.benchSlots].filter((slot) =>
      slot.unit.conflictKeys.some((key) => key === 'cora' || key === 'corazon'),
    );

    expect(selectedCoraVariants).toHaveLength(1);
  });

  it('ranks stronger rumble stats, cooldowns, and effects above weaker candidates', () => {
    const service = createService();
    const weak = createCharacter(1001, {
      maxHp: 2200,
      maxAtk: 900,
      rumbleData: {
        id: 1001,
        stats: { rumbleType: 'BAL', def: 20, spd: 40 },
        special: [{ cooldown: 38, effects: [{ effect: 'upgrade' }] }],
      },
    });
    const strong = createCharacter(1002, {
      maxHp: 5200,
      maxAtk: 2400,
      rumbleData: {
        id: 1002,
        stats: { rumbleType: 'ATK', def: 180, spd: 180 },
        ability: [{ effects: [{ effect: 'buff', attributes: ['ATK'], level: 5 }] }],
        special: [{ cooldown: 18, effects: [{ effect: 'damage', amount: 8 }] }],
      },
    });

    const [topCandidate] = service.scoreCandidates([weak, strong]);

    expect(topCandidate?.character.id).toBe(strong.id);
  });

  it('selects max-level team buffs when they apply to multiple teammates', () => {
    const service = createService();
    const anchors = Array.from({ length: 7 }, (_, index) =>
      createCharacter(8100 + index, {
        primaryClass: 'Fighter',
        classes: ['Fighter'],
        partyConflictKeys: [`buff-anchor-${index}`],
        rumbleData: createRumbleData(50 + index),
      }),
    );
    const teamBuffer = createCharacter(8190, {
      maxHp: 1400,
      maxAtk: 500,
      maxRcv: 90,
      primaryClass: 'Fighter',
      classes: ['Fighter'],
      partyConflictKeys: ['team-buffer'],
      rumbleData: {
        id: 8190,
        stats: { rumbleType: 'SPT', def: 10, spd: 10 },
        ability: [
          {
            effects: [
              {
                attributes: ['ATK'],
                effect: 'buff',
                level: 1,
                targeting: { targets: ['Fighter'] },
              },
            ],
          },
          {
            effects: [
              {
                attributes: ['HP', 'ATK', 'DEF', 'RCV', 'Special CT'],
                effect: 'buff',
                level: 5,
                targeting: { targets: ['Fighter'] },
              },
            ],
          },
        ],
      },
    });
    const statStick = createCharacter(8191, {
      maxHp: 7200,
      maxAtk: 2800,
      maxRcv: 500,
      primaryClass: 'Shooter',
      classes: ['Shooter'],
      partyConflictKeys: ['stat-stick'],
      rumbleData: {
        id: 8191,
        stats: { rumbleType: 'ATK', def: 220, spd: 180 },
        ability: [
          {
            effects: [
              { attributes: ['SPD'], effect: 'buff', level: 2, targeting: { targets: ['self'] } },
            ],
          },
        ],
      },
    });

    const result = service.buildTeamFromCandidates([...anchors, teamBuffer, statStick]);
    const selectedIds = collectSelectedIds(result);

    expect(selectedIds).toContain(teamBuffer.id);
    expect(selectedIds).not.toContain(statStick.id);
  });

  it('defaults to ATK, HP, and DEF buffs over secondary buff stats', () => {
    const service = createService();
    const anchors = Array.from({ length: 7 }, (_, index) =>
      createCharacter(8150 + index, {
        primaryClass: 'Fighter',
        classes: ['Fighter'],
        partyConflictKeys: [`default-focus-anchor-${index}`],
        rumbleData: createRumbleData(55 + index),
      }),
    );
    const primaryBuffer = createCharacter(8180, {
      maxHp: 1200,
      maxAtk: 450,
      maxRcv: 80,
      primaryClass: 'Fighter',
      classes: ['Fighter'],
      partyConflictKeys: ['default-focus-buffer'],
      rumbleData: createCrewBuffRumbleData(8180, ['ATK', 'HP', 'DEF'], 8),
    });
    const secondaryBuffer = createCharacter(8181, {
      maxHp: 1200,
      maxAtk: 450,
      maxRcv: 80,
      primaryClass: 'Fighter',
      classes: ['Fighter'],
      partyConflictKeys: ['default-focus-buffer'],
      rumbleData: createCrewBuffRumbleData(8181, ['SPD', 'RCV', 'Special CT'], 8),
    });

    const result = service.buildTeamFromCandidates([...anchors, primaryBuffer, secondaryBuffer]);
    const selectedIds = collectSelectedIds(result);

    expect(result.input.buffFocus).toEqual(DEFAULT_RUMBLE_BUFF_FOCUS);
    expect(selectedIds).toContain(primaryBuffer.id);
    expect(selectedIds).not.toContain(secondaryBuffer.id);
  });

  it('uses equal rank focus for stats in the same lane', () => {
    const service = createService();
    const anchors = Array.from({ length: 7 }, (_, index) =>
      createCharacter(8160 + index, {
        primaryClass: 'Fighter',
        classes: ['Fighter'],
        partyConflictKeys: [`equal-focus-anchor-${index}`],
        rumbleData: createRumbleData(65 + index),
      }),
    );
    const atkBuffer = createCharacter(8192, {
      maxHp: 1200,
      maxAtk: 450,
      maxRcv: 80,
      primaryClass: 'Fighter',
      classes: ['Fighter'],
      partyConflictKeys: ['equal-focus-atk-buffer'],
      rumbleData: createCrewBuffRumbleData(8192, ['ATK'], 7),
    });
    const spdBuffer = createCharacter(8193, {
      maxHp: 1200,
      maxAtk: 450,
      maxRcv: 80,
      primaryClass: 'Fighter',
      classes: ['Fighter'],
      partyConflictKeys: ['equal-focus-spd-buffer'],
      rumbleData: createCrewBuffRumbleData(8193, ['SPD'], 7),
    });
    const ignoredRcvBuffer = createCharacter(8194, {
      maxHp: 1200,
      maxAtk: 450,
      maxRcv: 80,
      primaryClass: 'Fighter',
      classes: ['Fighter'],
      partyConflictKeys: ['equal-focus-rcv-buffer'],
      rumbleData: createCrewBuffRumbleData(8194, ['RCV'], 7),
    });

    const result = service.buildTeamFromCandidates(
      [...anchors, atkBuffer, spdBuffer, ignoredRcvBuffer],
      {
        buffFocus: [
          { stat: 'ATK', rank: 'primary' },
          { stat: 'HP', rank: 'ignored' },
          { stat: 'DEF', rank: 'ignored' },
          { stat: 'SPD', rank: 'primary' },
          { stat: 'RCV', rank: 'ignored' },
          { stat: 'Special CT', rank: 'ignored' },
        ],
      },
    );
    const selectedIds = collectSelectedIds(result);

    expect(selectedIds).toContain(atkBuffer.id);
    expect(selectedIds).toContain(spdBuffer.id);
    expect(selectedIds).not.toContain(ignoredRcvBuffer.id);
  });

  it('does not add focused buff synergy for ignored stats', () => {
    const service = createService();
    const anchors = Array.from({ length: 7 }, (_, index) =>
      createCharacter(8170 + index, {
        primaryClass: 'Fighter',
        classes: ['Fighter'],
        partyConflictKeys: [`ignored-focus-anchor-${index}`],
        rumbleData: createRumbleData(75 + index),
      }),
    );
    const ignoredAtkBuffer = createCharacter(8195, {
      maxHp: 1200,
      maxAtk: 450,
      maxRcv: 80,
      primaryClass: 'Fighter',
      classes: ['Fighter'],
      partyConflictKeys: ['ignored-focus-buffer'],
      rumbleData: createCrewBuffRumbleData(8195, ['ATK'], 30),
    });
    const hpBuffer = createCharacter(8196, {
      maxHp: 1200,
      maxAtk: 450,
      maxRcv: 80,
      primaryClass: 'Fighter',
      classes: ['Fighter'],
      partyConflictKeys: ['ignored-focus-buffer'],
      rumbleData: createCrewBuffRumbleData(8196, ['HP'], 30),
    });

    const result = service.buildTeamFromCandidates([...anchors, ignoredAtkBuffer, hpBuffer], {
      buffFocus: [
        { stat: 'ATK', rank: 'ignored' },
        { stat: 'HP', rank: 'primary' },
        { stat: 'DEF', rank: 'ignored' },
        { stat: 'SPD', rank: 'ignored' },
        { stat: 'RCV', rank: 'ignored' },
        { stat: 'Special CT', rank: 'ignored' },
      ],
    });
    const selectedIds = collectSelectedIds(result);

    expect(selectedIds).toContain(hpBuffer.id);
    expect(selectedIds).not.toContain(ignoredAtkBuffer.id);
  });

  it('does not value enemy debuffs without opponent-aware slots', () => {
    const service = createService();
    const anchors = Array.from({ length: 7 }, (_, index) =>
      createCharacter(8210 + index, {
        partyConflictKeys: [`no-opponent-debuff-anchor-${index}`],
        rumbleData: createRumbleData(61 + index),
      }),
    );
    const broadDebuffer = createCharacter(8288, {
      maxHp: 1200,
      maxAtk: 450,
      maxRcv: 80,
      partyConflictKeys: ['no-opponent-debuff-role'],
      rumbleData: createEnemyDebuffRumbleData(8288, ['HP', 'ATK', 'DEF', 'RCV', 'Special CT']),
    });
    const smallBuffer = createCharacter(8289, {
      maxHp: 1200,
      maxAtk: 450,
      maxRcv: 80,
      partyConflictKeys: ['no-opponent-debuff-role'],
      rumbleData: createCrewBuffRumbleData(8289, ['HP'], 35),
    });

    const result = service.buildTeamFromCandidates([...anchors, broadDebuffer, smallBuffer]);
    const selectedIds = collectSelectedIds(result);

    expect(selectedIds).toContain(smallBuffer.id);
    expect(selectedIds).not.toContain(broadDebuffer.id);
  });

  it('prefers broad enemy stat debuffs over single-target debuffs when opponent-aware', () => {
    const service = createService();
    const anchors = Array.from({ length: 4 }, (_, index) =>
      createCharacter(8200 + index, {
        partyConflictKeys: [`debuff-anchor-${index}`],
        rumbleData: createRumbleData(60 + index),
      }),
    );
    const wideDebuffer = createCharacter(8290, {
      maxHp: 1200,
      maxAtk: 450,
      maxRcv: 80,
      partyConflictKeys: ['enemy-debuffer-role'],
      rumbleData: {
        id: 8290,
        stats: { rumbleType: 'DBF', def: 10, spd: 10 },
        special: [
          {
            cooldown: 30,
            effects: [
              {
                attributes: ['ATK'],
                effect: 'debuff',
                level: 1,
                targeting: { count: 1, targets: ['enemies'] },
              },
            ],
          },
          {
            cooldown: 30,
            effects: [
              {
                attributes: ['HP', 'ATK', 'DEF', 'RCV', 'Special CT'],
                effect: 'debuff',
                level: 6,
                targeting: { targets: ['enemies'] },
              },
            ],
          },
        ],
      },
    });
    const narrowDebuffer = createCharacter(8291, {
      maxHp: 1200,
      maxAtk: 450,
      maxRcv: 80,
      partyConflictKeys: ['enemy-debuffer-role'],
      rumbleData: {
        id: 8291,
        stats: { rumbleType: 'DBF', def: 10, spd: 10 },
        special: [
          {
            cooldown: 30,
            effects: [
              {
                attributes: ['HP', 'ATK', 'DEF', 'RCV', 'Special CT'],
                effect: 'debuff',
                level: 6,
                targeting: { count: 1, priority: 'highest', stat: 'ATK', targets: ['enemies'] },
              },
            ],
          },
        ],
      },
    });

    const opponent = createCharacter(8292, {
      maxHp: 8500,
      maxAtk: 5200,
      maxRcv: 800,
      partyConflictKeys: ['wide-debuff-opponent'],
      rumbleData: createRumbleData(70),
    });

    const result = service.buildTeamFromCandidates(
      [...anchors, wideDebuffer, narrowDebuffer, opponent],
      {
        candidateCharacterIds: [...anchors, wideDebuffer, narrowDebuffer].map(
          (character) => character.id,
        ),
        opponentSlots: [{ characterId: opponent.id, role: 'active', index: 0 }],
      },
    );
    const selectedIds = collectSelectedIds(result);

    expect(selectedIds).toContain(wideDebuffer.id);
    expect(selectedIds).not.toContain(narrowDebuffer.id);
  });

  it('keeps the same build when opponent context is empty', () => {
    const service = createService();
    const candidates = Array.from({ length: 9 }, (_, index) =>
      createCharacter(9100 + index, {
        partyConflictKeys: [`empty-opponent-${index}`],
        rumbleData: createRumbleData(100 + index),
      }),
    );

    const baseline = service.buildTeamFromCandidates(candidates);
    const withEmptyOpponent = service.buildTeamFromCandidates(candidates, { opponentSlots: [] });

    expect(collectSelectedIds(withEmptyOpponent)).toEqual(collectSelectedIds(baseline));
    expect(withEmptyOpponent.totalScore).toBe(baseline.totalScore);
  });

  it('weights active opponent slots above bench slots for matching debuffs', () => {
    const service = createService();
    const anchors = Array.from({ length: 4 }, (_, index) =>
      createCharacter(9200 + index, {
        maxHp: 1800,
        maxAtk: 700,
        maxRcv: 100,
        partyConflictKeys: [`active-opponent-anchor-${index}`],
        rumbleData: createRumbleData(120 + index),
      }),
    );
    const activeThreat = createCharacter(9290, {
      maxAtk: 7200,
      type: 'DEX',
      partyConflictKeys: ['active-threat'],
      rumbleData: createRumbleData(130),
    });
    const benchThreat = createCharacter(9291, {
      type: 'STR',
      partyConflictKeys: ['bench-threat'],
      rumbleData: {
        ...createRumbleData(131),
        stats: { rumbleType: 'DEF', def: 1000, spd: 80 },
      },
    });
    const atkDebuffer = createCharacter(9292, {
      maxHp: 2400,
      maxAtk: 900,
      maxRcv: 130,
      partyConflictKeys: ['opponent-counter-role'],
      rumbleData: createEnemyDebuffRumbleData(9292, ['ATK']),
    });
    const defDebuffer = createCharacter(9293, {
      maxHp: 2400,
      maxAtk: 900,
      maxRcv: 130,
      partyConflictKeys: ['opponent-counter-role'],
      rumbleData: createEnemyDebuffRumbleData(9293, ['DEF']),
    });

    const result = service.buildTeamFromCandidates(
      [...anchors, activeThreat, benchThreat, atkDebuffer, defDebuffer],
      {
        opponentSlots: [
          { characterId: activeThreat.id, role: 'active', index: 0 },
          { characterId: benchThreat.id, role: 'bench', index: 0 },
        ],
      },
    );
    const selectedIds = collectSelectedIds(result);

    expect(selectedIds).toContain(atkDebuffer.id);
    expect(selectedIds).not.toContain(defDebuffer.id);
  });

  it('prefers enemy debuffs that match opponent strengths when opponent-aware', () => {
    const service = createService();
    const anchors = Array.from({ length: 4 }, (_, index) =>
      createCharacter(9300 + index, {
        maxHp: 1800,
        maxAtk: 700,
        maxRcv: 100,
        partyConflictKeys: [`matching-debuff-anchor-${index}`],
        rumbleData: createRumbleData(140 + index),
      }),
    );
    const opponent = createCharacter(9390, {
      maxAtk: 7600,
      partyConflictKeys: ['matching-debuff-opponent'],
      rumbleData: createRumbleData(150),
    });
    const matchingDebuffer = createCharacter(9391, {
      maxHp: 2400,
      maxAtk: 900,
      maxRcv: 130,
      partyConflictKeys: ['matching-debuff-role'],
      rumbleData: createEnemyDebuffRumbleData(9391, ['ATK']),
    });
    const unrelatedDebuffer = createCharacter(9392, {
      maxHp: 2400,
      maxAtk: 900,
      maxRcv: 130,
      partyConflictKeys: ['matching-debuff-role'],
      rumbleData: createEnemyDebuffRumbleData(9392, ['RCV']),
    });

    const result = service.buildTeamFromCandidates(
      [...anchors, opponent, matchingDebuffer, unrelatedDebuffer],
      {
        candidateCharacterIds: [...anchors, matchingDebuffer, unrelatedDebuffer].map(
          (character) => character.id,
        ),
        opponentSlots: [{ characterId: opponent.id, role: 'active', index: 0 }],
      },
    );
    const selectedIds = collectSelectedIds(result);

    expect(selectedIds).toContain(matchingDebuffer.id);
    expect(selectedIds).not.toContain(unrelatedDebuffer.id);
    expect(result.topFactors).toContain('Opponent counters: 1 matched');
  });

  it('prefers resistance and type damage reduction that match the opponent team', () => {
    const service = createService();
    const anchors = Array.from({ length: 4 }, (_, index) =>
      createCharacter(9400 + index, {
        maxHp: 1800,
        maxAtk: 700,
        maxRcv: 100,
        partyConflictKeys: [`matching-resistance-anchor-${index}`],
        rumbleData: createRumbleData(160 + index),
      }),
    );
    const opponent = createCharacter(9490, {
      type: 'STR',
      partyConflictKeys: ['matching-resistance-opponent'],
      rumbleData: createEnemyDebuffRumbleData(9490, ['Paralysis']),
    });
    const matchingResistance = createCharacter(9491, {
      maxHp: 2600,
      maxAtk: 850,
      maxRcv: 130,
      partyConflictKeys: ['matching-resistance-role'],
      rumbleData: createResistanceRumbleData(9491, 'Paralysis', '[STR]'),
    });
    const unrelatedResistance = createCharacter(9492, {
      maxHp: 2600,
      maxAtk: 850,
      maxRcv: 130,
      partyConflictKeys: ['matching-resistance-role'],
      rumbleData: createResistanceRumbleData(9492, 'Silence', '[DEX]'),
    });

    const result = service.buildTeamFromCandidates(
      [...anchors, opponent, matchingResistance, unrelatedResistance],
      {
        candidateCharacterIds: [...anchors, matchingResistance, unrelatedResistance].map(
          (character) => character.id,
        ),
        opponentSlots: [{ characterId: opponent.id, role: 'active', index: 0 }],
      },
    );
    const selectedSlots = [...result.activeSlots, ...result.benchSlots];

    expect(selectedSlots.map((slot) => slot.unit.character.id)).toContain(matchingResistance.id);
    expect(selectedSlots.map((slot) => slot.unit.character.id)).not.toContain(
      unrelatedResistance.id,
    );
    expect(
      selectedSlots.find((slot) => slot.unit.character.id === matchingResistance.id)?.reasonChips,
    ).toEqual(expect.arrayContaining(['Opponent counter', 'Matched resistance']));
  });

  it('does not treat self-only buffs as team buff synergy', () => {
    const service = createService();
    const anchors = Array.from({ length: 4 }, (_, index) =>
      createCharacter(8300 + index, {
        primaryClass: 'Fighter',
        classes: ['Fighter'],
        partyConflictKeys: [`self-anchor-${index}`],
        rumbleData: createRumbleData(70 + index),
      }),
    );
    const teamBuffer = createCharacter(8390, {
      maxHp: 1300,
      maxAtk: 500,
      maxRcv: 90,
      primaryClass: 'Fighter',
      classes: ['Fighter'],
      partyConflictKeys: ['small-team-buffer'],
      rumbleData: {
        id: 8390,
        stats: { rumbleType: 'SPT', def: 10, spd: 10 },
        ability: [
          {
            effects: [
              {
                attributes: ['ATK'],
                effect: 'buff',
                level: 3,
                targeting: { targets: ['Fighter'] },
              },
            ],
          },
        ],
      },
    });
    const selfBuffer = createCharacter(8391, {
      maxHp: 1800,
      maxAtk: 650,
      maxRcv: 120,
      primaryClass: 'Fighter',
      classes: ['Fighter'],
      partyConflictKeys: ['small-team-buffer'],
      rumbleData: {
        id: 8391,
        stats: { rumbleType: 'SPT', def: 20, spd: 20 },
        ability: [
          {
            effects: [
              { attributes: ['ATK'], effect: 'buff', level: 20, targeting: { targets: ['self'] } },
            ],
          },
        ],
      },
    });

    const result = service.buildTeamFromCandidates([...anchors, teamBuffer, selfBuffer]);
    const selectedIds = collectSelectedIds(result);

    expect(selectedIds).toContain(teamBuffer.id);
    expect(selectedIds).not.toContain(selfBuffer.id);
  });

  it('uses base max levels for synergy instead of LLB effects', () => {
    const service = createService();
    const anchors = Array.from({ length: 7 }, (_, index) =>
      createCharacter(8400 + index, {
        primaryClass: 'Fighter',
        classes: ['Fighter'],
        partyConflictKeys: [`llb-anchor-${index}`],
        rumbleData: createRumbleData(80 + index),
      }),
    );
    const baseBuffer = createCharacter(8490, {
      maxHp: 1300,
      maxAtk: 500,
      maxRcv: 90,
      primaryClass: 'Fighter',
      classes: ['Fighter'],
      partyConflictKeys: ['base-buffer'],
      rumbleData: {
        id: 8490,
        stats: { rumbleType: 'SPT', def: 10, spd: 10 },
        ability: [
          {
            effects: [
              {
                attributes: ['DEF'],
                effect: 'buff',
                level: 4,
                targeting: { targets: ['Fighter'] },
              },
            ],
          },
        ],
      },
    });
    const llbOnlyBuffer = createCharacter(8491, {
      maxHp: 1600,
      maxAtk: 600,
      maxRcv: 110,
      primaryClass: 'Fighter',
      classes: ['Fighter'],
      partyConflictKeys: ['llb-only-buffer'],
      rumbleData: {
        id: 8491,
        stats: { rumbleType: 'SPT', def: 12, spd: 12 },
        ability: [
          {
            effects: [
              { attributes: ['ATK'], effect: 'buff', level: 1, targeting: { targets: ['self'] } },
            ],
          },
        ],
        llbability: [
          {
            effects: [
              {
                attributes: ['ATK'],
                effect: 'buff',
                level: 10,
                targeting: { targets: ['Fighter'] },
              },
            ],
          },
        ],
      },
    });

    const result = service.buildTeamFromCandidates([...anchors, baseBuffer, llbOnlyBuffer]);
    const selectedIds = collectSelectedIds(result);

    expect(selectedIds).toContain(baseBuffer.id);
    expect(selectedIds).not.toContain(llbOnlyBuffer.id);
  });

  it('scores inherited max-level rumble buffs through basedOn data', () => {
    const service = createService();
    const anchors = Array.from({ length: 7 }, (_, index) =>
      createCharacter(8500 + index, {
        primaryClass: 'Fighter',
        classes: ['Fighter'],
        partyConflictKeys: [`inherited-anchor-${index}`],
        rumbleData: createRumbleData(90 + index),
      }),
    );
    const base = createCharacter(8589, {
      primaryClass: 'Fighter',
      classes: ['Fighter'],
      rumbleData: {
        id: 8589,
        stats: { rumbleType: 'SPT', def: 10, spd: 10 },
        ability: [
          {
            effects: [
              {
                attributes: ['ATK', 'Special CT'],
                effect: 'buff',
                level: 5,
                targeting: { targets: ['Fighter'] },
              },
            ],
          },
        ],
      },
    });
    const inheritedBuffer = createCharacter(8590, {
      maxHp: 1300,
      maxAtk: 500,
      maxRcv: 90,
      primaryClass: 'Fighter',
      classes: ['Fighter'],
      partyConflictKeys: ['inherited-buffer'],
      rumbleData: { id: 8590, basedOn: 8589 },
    });
    const statStick = createCharacter(8591, {
      maxHp: 6800,
      maxAtk: 2600,
      maxRcv: 460,
      primaryClass: 'Shooter',
      classes: ['Shooter'],
      partyConflictKeys: ['inherited-stat-stick'],
      rumbleData: {
        id: 8591,
        stats: { rumbleType: 'ATK', def: 210, spd: 170 },
        ability: [
          {
            effects: [
              { attributes: ['ATK'], effect: 'buff', level: 2, targeting: { targets: ['self'] } },
            ],
          },
        ],
      },
    });

    const result = service.buildTeamFromCandidates([...anchors, base, inheritedBuffer, statStick]);
    const selectedIds = collectSelectedIds(result);

    expect(selectedIds).toContain(inheritedBuffer.id);
    expect(selectedIds).not.toContain(statStick.id);
  });

  it('labels usable Rumble data without adding recency chips', () => {
    const service = createService();
    const [candidate] = service.scoreCandidates([
      createCharacter(5001, {
        rumbleData: createRumbleData(1),
      }),
    ]);

    expect(candidate?.reasonChips).toContain('Rumble Data');
    expect(candidate?.reasonChips).not.toContain('Recent unit');
  });

  it('returns empty and partial results for empty or insufficient candidate pools', () => {
    const service = createService();
    const emptyResult = service.buildTeamFromCandidates([]);
    const partialResult = service.buildTeamFromCandidates([
      createCharacter(7001, { rumbleData: createRumbleData(1) }),
      createCharacter(7002, { rumbleData: createRumbleData(2) }),
      createCharacter(7003, { rumbleData: createRumbleData(3) }),
    ]);

    expect(emptyResult.candidateCount).toBe(0);
    expect(emptyResult.selectedCount).toBe(0);
    expect(partialResult.candidateCount).toBe(3);
    expect(partialResult.selectedCount).toBe(3);
    expect(partialResult.activeSlots).toHaveLength(3);
    expect(partialResult.benchSlots).toHaveLength(0);
  });

  it('always keeps bench empty in optional mode', () => {
    const service = createService();
    const candidates = Array.from({ length: 8 }, (_, index) =>
      createCharacter(7100 + index, {
        maxHp: 20000 + index * 100,
        maxAtk: 70000 + index * 100,
        maxRcv: 360,
        partyConflictKeys: [`optional-active-only-${index}`],
        rumbleData: {
          ...createRumbleData(index + 1),
          cost: 55,
        },
      }),
    );

    const result = service.buildTeamFromCandidates(candidates, { requireFullTeam: false });

    expect(result.input.requireFullTeam).toBe(false);
    expect(result.activeSlots).toHaveLength(5);
    expect(result.benchSlots).toHaveLength(0);
    expect(result.selectedCount).toBe(5);
    expect(resolveSelectedRumbleCost(result)).toBeLessThanOrEqual(300);
  });

  it('prioritizes active-only teams closest to 300 cost in closest-cost mode', () => {
    const service = createService();
    const lowCostPowerUnits = Array.from({ length: 5 }, (_, index) =>
      createCharacter(7400 + index, {
        maxHp: 90000 + index * 100,
        maxAtk: 300000 + index * 100,
        maxRcv: 5000,
        partyConflictKeys: [`low-cost-power-${index}`],
        rumbleData: {
          ...createRumbleData(100 + index),
          cost: 10,
        },
      }),
    );
    const targetCostUnits = Array.from({ length: 5 }, (_, index) =>
      createCharacter(7450 + index, {
        maxHp: 2000 + index * 100,
        maxAtk: 700 + index * 100,
        maxRcv: 80,
        partyConflictKeys: [`target-cost-${index}`],
        rumbleData: {
          ...createRumbleData(120 + index),
          cost: 60,
        },
      }),
    );

    const result = service.buildTeamFromCandidates(
      [...lowCostPowerUnits, ...targetCostUnits],
      { requireFullTeam: false },
      { resultMode: 'closestCost' },
    );

    expect(result.activeSlots).toHaveLength(5);
    expect(result.benchSlots).toHaveLength(0);
    expect(resolveSelectedRumbleCost(result)).toBe(300);
    expect(
      result.activeSlots.map((slot) => slot.unit.character.id).sort((left, right) => left - right),
    ).toEqual(targetCostUnits.map((unit) => unit.id).sort((left, right) => left - right));
  });

  it('does not add optional bench units only for buffs or enemy debuffs while benched', () => {
    const service = createService();
    const anchors = Array.from({ length: 5 }, (_, index) =>
      createCharacter(7200 + index, {
        maxHp: 20000 + index * 100,
        maxAtk: 70000 + index * 100,
        maxRcv: 1200,
        partyConflictKeys: [`optional-buff-anchor-${index}`],
        rumbleData: {
          ...createRumbleData(20 + index),
          cost: 55,
        },
      }),
    );
    const teamBuffer = createCharacter(7290, {
      maxHp: 1200,
      maxAtk: 500,
      maxRcv: 80,
      partyConflictKeys: ['optional-team-buffer'],
      rumbleData: {
        ...createCrewBuffRumbleData(7290, ['ATK'], 20),
        cost: 20,
        special: [
          {
            cooldown: 20,
            effects: [
              {
                attributes: ['ATK', 'DEF', 'Special CT'],
                effect: 'debuff',
                level: 20,
                targeting: { targets: ['enemies'] },
              },
            ],
          },
        ],
      },
    });

    const result = service.buildTeamFromCandidates([...anchors, teamBuffer], {
      requireFullTeam: false,
    });

    expect(result.activeSlots).toHaveLength(5);
    expect(result.benchSlots.map((slot) => slot.unit.character.id)).not.toContain(teamBuffer.id);
  });

  it('does not add optional bench units even when strong replacements remain available', () => {
    const service = createService();
    const anchors = Array.from({ length: 5 }, (_, index) =>
      createCharacter(7300 + index, {
        maxHp: 40000 + index * 100,
        maxAtk: 200000 + index * 100,
        maxRcv: 1200,
        partyConflictKeys: [`optional-counter-anchor-${index}`],
        rumbleData: {
          ...createRumbleData(30 + index),
          cost: 50,
        },
      }),
    );
    const strongReplacement = createCharacter(7391, {
      maxHp: 30000,
      maxAtk: 100000,
      maxRcv: 900,
      partyConflictKeys: ['optional-strong-replacement'],
      rumbleData: {
        ...createRumbleData(90),
        cost: 30,
      },
    });
    const weakFiller = createCharacter(7392, {
      maxHp: 1200,
      maxAtk: 500,
      maxRcv: 80,
      partyConflictKeys: ['optional-weak-filler'],
      rumbleData: {
        ...createRumbleData(91),
        cost: 20,
      },
    });

    const result = service.buildTeamFromCandidates([...anchors, strongReplacement, weakFiller], {
      requireFullTeam: false,
    });

    expect(result.activeSlots).toHaveLength(5);
    expect(result.benchSlots).toHaveLength(0);
    expect(resolveSelectedRumbleCost(result)).toBeLessThanOrEqual(300);
  });
});

function createService(candidates: CharacterDetailRecord[] = []): AutoTeamBuilderRumbleService {
  return new AutoTeamBuilderRumbleService({
    getRumbleBuilderCandidates: vi.fn().mockResolvedValue(candidates),
  } as never);
}

function collectSelectedIds(
  result: ReturnType<AutoTeamBuilderRumbleService['buildTeamFromCandidates']>,
): number[] {
  return [...result.activeSlots, ...result.benchSlots].map((slot) => slot.unit.character.id);
}

function resolveSelectedRumbleCost(
  result: ReturnType<AutoTeamBuilderRumbleService['buildTeamFromCandidates']>,
): number {
  return [...result.activeSlots, ...result.benchSlots].reduce(
    (total, slot) => total + (slot.unit.normalized.cost ?? 0),
    0,
  );
}

function createRumbleData(index: number): Record<string, unknown> {
  return {
    id: index + 1,
    cost: 30,
    stats: {
      rumbleType: index % 3 === 0 ? 'ATK' : 'BAL',
      def: 80 + index * 4,
      spd: 90 + index * 3,
    },
    ability: [
      {
        effects: [
          {
            effect: index % 2 === 0 ? 'buff' : 'damage',
            attributes: index % 2 === 0 ? ['ATK'] : [],
            level: 2 + (index % 4),
          },
        ],
      },
    ],
    special: [
      {
        cooldown: 28 - Math.min(index, 8),
        effects: [{ effect: 'damage', amount: 3 + index }],
      },
    ],
  };
}

function createEnemyDebuffRumbleData(id: number, attributes: string[]): Record<string, unknown> {
  return {
    id,
    stats: { rumbleType: 'DBF', def: 30, spd: 30 },
    special: [
      {
        cooldown: 24,
        effects: [
          {
            attributes,
            effect: 'debuff',
            level: 6,
            targeting: { targets: ['enemies'] },
          },
        ],
      },
    ],
  };
}

function createResistanceRumbleData(
  id: number,
  debuffAttribute: string,
  damageType: string,
): Record<string, unknown> {
  return {
    id,
    stats: { rumbleType: 'DEF', def: 65, spd: 45 },
    resilience: [
      { attribute: debuffAttribute, chance: 80, type: 'debuff' },
      { attribute: damageType, percentage: 35, type: 'damage' },
    ],
    special: [
      {
        cooldown: 28,
        effects: [{ effect: 'guard', attributes: ['DEF'], level: 2 }],
      },
    ],
  };
}

function createCrewBuffRumbleData(
  id: number,
  attributes: string[],
  level: number,
): Record<string, unknown> {
  return {
    id,
    stats: { rumbleType: 'BUF', def: 30, spd: 30 },
    ability: [
      {
        effects: [
          {
            attributes,
            effect: 'buff',
            level,
            targeting: { targets: ['crew'] },
          },
        ],
      },
    ],
  };
}

function createCharacter(
  id: number,
  overrides: Partial<{
    name: string;
    type: string;
    primaryClass: string;
    secondaryClass: string | null;
    classes: string[];
    maxHp: number;
    maxAtk: number;
    maxRcv: number;
    partyConflictKeys: string[];
    rumbleData: Record<string, unknown> | null;
  }> = {},
): CharacterDetailRecord {
  const primaryClass = overrides.primaryClass ?? 'Fighter';
  const secondaryClass = overrides.secondaryClass ?? null;

  return {
    id,
    name: overrides.name ?? `Unit ${id}`,
    searchText: `unit ${id}`,
    isIncomplete: false,
    type: overrides.type ?? 'DEX',
    classes: overrides.classes ?? ([primaryClass, secondaryClass].filter(Boolean) as string[]),
    primaryClass,
    secondaryClass,
    stars: 6,
    cost: 55,
    combo: 4,
    captainHpBoost: 0,
    captainAtkBoost: 0,
    captainAverageBoost: 0,
    stats: {
      min: { hp: 1000, atk: 400, rcv: 120 },
      max: {
        hp: overrides.maxHp ?? 4200,
        atk: overrides.maxAtk ?? 1900,
        rcv: overrides.maxRcv ?? 320,
      },
      growth: 3,
    },
    regionAvailability: {
      exactLocal: true,
      thumbnailGlobal: false,
      thumbnailJapan: false,
    },
    assets: {
      exactLocal: null,
      thumbnailLocal: null,
      thumbnailGlobal: null,
      thumbnailJapan: null,
    },
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
      partyConflictKeys: overrides.partyConflictKeys ?? [`unit-${id}`],
      characterTags: [],
      builderAbilities: [],
      sailorAbilities: [],
      sailorNotes: null,
      limitBreak: [],
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      exSuperData: null,
      superType: null,
      superTandemData: null,
      finalTapData: null,
      rushSugoSpecialData: null,
      superClass: null,
      switchEffectData: null,
      captainShiftData: null,
      rumbleData: overrides.rumbleData ?? null,
    },
  };
}
