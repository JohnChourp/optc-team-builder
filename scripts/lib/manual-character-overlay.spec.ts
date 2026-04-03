import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

let MANUAL_CHARACTER_ID_MIN: number;
let buildAppliedManualCharacter: (record: Record<string, unknown>) => Record<string, unknown>;
let normalizeIncomingManualCharacterPayload: (
  payload: Record<string, unknown>,
  options: { availableClasses: string[]; characterId: number; storedImageFile: string },
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

  it('normalizes incoming payloads with validated stats and default detail blocks', () => {
    const record = normalizeIncomingManualCharacterPayload(
      {
        name: 'Manual Sanji',
        type: 'dex',
        classes: ['fighter', 'free spirit'],
        stars: 6,
        cost: 55,
        combo: 5,
        maxLevel: 99,
        maxExperience: 5000000,
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
        },
      },
      {
        availableClasses: ['Fighter', 'Free Spirit', 'Slasher'],
        characterId: MANUAL_CHARACTER_ID_MIN,
        storedImageFile: `${MANUAL_CHARACTER_ID_MIN}.png`,
      },
    );

    expect(record).toMatchObject({
      id: MANUAL_CHARACTER_ID_MIN,
      type: 'DEX',
      classes: ['Fighter', 'Free Spirit'],
      growth: 0,
      image: { file: `${MANUAL_CHARACTER_ID_MIN}.png` },
      detail: {
        characterId: MANUAL_CHARACTER_ID_MIN,
        specialName: 'Party Table Kick Course',
        specialText: 'Reduces Bind duration by 5 turns.',
        sailorAbilities: [],
        supportData: [{ Characters: 'Luffy', description: ['Boosts ATK by 5%'] }],
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
      maxLevel: 99,
      maxExperience: 1000000,
      minHp: 500,
      minAtk: 200,
      minRcv: 300,
      maxHp: 3000,
      maxAtk: 1500,
      maxRcv: 600,
      growth: 0,
      image: { file: `${MANUAL_CHARACTER_ID_MIN}.png` },
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
      },
    });
  });
});
