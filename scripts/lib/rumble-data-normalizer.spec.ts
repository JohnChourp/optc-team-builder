import { describe, expect, it } from 'vitest';

import { normalizeRumbleData, normalizeRumbleUnits } from './rumble-data-normalizer.mjs';

describe('rumble-data-normalizer', () => {
  it('materializes passive override levels into complete copied effects', () => {
    const normalized = normalizeRumbleData({
      id: 13,
      ability: [
        {
          effects: [
            {
              attributes: ['SPD'],
              effect: 'buff',
              level: 1,
              targeting: { targets: ['crew'] },
            },
          ],
        },
        {
          effects: [
            {
              override: {
                level: 2,
              },
            },
          ],
        },
      ],
    });

    expect(normalized.ability[1].effects[0]).toEqual({
      attributes: ['SPD'],
      effect: 'buff',
      level: 2,
      targeting: { targets: ['crew'] },
    });
  });

  it('materializes special unchanged effects and override values by index', () => {
    const normalized = normalizeRumbleData({
      id: 13,
      special: [
        {
          cooldown: 23,
          effects: [
            {
              amount: 5,
              effect: 'damage',
              type: 'fixed',
            },
            {
              attributes: ['Special Bind'],
              chance: 80,
              duration: 10,
              effect: 'hinderance',
            },
          ],
        },
        {
          cooldown: 23,
          effects: [
            {},
            {
              override: {
                chance: 85,
                duration: 11,
              },
            },
          ],
        },
      ],
    });

    expect(normalized.special[1].effects).toEqual([
      {
        amount: 5,
        effect: 'damage',
        type: 'fixed',
      },
      {
        attributes: ['Special Bind'],
        chance: 85,
        duration: 11,
        effect: 'hinderance',
      },
    ]);
  });

  it('materializes GP ability and GP special sections with the same rules', () => {
    const normalized = normalizeRumbleData({
      id: 4207,
      gpability: [
        {
          effects: [
            {
              attributes: ['HP'],
              effect: 'buff',
              level: 2,
            },
          ],
        },
        {
          effects: [
            {
              override: {
                level: 3,
              },
            },
          ],
        },
      ],
      gpspecial: [
        {
          uses: 3,
          effects: [
            {
              attributes: ['ATK', 'DEF'],
              duration: 26,
              effect: 'debuff',
              level: 4,
            },
          ],
        },
        {
          uses: 3,
          effects: [
            {
              override: {
                duration: 27,
                level: 5,
              },
            },
          ],
        },
      ],
    });

    expect(normalized.gpability[1].effects[0]).toMatchObject({
      attributes: ['HP'],
      effect: 'buff',
      level: 3,
    });
    expect(normalized.gpspecial[1].effects[0]).toMatchObject({
      attributes: ['ATK', 'DEF'],
      duration: 27,
      effect: 'debuff',
      level: 5,
    });
  });

  it('materializes Level Limit Break ability and special sections with the same rules', () => {
    const normalized = normalizeRumbleData({
      id: 1663,
      llbability: [
        {
          effects: [
            {
              attributes: ['ATK'],
              effect: 'buff',
              level: 15,
            },
          ],
        },
        {
          effects: [
            {
              override: {
                level: 16,
              },
            },
          ],
        },
      ],
      llbspecial: [
        {
          cooldown: 30,
          effects: [
            {
              amount: 3500,
              effect: 'damage',
              type: 'fixed',
            },
          ],
        },
        {
          cooldown: 30,
          effects: [
            {
              override: {
                amount: 3700,
              },
            },
          ],
        },
      ],
    });

    expect(normalized.llbability[1].effects[0]).toEqual({
      attributes: ['ATK'],
      effect: 'buff',
      level: 16,
    });
    expect(normalized.llbspecial[1].effects[0]).toEqual({
      amount: 3700,
      effect: 'damage',
      type: 'fixed',
    });
  });

  it('removes override wrappers from normalized rumble units', () => {
    const normalized = normalizeRumbleUnits([
      {
        id: 1,
        ability: [
          {
            effects: [{ effect: 'buff', level: 1 }],
          },
          {
            effects: [{ override: { level: 2 } }],
          },
        ],
      },
    ]);

    expect(JSON.stringify(normalized)).not.toContain('override');
  });
});
