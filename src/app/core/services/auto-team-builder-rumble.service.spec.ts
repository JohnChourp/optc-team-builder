import { describe, expect, it, vi } from 'vitest';

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

  it('prefers broad enemy stat debuffs over single-target debuffs', () => {
    const service = createService();
    const anchors = Array.from({ length: 7 }, (_, index) =>
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

    const result = service.buildTeamFromCandidates([...anchors, wideDebuffer, narrowDebuffer]);
    const selectedIds = collectSelectedIds(result);

    expect(selectedIds).toContain(wideDebuffer.id);
    expect(selectedIds).not.toContain(narrowDebuffer.id);
  });

  it('does not treat self-only buffs as team buff synergy', () => {
    const service = createService();
    const anchors = Array.from({ length: 7 }, (_, index) =>
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
      partyConflictKeys: ['self-buffer'],
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

function createRumbleData(index: number): Record<string, unknown> {
  return {
    id: index + 1,
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
