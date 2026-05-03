import '@angular/compiler';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

import {
  CharacterOverridesImportError,
  buildCharacterOverridesExportFilename,
  buildCharacterOverridesTransferPayload,
  downloadCharacterOverridesExport,
  parseCharacterOverridesImportPayload,
  parseCharacterOverridesImportPayloadValue,
  sanitizeCharacterOverridesImportPayload,
} from './character-overrides-transfer.utils';

describe('character override transfer helpers', () => {
  it('builds an export payload without mutating the input overrides', () => {
    const overrides = [createOverride(4101)];

    const payload = buildCharacterOverridesTransferPayload(overrides, '2026-04-13T09:15:00.000Z');
    overrides[0]!.classes.push('Shooter');

    expect(payload).toEqual({
      schemaVersion: 1,
      source: 'character-overrides',
      exportedAt: '2026-04-13T09:15:00.000Z',
      overrides: [expect.objectContaining({ characterId: 4101, classes: ['Fighter'] })],
    });
  });

  it('downloads the character override export with the shared filename', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const clickSpy = vi
      .spyOn(dom.window.HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const urlRef = {
      createObjectURL: vi.fn(() => 'blob:character-overrides'),
      revokeObjectURL: vi.fn(),
    };

    downloadCharacterOverridesExport(
      buildCharacterOverridesTransferPayload([createOverride(4101)], '2026-04-13T09:15:00.000Z'),
      dom.window.document,
      urlRef,
    );

    expect(buildCharacterOverridesExportFilename('2026-04-13T09:15:00.000Z')).toBe(
      'character-overrides-20260413-091500.json',
    );
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(urlRef.revokeObjectURL).toHaveBeenCalledWith('blob:character-overrides');
  });

  it('parses and sanitizes imported override payloads', () => {
    const payload = parseCharacterOverridesImportPayload(
      JSON.stringify({
        schemaVersion: 1,
        source: 'character-overrides',
        exportedAt: '2026-04-13T09:15:00.000Z',
        overrides: [
          createOverride(4101),
          createOverride(4101),
          {
            characterId: 0,
          },
        ],
      }),
    );
    const sanitized = sanitizeCharacterOverridesImportPayload(payload);

    expect(sanitized).toMatchObject({
      duplicateCharacterIdCount: 1,
      invalidOverrideCount: 1,
      overrides: [expect.objectContaining({ characterId: 4101 })],
    });
  });

  it('accepts parsed payload values directly', () => {
    const payload = parseCharacterOverridesImportPayloadValue({
      schemaVersion: 1,
      source: 'character-overrides',
      exportedAt: '2026-04-13T09:15:00.000Z',
      overrides: [createOverride(4101)],
    });

    expect(payload.overrides).toHaveLength(1);
  });

  it('throws typed errors for invalid json and payloads', () => {
    expect(() => parseCharacterOverridesImportPayload('{')).toThrowError(
      CharacterOverridesImportError,
    );
    expect(() => parseCharacterOverridesImportPayloadValue([])).toThrowError(
      CharacterOverridesImportError,
    );
  });
});

function createOverride(characterId: number) {
  return {
    characterId,
    name: `Override ${characterId}`,
    isIncomplete: false,
    type: 'DEX',
    classes: ['Fighter'],
    stars: 6,
    cost: 55,
    combo: 4,
    minHp: 1000,
    minAtk: 400,
    minRcv: 120,
    maxHp: 3900,
    maxAtk: 1900,
    maxRcv: 340,
    growth: 3,
    detail: {
      characterId,
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
    images: {
      thumbnailDataUrl: null,
      detailDataUrl: null,
    },
    createdAt: '2026-04-13T09:15:00.000Z',
    updatedAt: '2026-04-13T09:15:00.000Z',
  };
}
