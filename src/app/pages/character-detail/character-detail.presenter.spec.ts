import { describe, expect, it } from 'vitest';

import { type CharacterDetailRecord } from '../../core/models/optc.models';
import { buildCharacterDetailViewModel, buildRumbleCardModel } from './character-detail.presenter';

describe('character-detail presenter', () => {
  it('exposes captain coverage tier breakdown from stored coverage entries', () => {
    const view = buildCharacterDetailViewModel(
      createCharacterDetailRecord({
        id: 4571,
        name: 'Imu - Occupant of the Empty Throne',
        detail: {
          characterId: 4571,
          captainAbility:
            'Boosts ATK of Cost 70 or more characters by 6x, boosts ATK of all other characters by 4x, boosts HP of all characters by 1.5x.',
          captainAbilityVariants: [
            {
              key: 'captain',
              label: 'Captain Ability',
              text: 'Boosts ATK of Cost 70 or more characters by 6x, boosts ATK of all other characters by 4x, boosts HP of all characters by 1.5x.',
            },
          ],
          captainAbilityCoverage: {
            entries: [
              {
                key: 'captain',
                label: 'Captain Ability',
                tiers: [
                  {
                    tier: 1,
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
                    clauses: [
                      'boosts ATK of all other characters by 4x',
                      'boosts HP of all characters by 1.5x',
                    ],
                    atkBoost: 4,
                    hpBoost: 1.5,
                  },
                  {
                    tier: 2,
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
                    clauses: [
                      'Boosts ATK of Cost 70 or more characters by 6x',
                      'boosts HP of all characters by 1.5x',
                    ],
                    atkBoost: 6,
                    hpBoost: 1.5,
                  },
                  {
                    tier: 3,
                    kind: 'conditional',
                    scope: 'subset',
                    characterConditions: {
                      universal: false,
                      fallbackOther: false,
                      selfOnly: false,
                      types: [],
                      classes: [],
                      characterTags: [],
                      costRange: { min: 70 },
                    },
                    teamConditions: [
                      { kind: 'requires-captain', rawClause: 'this character is your Captain' },
                    ],
                    fieldConditions: [],
                    triggerConditions: [
                      {
                        kind: 'action-special-excellent',
                        durationTurns: 3,
                        rawClause: 'performs EXCELLENT with their Action Special',
                      },
                    ],
                    clauses: ['boosts ATK of Cost 70 or more characters by 6.5x'],
                    atkBoost: 6.5,
                  },
                ],
              },
            ],
          },
        },
      }),
    );

    const summary = view.captainAbilitySummary;
    expect(summary?.coverageEntries).toHaveLength(1);
    const tiers = summary?.coverageEntries[0]?.tiers ?? [];
    expect(tiers).toHaveLength(3);
    expect(tiers[0]).toMatchObject({
      tier: 1,
      kind: 'baseline',
      scopeLabel: 'all other characters',
      atkBoost: 4,
      hpBoost: 1.5,
    });
    expect(tiers[1]).toMatchObject({
      tier: 2,
      kind: 'unconditional-top',
      scopeLabel: 'all characters · Cost 70+',
      atkBoost: 6,
    });
    expect(tiers[2]).toMatchObject({
      tier: 3,
      kind: 'conditional',
      atkBoost: 6.5,
    });
    expect(tiers[2]?.conditionLines.length).toBeGreaterThan(0);
    expect(tiers[2]?.conditionLines.some((line) => line.startsWith('Team:'))).toBe(true);
    expect(tiers[2]?.conditionLines.some((line) => line.startsWith('Trigger:'))).toBe(true);
  });

  it('formats full rumble data into readable rows, pattern, and level entries', () => {
    const rumbleCard = buildRumbleCardModel({
      id: 13,
      stats: {
        def: 164,
        rumbleType: 'DBF',
        spd: 124,
      },
      target: {
        comparator: 'lowest',
        criteria: 'HP',
      },
      pattern: [
        {
          action: 'attack',
          type: 'Normal',
        },
        {
          action: 'heal',
          area: 'Self',
          level: 2,
        },
      ],
      ability: [
        {
          effects: [
            {
              attributes: ['SPD'],
              effect: 'buff',
              level: 3,
              targeting: {
                targets: ['crew'],
              },
            },
          ],
        },
      ],
      special: [
        {
          cooldown: 23,
          effects: [
            {
              attributes: ['Silence'],
              chance: 80,
              duration: 10,
              effect: 'hinderance',
              targeting: {
                count: 1,
                priority: 'highest',
                stat: 'ATK',
                targets: ['enemies'],
              },
            },
          ],
        },
      ],
    });

    expect(rumbleCard?.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'DEF', value: '164' }),
        expect.objectContaining({ label: 'SPD', value: '124' }),
        expect.objectContaining({ labelKey: 'fields.target', value: 'lowest HP target' }),
      ]),
    );
    expect(rumbleCard?.lists).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labelKey: 'fields.pattern',
          items: expect.arrayContaining(['attack • Normal', 'heal • Self • Lv 2']),
        }),
      ]),
    );
    expect(rumbleCard?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Passive',
          lists: expect.arrayContaining([
            expect.objectContaining({
              labelKey: 'fields.effects',
              items: expect.arrayContaining(['buff • SPD • Lv 3 • crew']),
            }),
          ]),
        }),
        expect.objectContaining({
          title: 'Special',
          rows: expect.arrayContaining([
            expect.objectContaining({ labelKey: 'fields.cooldown', value: '23' }),
          ]),
        }),
      ]),
    );
  });

  it('formats basedOn-only rumble data with resolved character name', () => {
    const rumbleCard = buildRumbleCardModel(
      {
        id: 16,
        basedOn: 14,
      },
      'Usopp - Tabasco Star',
    );

    expect(rumbleCard?.texts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labelKey: 'fields.inheritsFrom',
          value: 'Usopp - Tabasco Star',
        }),
      ]),
    );
  });

  it('formats materialized Rumble levels as real effects instead of override rows', () => {
    const rumbleCard = buildRumbleCardModel({
      id: 13,
      ability: [
        {
          effects: [
            {
              attributes: ['SPD'],
              effect: 'buff',
              level: 1,
              targeting: {
                targets: ['crew'],
              },
            },
          ],
        },
        {
          effects: [
            {
              attributes: ['SPD'],
              effect: 'buff',
              level: 2,
              targeting: {
                targets: ['crew'],
              },
            },
          ],
        },
      ],
    });
    const renderedText = JSON.stringify(rumbleCard);

    expect(renderedText).toContain('buff • SPD • Lv 2 • crew');
    expect(renderedText).not.toContain('Override');
  });

  it('formats unexpected rumble keys through structured fallback entries', () => {
    const rumbleCard = buildRumbleCardModel({
      id: 99,
      strangePayload: {
        alpha: 1,
        beta: ['x', 'y'],
        gamma: {
          delta: 'z',
        },
      },
      anotherArray: [
        {
          foo: 'bar',
          baz: 3,
        },
      ],
    });

    expect(rumbleCard?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Strange Payload',
          rows: expect.arrayContaining([
            expect.objectContaining({ label: 'Alpha', value: '1' }),
            expect.objectContaining({ label: 'Gamma Delta', value: 'z' }),
          ]),
          lists: expect.arrayContaining([
            expect.objectContaining({ label: 'Beta', items: ['x', 'y'] }),
          ]),
        }),
        expect.objectContaining({
          title: 'Another Array 1',
          rows: expect.arrayContaining([
            expect.objectContaining({ label: 'Foo', value: 'bar' }),
            expect.objectContaining({ label: 'Baz', value: '3' }),
          ]),
        }),
      ]),
    );
  });

  it('formats comma-backed multi-types for display', () => {
    const viewModel = buildCharacterDetailViewModel(
      createCharacterDetailRecord({
        type: 'STR,DEX',
      }),
    );
    expect(viewModel.heroMeta).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ labelKey: 'fields.type', value: 'STR / DEX' }),
      ]),
    );
    expect(viewModel.groups.map((group) => group.titleKey)).not.toContain('sections.overview');
  });

  it('uses starsLabel for hero rarity when present', () => {
    const viewModel = buildCharacterDetailViewModel(
      createCharacterDetailRecord({
        stars: 6,
        starsLabel: '6+',
      }),
    );

    expect(viewModel.heroMeta).toEqual(
      expect.arrayContaining([expect.objectContaining({ labelKey: 'fields.stars', value: '6+' })]),
    );
  });

  it('shows support targets and only the max support effect', () => {
    const viewModel = buildCharacterDetailViewModel(
      createCharacterDetailRecord({
        detail: {
          supportData: [
            {
              supportedCharactersText: '[STR] Powerhouse characters',
              levelDescriptions: ['Boosts Color Affinity by 1.5x.'],
            },
          ],
        },
      }),
    );
    const supportCard = viewModel.groups
      .flatMap((group) => group.cards)
      .find((card) => card.titleKey === 'sections.supportData');

    expect(supportCard?.entries).toEqual([
      expect.objectContaining({
        rows: [
          expect.objectContaining({
            labelKey: 'support.supportedCharactersLabel',
            value: '[STR] Powerhouse characters',
          }),
        ],
        lists: [
          expect.objectContaining({
            labelKey: 'support.maxLevelEffect',
            items: ['Boosts Color Affinity by 1.5x.'],
          }),
        ],
      }),
    ]);
  });

  it('renders max-only Rumble sections with user-facing titles', () => {
    const rumbleCard = buildRumbleCardModel({
      id: 4306,
      ability: [{ effects: [{ attributes: ['ATK'], effect: 'buff', level: 5 }] }],
      special: [{ cooldown: 28, effects: [{ amount: 2.5, effect: 'damage', type: 'atk' }] }],
      llbability: [{ effects: [{ attributes: ['ATK'], effect: 'buff', level: 6 }] }],
      llbspecial: [{ cooldown: 28, effects: [{ amount: 2.75, effect: 'damage', type: 'atk' }] }],
      gpability: [{ effects: [{ attributes: ['HP', 'SPD'], effect: 'buff', level: 3 }] }],
      gpspecial: [{ uses: 2, effects: [{ amount: 1000, effect: 'damage', type: 'fixed' }] }],
      resilience: [{ attribute: 'Special Bind', chance: 100, type: 'debuff' }],
      llbresilience: [{ attribute: '[DEX]', percentage: 40, type: 'damage' }],
    });

    expect(rumbleCard?.entries.map((entry) => entry.title)).toEqual([
      'Passive',
      'Special',
      'LLB Passive',
      'LLB Special',
      'GP Passive',
      'GP Special',
      'Resilience',
      'LLB Resilience',
    ]);
  });

  it('builds support and battle mode groups from the character detail record', () => {
    const viewModel = buildCharacterDetailViewModel(
      {
        id: 501,
        name: 'Test Character',
        type: 'STR',
        classes: ['Fighter', 'Slasher'],
        primaryClass: 'Fighter',
        secondaryClass: 'Slasher',
        isIncomplete: false,
        stars: 6,
        cost: 55,
        combo: 4,
        captainHpBoost: 1,
        captainAtkBoost: 1,
        captainAverageBoost: 1,
        stats: {
          min: { hp: 1200, atk: 600, rcv: 200 },
          max: { hp: 3500, atk: 1800, rcv: 420 },
          growth: 5,
        },
        regionAvailability: {
          exactLocal: true,
          thumbnailGlobal: true,
          thumbnailJapan: true,
        },
        assets: {
          exactLocal: null,
          thumbnailGlobal: null,
          thumbnailJapan: null,
        },
        imageUrl: '/assets/test.png',
        detailImageUrl: '/assets/test-detail.png',
        detail: {
          characterId: 501,
          captainAbility: 'Boosts ATK.',
          captainAbilityVariants: [
            {
              key: 'base',
              label: 'Base Captain Ability',
              text: 'Boosts ATK.',
            },
          ],
          captainNotes: null,
          specialName: 'Impact Burst',
          specialText: 'Deals damage.',
          specialNotes: null,
          superSpecialText: null,
          superSpecialCriteriaText: null,
          superSpecialNotes: null,
          superSpecialCriteria: null,
          partyConflictKeys: ['tony tony chopper'],
          characterTags: ['Straw Hat Pirates', 'Giant'],
          builderAbilities: [
            {
              key: 'bind',
              label: 'Bind removal',
              minTurns: 5,
              isCompleteRemoval: true,
              slotTokens: ['captain'],
              source: 'specialText',
              coverageMode: 'explicit',
            },
          ],
          sailorAbilities: [],
          sailorNotes: 'Works as sailor.',
          potentialAbilities: [{ Name: 'Critical Hit', description: ['Increases crit chance.'] }],
          supportData: [
            {
              supportedCharactersText: 'Luffy, Zoro',
              levelDescriptions: ['Lv 5: boosts ATK.'],
            },
          ],
          swapData: null,
          vsSpecial: null,
          exSuperData: {
            activationRequirement: 'When character becomes Yamato & Momonosuke.',
            exSuperSpecial: 'Changes STR characters to Super STR.',
          },
          superType: {
            class: 'Fighter',
          },
          superTandemData: {
            requirement: 'At final battle and any 2 listed characters are on the crew',
            levels: [
              {
                level: 5,
                effect: 'Applies ATK Boost (Tandem) of 2.5x to DEX and STR characters for 1 turn.',
              },
            ],
            criteria: {
              rawText: 'At final battle and any 2 listed characters are on the crew',
              requiresCaptain: false,
              excludesSelf: false,
              rosterBranches: [
                {
                  branchType: 'character_count_any',
                  requiredCount: 2,
                  matchMode: 'unique_options',
                  options: [
                    { label: 'Roronoa Zoro', acceptedKeys: ['roronoa zoro', 'zoro'] },
                    { label: 'Nami', acceptedKeys: ['nami'] },
                  ],
                },
              ],
              hasNonRosterBranches: false,
              parserStatus: 'roster_only',
            },
          },
          finalTapData: {
            requirement: 'On the turn Special is launched during final Battle',
            levels: [
              { level: 1, effect: 'Further boosts the chain multiplier of the final tap by 1.3x' },
              {
                level: 5,
                effect:
                  "Further increases crew's ATK and slot effect boosts by +0.5, and further boosts the chain multiplier of the final tap by 1.75x",
              },
            ],
          },
          rushSugoSpecialData: {
            requirement: 'At final battle when character performs the first tap of an attack',
            levels: [
              {
                level: 5,
                effect: 'Allows the crew to perform a Rush.',
              },
            ],
          },
          superClass: null,
          switchEffectData: {
            effect: "Removes character's Despair/Slot Bind.",
          },
          captainShiftData: {
            shiftPosition: 'BOTTOM-RIGHT',
            shiftUses: 2,
            effect: 'Switches the captain with the bottom-right character.',
          },
          rumbleData: {
            id: 501,
            basedOn: 14,
          },
        },
      },
      'Usopp - Tabasco Star',
    );

    expect(viewModel.groups.map((group) => group.titleKey)).toEqual(
      expect.arrayContaining([
        'sections.abilities',
        'sections.enhancements',
        'sections.supportData',
        'sections.battleModes',
      ]),
    );
    expect(viewModel.groups.flatMap((group) => group.cards.map((card) => card.titleKey))).toEqual(
      expect.arrayContaining([
        'sections.supportData',
        'sections.rumbleData',
        'sections.exSuperData',
        'sections.superTandemData',
        'sections.finalTapData',
        'sections.rushSugoSpecialData',
        'sections.superType',
        'sections.switchEffectData',
        'sections.captainShiftData',
      ]),
    );
    expect(
      viewModel.groups.flatMap((group) => group.cards.map((card) => card.titleKey)),
    ).not.toContain('sections.characterTags');
    expect(
      viewModel.groups.flatMap((group) => group.cards.map((card) => card.titleKey)),
    ).not.toContain('sections.teamSynergy');
    expect(viewModel.captainAbilitySummary?.characterTags).toEqual(['Straw Hat Pirates', 'Giant']);
    const superTandemCard = viewModel.groups
      .flatMap((group) => group.cards)
      .find((card) => card.titleKey === 'sections.superTandemData');
    expect(superTandemCard?.rows).toContainEqual(
      expect.objectContaining({
        labelKey: 'fields.requirement',
        value: 'At final battle and any 2 listed characters are on the crew',
      }),
    );
    expect(superTandemCard?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Lv 5' }),
        expect.objectContaining({ titleKey: 'fields.parsedCriteria' }),
      ]),
    );
  });

  it('renders captain variants and notes in the top summary without duplicating a detail card', () => {
    const viewModel = buildCharacterDetailViewModel({
      id: 777,
      name: 'Captain Variant Test',
      type: 'INT',
      classes: ['Driven'],
      primaryClass: 'Driven',
      secondaryClass: null,
      isIncomplete: false,
      stars: 6,
      cost: 40,
      combo: 4,
      captainHpBoost: 1,
      captainAtkBoost: 1,
      captainAverageBoost: 1,
      stats: {
        min: { hp: 1000, atk: 500, rcv: 100 },
        max: { hp: 4000, atk: 1600, rcv: 250 },
        growth: 2,
      },
      regionAvailability: {
        exactLocal: true,
        thumbnailGlobal: true,
        thumbnailJapan: false,
      },
      assets: {
        exactLocal: null,
        thumbnailGlobal: null,
        thumbnailJapan: null,
      },
      imageUrl: '/assets/test.png',
      detailImageUrl: '/assets/test-detail.png',
      detail: {
        characterId: 777,
        captainAbility: 'Base effect.',
        captainAbilityVariants: [
          {
            key: 'base',
            label: 'Base Captain Ability',
            text: 'Base effect.',
          },
          {
            key: 'level1',
            label: 'Limit Break Level 1 Captain Ability',
            text: 'Level 1 effect.',
          },
        ],
        captainNotes: 'Stacks with other additional drop captains.',
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
        finalTapData: null,
        rushSugoSpecialData: null,
        superClass: null,
        rumbleData: null,
      },
    });

    const captainCard = viewModel.groups
      .flatMap((group) => group.cards)
      .find((card) => card.titleKey === 'sections.captainAbility');

    expect(captainCard).toBeUndefined();
    expect(viewModel.captainAbilitySummary?.coverageEntries).toEqual([
      expect.objectContaining({
        label: 'Base Captain Ability',
        text: 'Base effect.',
        tiers: [],
      }),
      expect.objectContaining({
        label: 'Limit Break Level 1 Captain Ability',
        text: 'Level 1 effect.',
        tiers: [],
      }),
    ]);
    expect(viewModel.captainAbilitySummary?.captainNotes).toBe(
      'Stacks with other additional drop captains.',
    );
  });

  it('exposes slim captain coverage entries with captain-sourced parsed abilities', () => {
    const viewModel = buildCharacterDetailViewModel(
      createCharacterDetailRecord({
        detail: {
          captainAbility: 'Boosts ATK of DEX characters by 5x.',
          captainAbilityVariants: [
            {
              key: 'base',
              label: 'Base Captain Ability',
              text: 'Boosts ATK of DEX characters by 5x.',
            },
            {
              key: 'level1',
              label: 'Limit Break Level 1 Captain Ability',
              text: 'Boosts ATK of DEX characters by 5x and HP by 1.3x. Reduces Bind duration by 10 turns.',
            },
          ],
          characterTags: ['Driven', 'Super Sugo-Fest Exclusive'],
          builderAbilities: [
            {
              key: 'reduce_damage',
              label: 'Reduce Damage',
              minTurns: null,
              isCompleteRemoval: false,
              slotTokens: [],
              source: 'captainAbility',
              coverageMode: 'explicit',
            },
            {
              key: 'remove_bind',
              label: 'Remove Bind',
              minTurns: 5,
              isCompleteRemoval: false,
              slotTokens: [],
              source: 'specialText',
              coverageMode: 'explicit',
            },
          ],
        },
      }),
    );

    expect(viewModel.captainAbilitySummary?.coverageEntries).toEqual([
      expect.objectContaining({
        label: 'Base Captain Ability',
        text: 'Boosts ATK of DEX characters by 5x.',
        tiers: [],
      }),
      expect.objectContaining({
        label: 'Limit Break Level 1 Captain Ability',
        text: 'Boosts ATK of DEX characters by 5x and HP by 1.3x. Reduces Bind duration by 10 turns.',
        tiers: [],
      }),
    ]);
    expect(viewModel.captainAbilitySummary?.recognizedAbilities).toEqual([
      expect.objectContaining({
        key: 'reduce_damage',
        label: 'Reduce Damage',
        minTurns: null,
        source: 'captainAbility',
      }),
    ]);
    expect(viewModel.captainAbilitySummary?.characterTags).toEqual([
      'Driven',
      'Super Sugo-Fest Exclusive',
    ]);
  });

  it('falls back to the raw captain ability when no captain variants exist', () => {
    const viewModel = buildCharacterDetailViewModel(
      createCharacterDetailRecord({
        detail: {
          captainAbility: 'Boosts ATK of crew by 5x.',
          captainAbilityVariants: [],
          builderAbilities: [],
        },
      }),
    );

    expect(viewModel.captainAbilitySummary).toEqual(
      expect.objectContaining({
        coverageEntries: [
          expect.objectContaining({
            label: 'Captain Ability',
            text: 'Boosts ATK of crew by 5x.',
            tiers: [],
          }),
        ],
        captainNotes: null,
        recognizedAbilities: [],
        characterTags: [],
      }),
    );
  });

  it('keeps character tags in the top summary even without captain ability data', () => {
    const viewModel = buildCharacterDetailViewModel(
      createCharacterDetailRecord({
        detail: {
          characterTags: ['Straw Hat Pirates', 'Global Anniversary'],
        },
      }),
    );

    expect(viewModel.captainAbilitySummary).toEqual(
      expect.objectContaining({
        coverageEntries: [],
        captainNotes: null,
        recognizedAbilities: [],
        characterTags: ['Straw Hat Pirates', 'Global Anniversary'],
      }),
    );
  });

  it('omits unknown numeric stat rows when manual character data is incomplete', () => {
    const viewModel = buildCharacterDetailViewModel({
      id: 900000,
      name: 'Manual Pilot',
      type: 'DEX',
      classes: ['Free Spirit', 'Shooter'],
      primaryClass: 'Free Spirit',
      secondaryClass: 'Shooter',
      isIncomplete: true,
      stars: 6,
      cost: 55,
      combo: 4,
      captainHpBoost: 1,
      captainAtkBoost: 1,
      captainAverageBoost: 1,
      stats: {
        min: { hp: null, atk: null, rcv: null },
        max: { hp: 5122, atk: 2190, rcv: 417 },
        growth: null,
      },
      regionAvailability: {
        exactLocal: true,
        thumbnailGlobal: false,
        thumbnailJapan: false,
      },
      assets: {
        exactLocal: 'assets/exact-character-images/900000.png',
        thumbnailGlobal: null,
        thumbnailJapan: null,
      },
      imageUrl: '/assets/manual.png',
      detailImageUrl: '/assets/manual.png',
      detail: {
        characterId: 900000,
        captainAbility: null,
        captainAbilityVariants: [],
        captainNotes: null,
        specialName: 'Verified Special',
        specialText: 'Verified text.',
        specialNotes: null,
        superSpecialText: null,
        superSpecialCriteriaText: null,
        superSpecialNotes: null,
        superSpecialCriteria: null,
        partyConflictKeys: [],
        builderAbilities: [],
        sailorAbilities: [],
        sailorNotes: null,
        potentialAbilities: [],
        supportData: [],
        swapData: null,
        vsSpecial: null,
        superType: null,
        superTandemData: null,
        finalTapData: null,
        rushSugoSpecialData: null,
        superClass: null,
        rumbleData: null,
      },
    });

    expect(viewModel.heroMeta.map((row) => row.labelKey)).toEqual([
      'fields.type',
      'fields.primaryClass',
      'fields.secondaryClass',
      'fields.stars',
      'fields.cost',
    ]);
    expect(viewModel.heroStats).toEqual([
      expect.objectContaining({ labelKey: 'stats.maxHp', value: '5,122' }),
      expect.objectContaining({ labelKey: 'stats.maxAtk', value: '2,190' }),
      expect.objectContaining({ labelKey: 'stats.maxRcv', value: '417' }),
    ]);

    const maxStatsCard = viewModel.groups
      .flatMap((group) => group.cards)
      .find((card) => card.titleKey === 'sections.maxStats');
    expect(maxStatsCard).toBeUndefined();
    expect(
      viewModel.groups
        .flatMap((group) => group.cards)
        .find((card) => card.titleKey === 'sections.superTandemData'),
    ).toBeUndefined();
    expect(
      viewModel.groups
        .flatMap((group) => group.cards)
        .find((card) => card.titleKey === 'sections.finalTapData'),
    ).toBeUndefined();
    expect(
      viewModel.groups
        .flatMap((group) => group.cards)
        .find((card) => card.titleKey === 'sections.rushSugoSpecialData'),
    ).toBeUndefined();
    expect(
      viewModel.groups
        .flatMap((group) => group.cards)
        .find((card) => card.titleKey === 'sections.characterTags'),
    ).toBeUndefined();
  });
});

