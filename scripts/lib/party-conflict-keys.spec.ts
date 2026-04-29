import { describe, expect, it } from 'vitest';

import {
  applyPartyConflictKeys,
  normalizePartyConflictOverrideMap,
  resolveNameDerivedPartyConflictKeys,
} from './party-conflict-keys.mjs';

describe('party conflict keys', () => {
  it('derives a primary key plus member keys for ampersand units', () => {
    expect(
      resolveNameDerivedPartyConflictKeys(
        "Kin'emon & Denjiro & Ashura Doji & Dogstorm - Inherited Oden Two-Sword Style",
      ),
    ).toEqual([
      "kin'emon & denjiro & ashura doji & dogstorm",
      "kin'emon",
      'denjiro',
      'ashura doji',
      'dogstorm',
      'inuarashi',
    ]);
  });

  it('derives Cora aliases for Corazon and Donquixote Rosinante conflicts', () => {
    expect(resolveNameDerivedPartyConflictKeys('Cora - Grateful Love')).toEqual([
      'cora',
      'corazon',
      'donquixote rosinante',
    ]);
  });

  it('applies manual override keys for General Franky composite conflicts', () => {
    const overrideMap = normalizePartyConflictOverrideMap({
      3574: ['franky', 'tony tony chopper'],
    });
    const [character] = applyPartyConflictKeys(
      [
        {
          id: 3574,
          name: 'General Franky - Dream Docking',
          detail: {},
        },
      ],
      overrideMap,
    );

    expect(character?.detail.partyConflictKeys).toEqual([
      'general franky',
      'franky',
      'tony tony chopper',
    ]);
  });
});
