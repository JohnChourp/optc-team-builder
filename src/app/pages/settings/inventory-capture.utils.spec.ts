import '@angular/compiler';
import { describe, expect, it } from 'vitest';

import {
  InventoryCaptureImportError,
  buildInventoryCapturePayload,
  parseInventoryCapturePayload,
  sanitizeInventoryCapturePayload,
} from './inventory-capture.utils';

describe('inventory capture utils', () => {
  it('builds a payload with the expected schema', () => {
    expect(
      buildInventoryCapturePayload(
        {
          characterIds: [1001, 1002],
          shipIds: [9001],
          unmatchedEntries: ['ghost ship'],
        },
        '2026-04-21T10:00:00.000Z',
      ),
    ).toEqual({
      schemaVersion: 1,
      source: 'inventory-capture',
      capturedAt: '2026-04-21T10:00:00.000Z',
      characterIds: [1001, 1002],
      shipIds: [9001],
      unmatchedEntries: ['ghost ship'],
    });
  });

  it('parses a valid inventory capture payload', () => {
    expect(
      parseInventoryCapturePayload(
        JSON.stringify({
          schemaVersion: 1,
          source: 'inventory-capture',
          capturedAt: '2026-04-21T10:00:00.000Z',
          characterIds: [1001],
          shipIds: [9001],
          unmatchedEntries: ['ghost ship'],
        }),
      ),
    ).toEqual({
      schemaVersion: 1,
      source: 'inventory-capture',
      capturedAt: '2026-04-21T10:00:00.000Z',
      characterIds: [1001],
      shipIds: [9001],
      unmatchedEntries: ['ghost ship'],
    });
  });

  it('throws a typed error for invalid json', () => {
    try {
      parseInventoryCapturePayload('{');
      throw new Error('Expected parse to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(InventoryCaptureImportError);
      expect(error).toMatchObject({
        key: 'management.inventoryCapture.errors.invalidJson',
      });
    }
  });

  it('sanitizes duplicates, invalid ids, and preserves unique unmatched entries', () => {
    const result = sanitizeInventoryCapturePayload({
      schemaVersion: 1,
      source: 'inventory-capture',
      capturedAt: 'not-a-date',
      characterIds: [1001, 1001, 0, -2, 1002],
      shipIds: [9001, 9001, 3.5, 9002],
      unmatchedEntries: [' ghost ship ', '', 'Ghost Ship', 'mystery box'],
    });

    expect(result).toMatchObject({
      duplicateCharacterCount: 1,
      duplicateShipCount: 1,
      invalidCharacterCount: 2,
      invalidShipCount: 1,
      payload: {
        schemaVersion: 1,
        source: 'inventory-capture',
        characterIds: [1001, 1002],
        shipIds: [9001, 9002],
        unmatchedEntries: ['ghost ship', 'mystery box'],
      },
    });
  });
});
