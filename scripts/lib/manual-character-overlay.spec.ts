import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

let MANUAL_CHARACTER_ID_MIN: number;
let buildAppliedManualCharacter: (record: Record<string, unknown>) => Record<string, unknown>;
let normalizeIncomingManualCharacterPayload: (
  payload: Record<string, unknown>,
  options: {
    availableClasses: string[];
    characterId: number;
    storedImageFile: string;
    storedThumbnailFile?: string | null;
  },
) => Record<string, unknown>;
let resolveManualCharacterUpsert: (
  records: Map<number, { id: number; name: string }>,
  draft: { id?: number | null; name: string },
) => { characterId: number; mode: 'create' | 'update'; existingRecord: { id: number; name: string } | null };

beforeAll(async () => {
  ({
    MANUAL_CHARACTER_ID_MIN,
    buildAppliedManualCharacter,
    normalizeIncomingManualCharacterPayload,
    resolveManualCharacterUpsert,
  } = await import(
    pathToFileURL(resolve(process.cwd(), 'scripts/lib/manual-character-overlay.mjs')).href
  ));
});

describe('manual character overlay helpers', () => {
  it('assigns the next reserved id for a new manual character', () => {
    const result = resolveManualCharacterUpsert(
      new Map([[900000, { id: 900000, name: 'Manual Luffy' }]]),
      { name: 'Manual Zoro' },
    );

    expect(result).toEqual({
      characterId: 900001,
      existingRecord: null,
      mode: 'create',
    });
  });

  it('reuses the stored id when the name already exists case-insensitively', () => {
    const result = resolveManualCharacterUpsert(
      new Map([[900000, { id: 900000, name: 'Manual Luffy' }]]),
      { name: ' manual luffy ' },
    );

    expect(result).toEqual({
      characterId: 900000,
      existingRecord: { id: 900000, name: 'Manual Luffy' },
      mode: 'update',
    });
  });

  it('rejects conflicting id and name pairs', () => {
    expect(() =>
      resolveManualCharacterUpsert(
        new Map([
          [900000, { id: 900000, name: 'Manual Luffy' }],
          [900001, { id: 900001, name: 'Manual Zoro' }],
        ]),
        { id: 900001, name: 'Manual Luffy' },
      ),
    ).toThrow(/conflicts/i);
  });

  it('accepts an explicit canonical id when rebinding a manual overlay record', () => {
    const result = resolveManualCharacterUpsert(new Map(), { id: 4536, name: 'Usopp & Dorry' });

    expect(result).toEqual({
      characterId: 4536,
      existingRecord: null,
      mode: 'create',
    });
  });

  it('normalizes incoming payloads with validated stats and default detail blocks', () => {
    const record = normalizeIncomingManualCharacterPayload(
      {
        name: 'Manual Sanji',
        type: 'dex',
        classes: ['fighter', 'free spirit'],
        stars: 6,
        cost: 55,
        combo: 5,
        minHp: 1000,
        minAtk: 500,
        minRcv: 200,
        maxHp: 4200,
        maxAtk: 2200,
        maxRcv: 450,
        detail: {
          captainAbility: null,
          specialName: 'Party Table Kick Course',
          specialText: 'Reduces Bind duration by 5 turns.',
          supportData: [{ Characters: 'Luffy', description: ['Boosts ATK by 5%'] }],
          characterTags: ['Straw Hat Pirates', 'Giant'],
          exSuperData: {
            activationRequirement: 'When character becomes "Yamato & Momonosuke"',
            exSuperSpecial: 'Changes STR characters to Super STR.',
          },
          superTandemData: {
            requirement: 'At final battle and any 2 listed characters are on the crew',
            levels: [{ level: 5, effect: 'Applies ATK Boost (Tandem) of 2.5x to DEX and STR characters for 1 turn.' }],
          },
          finalTapData: {
            requirement: 'On the turn Special is launched during final Battle',
            levels: [{ level: 1, effect: 'Further boosts the chain multiplier of the final tap by 1.3x' }],
          },
          rushSugoSpecialData: {
            requirement: 'At final battle when character performs the first tap of an attack',
            levels: [{ level: 5, effect: 'Allows the crew to perform a Rush.' }],
          },
          switchEffectData: {
            effect: "Completely removes character's Despair/Slot Bind.",
          },
          captainShiftData: {
            shiftPosition: 'BOTTOM-RIGHT',
            shiftUses: 2,
            effect: 'Switches to the other captain form.',
          },
        },
      },
      {
        availableClasses: ['Fighter', 'Free Spirit', 'Slasher'],
        characterId: MANUAL_CHARACTER_ID_MIN,
        storedImageFile: `${MANUAL_CHARACTER_ID_MIN}.png`,
        storedThumbnailFile: `${MANUAL_CHARACTER_ID_MIN}-thumb.jpg`,
      },
    );

    expect(record).toMatchObject({
      id: MANUAL_CHARACTER_ID_MIN,
      searchAliases: [],
      type: 'DEX',
      classes: ['Fighter', 'Free Spirit'],
      growth: null,
      image: {
        file: `${MANUAL_CHARACTER_ID_MIN}.png`,
        thumbnailFile: `${MANUAL_CHARACTER_ID_MIN}-thumb.jpg`,
      },
      detail: {
        characterId: MANUAL_CHARACTER_ID_MIN,
        specialName: 'Party Table Kick Course',
        specialText: 'Reduces Bind duration by 5 turns.',
        sailorAbilities: [],
        supportData: [{ Characters: 'Luffy', description: ['Boosts ATK by 5%'] }],
        characterTags: ['Straw Hat Pirates', 'Giant'],
        exSuperData: {
          activationRequirement: 'When character becomes "Yamato & Momonosuke"',
          exSuperSpecial: 'Changes STR characters to Super STR.',
        },
        superTandemData: {
          requirement: 'At final battle and any 2 listed characters are on the crew',
          levels: [{ level: 5, effect: 'Applies ATK Boost (Tandem) of 2.5x to DEX and STR characters for 1 turn.' }],
        },
        finalTapData: {
          requirement: 'On the turn Special is launched during final Battle',
          levels: [{ level: 1, effect: 'Further boosts the chain multiplier of the final tap by 1.3x' }],
        },
        rushSugoSpecialData: {
          requirement: 'At final battle when character performs the first tap of an attack',
          levels: [{ level: 5, effect: 'Allows the crew to perform a Rush.' }],
        },
        switchEffectData: {
          effect: "Completely removes character's Despair/Slot Bind.",
        },
        captainShiftData: {
          shiftPosition: 'BOTTOM-RIGHT',
          shiftUses: 2,
          effect: 'Switches to the other captain form.',
        },
      },
    });
  });

  it('builds an applied dataset record with exact local assets', () => {
    const record = buildAppliedManualCharacter({
      id: MANUAL_CHARACTER_ID_MIN,
      name: 'Manual Chopper',
      type: 'QCK',
      classes: ['Fighter'],
      stars: 5,
      cost: 30,
      combo: 4,
      minHp: 500,
      minAtk: 200,
      minRcv: 300,
      maxHp: 3000,
      maxAtk: 1500,
      maxRcv: 600,
      growth: 0,
      image: {
        file: `${MANUAL_CHARACTER_ID_MIN}.png`,
        thumbnailFile: `${MANUAL_CHARACTER_ID_MIN}-thumb.jpg`,
      },
      detail: {
        characterId: MANUAL_CHARACTER_ID_MIN,
        captainAbility: null,
        specialName: null,
        specialText: null,
      },
    });

    expect(record).toMatchObject({
      id: MANUAL_CHARACTER_ID_MIN,
      primaryClass: 'Fighter',
      secondaryClass: null,
      regionAvailability: {
        exactLocal: true,
        thumbnailGlobal: false,
      },
      assets: {
        exactLocal: `assets/exact-character-images/${MANUAL_CHARACTER_ID_MIN}.png`,
        thumbnailLocal: `assets/exact-character-images/${MANUAL_CHARACTER_ID_MIN}-thumb.jpg`,
      },
    });
  });

  it('preserves explicit canonical character ids and search aliases for linked variants', () => {
    const record = normalizeIncomingManualCharacterPayload(
      {
        name: 'Clashing Blades St. Ethanbaron V. Nusjuro',
        searchAliases: ['4529', 'st ethanbaron v nusjuro'],
        type: 'STR',
        classes: ['Cerebral', 'Slasher'],
        stars: 6,
        cost: 99,
        combo: 4,
        minHp: null,
        minAtk: null,
        minRcv: null,
        maxHp: 6153,
        maxAtk: 2705,
        maxRcv: 405,
        growth: null,
        detail: {
          characterId: 4529,
          specialName: "Crackling Elder's Blade",
          specialText: 'Verified text.',
          partyConflictKeys: ['linked-variant-4529'],
        },
      },
      {
        availableClasses: ['Cerebral', 'Slasher'],
        characterId: 900005,
        storedImageFile: '4529--st-ethanbaron-v-nusjuro.png',
        storedThumbnailFile: '4529--st-ethanbaron-v-nusjuro-thumb.jpg',
      },
    );

    expect(record).toMatchObject({
      id: 900005,
      searchAliases: ['4529', 'st ethanbaron v nusjuro'],
      detail: {
        characterId: 4529,
        partyConflictKeys: ['linked-variant-4529'],
      },
      image: {
        file: '4529--st-ethanbaron-v-nusjuro.png',
        thumbnailFile: '4529--st-ethanbaron-v-nusjuro-thumb.jpg',
      },
    });

    const appliedRecord = buildAppliedManualCharacter(record);

    expect(appliedRecord).toMatchObject({
      id: 900005,
      searchText: expect.stringContaining('4529'),
      detail: {
        characterId: 4529,
      },
      assets: {
        exactLocal: 'assets/exact-character-images/4529--st-ethanbaron-v-nusjuro.png',
        thumbnailLocal:
          'assets/exact-character-images/4529--st-ethanbaron-v-nusjuro-thumb.jpg',
      },
    });
    expect(appliedRecord.searchText).toContain('900005');
  });

  it('accepts nullable incomplete stat fields for manual records', () => {
    const record = normalizeIncomingManualCharacterPayload(
      {
        name: 'Manual Giant Pair',
        type: 'DEX',
        classes: ['fighter', 'free spirit'],
        stars: 6,
        cost: 55,
        combo: 5,
        minHp: null,
        minAtk: null,
        minRcv: null,
        maxHp: 4200,
        maxAtk: 2200,
        maxRcv: 450,
        growth: null,
        detail: {
          specialName: 'Verified Special',
          specialText: 'Verified text.',
        },
      },
      {
        availableClasses: ['Fighter', 'Free Spirit', 'Slasher'],
        characterId: MANUAL_CHARACTER_ID_MIN,
        storedImageFile: `${MANUAL_CHARACTER_ID_MIN}.png`,
        storedThumbnailFile: null,
      },
    );

    expect(record).toMatchObject({
      minHp: null,
      minAtk: null,
      minRcv: null,
      growth: null,
      maxHp: 4200,
      maxAtk: 2200,
      maxRcv: 450,
    });
  });
});