type CharacterDetailRecordOverrides = Partial<Omit<CharacterDetailRecord, 'detail' | 'stats'>> & {
  detail?: Partial<CharacterDetailRecord['detail']>;
  stats?: Partial<Omit<CharacterDetailRecord['stats'], 'max' | 'min'>> & {
    max?: Partial<CharacterDetailRecord['stats']['max']>;
    min?: Partial<CharacterDetailRecord['stats']['min']>;
  };
};

function createCharacterDetailRecord(
  overrides: CharacterDetailRecordOverrides = {},
): CharacterDetailRecord {
  const base: CharacterDetailRecord = {
    id: 4276,
    name: 'Carrot & Dogstorm & Cat Viper - Moonlit Raging Sulongs',
    type: 'STR',
    classes: ['Slasher', 'Fighter'],
    primaryClass: 'Slasher',
    secondaryClass: 'Fighter',
    stars: 6,
    cost: 55,
    combo: 4,
    captainHpBoost: 0,
    captainAtkBoost: 0,
    captainAverageBoost: 0,
    stats: {
      min: { hp: 1997, atk: 884, rcv: 198 },
      max: { hp: 3994, atk: 1768, rcv: 395 },
      growth: 0,
    },
    regionAvailability: {
      exactLocal: false,
      thumbnailGlobal: true,
      thumbnailJapan: true,
    },
    assets: {
      exactLocal: null,
      thumbnailGlobal: '4/200/4276.png',
      thumbnailJapan: '4/200/4276.png',
    },
    imageUrl: '/assets/test.png',
    detailImageUrl: '/assets/test-detail.png',
    isIncomplete: false,
    detail: {
      characterId: 4276,
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
      partyConflictKeys: [],
      builderAbilities: [],
      sailorAbilities: [],
      sailorNotes: null,
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: null,
      superTandemData: null,
      finalTapData: null,
      rushSugoSpecialData: null,
      superClass: null,
      rumbleData: null,
    },
  };

  return {
    ...base,
    ...overrides,
    stats: {
      ...base.stats,
      ...overrides.stats,
      min: { ...base.stats.min, ...overrides.stats?.min },
      max: { ...base.stats.max, ...overrides.stats?.max },
    },
    detail: {
      ...base.detail,
      ...overrides.detail,
    },
  };
}
