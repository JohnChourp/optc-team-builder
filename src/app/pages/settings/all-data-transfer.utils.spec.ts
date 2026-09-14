import '@angular/compiler';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { type FavoriteShipsTransferPayload } from './favorite-ships-transfer.utils';
import { type SavedEnemiesTransferPayload } from '../saved-enemies/saved-enemies-transfer.utils';
import { type CharacterBoxesTransferPayload } from '../character-boxes/character-boxes-transfer.utils';
import { type CharacterOverridesTransferPayload } from '../character-detail/character-overrides-transfer.utils';
import { type SavedTeamsTransferPayload } from '../saved-teams/saved-teams-transfer.utils';
import {
  AllDataImportError,
  buildAllDataExportFilename,
  ALL_DATA_TRANSFER_SCOPES,
  buildAllDataTransferPayload,
  downloadAllDataExport,
  parseAllDataImportCandidate,
} from './all-data-transfer.utils';

describe('All data transfer helpers', () => {
  it('builds a full nested export payload', () => {
    const favorites = {
      characters: [{ number: 1001, name: 'Luffy' }],
    };
    const favoriteShips: FavoriteShipsTransferPayload = {
      schemaVersion: 1,
      source: 'favorite-ships',
      exportedAt: '2026-04-13T09:15:00.000Z',
      ships: [{ id: 9001, name: 'Going Merry' }],
    };
    const savedTeams: SavedTeamsTransferPayload = {
      schemaVersion: 1,
      source: 'saved-teams',
      exportedAt: '2026-04-13T09:15:00.000Z',
      teams: [
        {
          id: 'team-1',
          name: 'Crew 1',
          notes: '',
          shipId: null,
          slots: [1001, null, null, null, null, null],
          createdAt: '2026-04-13T09:15:00.000Z',
          updatedAt: '2026-04-13T09:15:00.000Z',
        },
      ],
    };
    const savedEnemies: SavedEnemiesTransferPayload = {
      schemaVersion: 1,
      source: 'saved-enemies',
      exportedAt: '2026-04-13T09:15:00.000Z',
      enemies: [
        {
          id: 'enemy-1',
          name: 'Boss',
          notes: '',
          rawEnemyText: '',
          imageDataUrl: null,
          selectedTypes: ['DEX'],
          selectedClasses: ['Fighter'],
          requiredAbilities: [],
          enemyMechanics: [],
          requireAllSelectedTypesInTeam: false,
          requireAllSelectedClassesPerCharacter: false,
          createdAt: '2026-04-13T09:15:00.000Z',
          updatedAt: '2026-04-13T09:15:00.000Z',
        },
      ],
    };
    const characterBoxes: CharacterBoxesTransferPayload = {
      schemaVersion: 1,
      source: 'character-boxes',
      exportedAt: '2026-04-13T09:15:00.000Z',
      boxes: [
        {
          id: 'box-1',
          name: 'Powerhouse Box',
          characterIds: [1001, 1002],
          createdAt: '2026-04-13T09:15:00.000Z',
          updatedAt: '2026-04-13T09:15:00.000Z',
        },
      ],
    };
    const characterOverrides: CharacterOverridesTransferPayload = {
      schemaVersion: 1,
      source: 'character-overrides',
      exportedAt: '2026-04-13T09:15:00.000Z',
      overrides: [
        {
          characterId: 1001,
          name: 'Local Luffy',
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
            characterId: 1001,
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
        },
      ],
    };

    const payload = buildAllDataTransferPayload(
      {
        favorites,
        favoriteShips,
        savedTeams,
        savedEnemies,
        characterBoxes,
        characterOverrides,
      },
      '2026-04-13T09:15:00.000Z',
    );

    favoriteShips.ships[0]!.name = 'Changed';
    savedTeams.teams[0]!.slots[0] = 9999;
    savedEnemies.enemies[0]!.selectedTypes.push('PSY');
    characterBoxes.boxes[0]!.characterIds.push(9999);
    characterOverrides.overrides[0]!.name = 'Changed override';

    expect(payload).toEqual({
      schemaVersion: 1,
      source: 'all-data',
      exportedAt: '2026-04-13T09:15:00.000Z',
      favorites: {
        characters: [{ number: 1001, name: 'Luffy' }],
      },
      favoriteShips: {
        schemaVersion: 1,
        source: 'favorite-ships',
        exportedAt: '2026-04-13T09:15:00.000Z',
        ships: [{ id: 9001, name: 'Going Merry' }],
      },
      savedTeams: {
        schemaVersion: 1,
        source: 'saved-teams',
        exportedAt: '2026-04-13T09:15:00.000Z',
        teams: [
          expect.objectContaining({
            id: 'team-1',
            slots: [1001, null, null, null, null, null],
          }),
        ],
      },
      savedEnemies: {
        schemaVersion: 1,
        source: 'saved-enemies',
        exportedAt: '2026-04-13T09:15:00.000Z',
        enemies: [
          expect.objectContaining({
            id: 'enemy-1',
            selectedTypes: ['DEX'],
          }),
        ],
      },
      characterBoxes: {
        schemaVersion: 1,
        source: 'character-boxes',
        exportedAt: '2026-04-13T09:15:00.000Z',
        boxes: [
          expect.objectContaining({
            id: 'box-1',
            characterIds: [1001, 1002],
          }),
        ],
      },
      characterOverrides: {
        schemaVersion: 1,
        source: 'character-overrides',
        exportedAt: '2026-04-13T09:15:00.000Z',
        overrides: [
          expect.objectContaining({
            characterId: 1001,
            name: 'Local Luffy',
          }),
        ],
      },
    });
  });

  it('builds the all-data filename with the expected timestamp format', () => {
    expect(buildAllDataExportFilename('2026-04-13T09:15:00.000Z')).toBe(
      'optc-all-data-20260413-091500.json',
    );
  });

  it('downloads the all-data export with the shared filename', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const clickSpy = vi
      .spyOn(dom.window.HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const urlRef = {
      createObjectURL: vi.fn(() => 'blob:all-data'),
      revokeObjectURL: vi.fn(),
    };

    downloadAllDataExport(
      buildAllDataTransferPayload({}, '2026-04-13T09:15:00.000Z'),
      dom.window.document,
      urlRef,
    );

    expect(clickSpy).toHaveBeenCalledOnce();
    expect(urlRef.revokeObjectURL).toHaveBeenCalledWith('blob:all-data');
  });

  it('detects a full all-data bundle', () => {
    const result = parseAllDataImportCandidate(
      JSON.stringify(
        buildAllDataTransferPayload(
          {
            favorites: { characters: [{ number: 1001, name: 'Luffy' }] },
          },
          '2026-04-13T09:15:00.000Z',
        ),
      ),
    );

    expect(result).toMatchObject({
      kind: 'all-data',
      payload: expect.objectContaining({
        source: 'all-data',
      }),
    });
  });

  it('detects a partial all-data bundle', () => {
    const result = parseAllDataImportCandidate(
      JSON.stringify({
        schemaVersion: 1,
        source: 'all-data',
        exportedAt: '2026-04-13T09:15:00.000Z',
        savedTeams: {
          schemaVersion: 1,
          source: 'saved-teams',
          exportedAt: '2026-04-13T09:15:00.000Z',
          teams: [],
        },
      }),
    );

    expect(result.kind).toBe('all-data');
  });

  it('detects a raw favorites export', () => {
    expect(
      parseAllDataImportCandidate(
        JSON.stringify({
          characters: [{ number: 1001, name: 'Luffy' }],
        }),
      ),
    ).toMatchObject({ kind: 'favorites' });
  });

  it('detects a favorite ships export', () => {
    expect(
      parseAllDataImportCandidate(
        JSON.stringify({
          schemaVersion: 1,
          source: 'favorite-ships',
          exportedAt: '2026-04-13T09:15:00.000Z',
          ships: [],
        }),
      ),
    ).toMatchObject({ kind: 'favorite-ships' });
  });

  it('detects a saved teams export', () => {
    expect(
      parseAllDataImportCandidate(
        JSON.stringify({
          schemaVersion: 1,
          source: 'saved-teams',
          exportedAt: '2026-04-13T09:15:00.000Z',
          teams: [],
        }),
      ),
    ).toMatchObject({ kind: 'saved-teams' });
  });

  it('detects a saved enemies export', () => {
    expect(
      parseAllDataImportCandidate(
        JSON.stringify({
          schemaVersion: 1,
          source: 'saved-enemies',
          exportedAt: '2026-04-13T09:15:00.000Z',
          enemies: [],
        }),
      ),
    ).toMatchObject({ kind: 'saved-enemies' });
  });

  it('detects a character boxes export', () => {
    expect(
      parseAllDataImportCandidate(
        JSON.stringify({
          schemaVersion: 1,
          source: 'character-boxes',
          exportedAt: '2026-04-13T09:15:00.000Z',
          boxes: [],
        }),
      ),
    ).toMatchObject({ kind: 'character-boxes' });
  });

  it('detects a character overrides export', () => {
    expect(
      parseAllDataImportCandidate(
        JSON.stringify({
          schemaVersion: 1,
          source: 'character-overrides',
          exportedAt: '2026-04-13T09:15:00.000Z',
          overrides: [],
        }),
      ),
    ).toMatchObject({ kind: 'character-overrides' });
  });

  it('throws a typed error for invalid json', () => {
    try {
      parseAllDataImportCandidate('{');
      throw new Error('Expected invalid json to throw.');
    } catch (error) {
      expect(error).toBeInstanceOf(AllDataImportError);
      expect(error).toMatchObject({ key: 'management.allData.errors.invalidJson' });
    }
  });

  it('throws a typed error for invalid payloads', () => {
    try {
      parseAllDataImportCandidate(JSON.stringify([]));
      throw new Error('Expected invalid payload to throw.');
    } catch (error) {
      expect(error).toBeInstanceOf(AllDataImportError);
      expect(error).toMatchObject({ key: 'management.allData.errors.invalidPayload' });
    }
  });

  it('throws a typed error for unsupported schemas', () => {
    try {
      parseAllDataImportCandidate(
        JSON.stringify({
          schemaVersion: 2,
          source: 'future-export',
          exportedAt: '2026-04-13T09:15:00.000Z',
        }),
      );
      throw new Error('Expected unsupported schema to throw.');
    } catch (error) {
      expect(error).toBeInstanceOf(AllDataImportError);
      expect(error).toMatchObject({ key: 'management.allData.errors.unsupportedSchema' });
    }
  });
});

describe('every scope survives the round trip', () => {
  /*
   * 869f1935z. This file had 14 tests and none of them noticed a whole scope going missing.
   * Measured, not supposed: deleting `savedRumbleTeams` from the builder's returned object left
   * `tsc --noEmit` at exit 0 and all 14 passing, and produced a "full backup" with an entire
   * category of the reader's data absent. They would find out at restore time.
   *
   * The fields on `AllDataTransferPayload` stay optional - the same type parses a file, and an
   * older export legitimately lacks scopes - so the completeness guarantee cannot live there.
   * It lives in `SCOPE_CLONERS`, which is typed as a complete record, and in these tests.
   */
  it('names every scope on a payload built from nothing', () => {
    const payload = buildAllDataTransferPayload({}, '2026-09-13T00:00:00.000Z') as unknown as Record<
      string,
      unknown
    >;

    for (const scope of ALL_DATA_TRANSFER_SCOPES) {
      expect(Object.keys(payload), `payload names ${scope}`).toContain(scope);
    }
  });

  it('round-trips a real section through to the payload', () => {
    /*
     * One scope with its genuine shape rather than seven with a fake marker: the clones validate
     * what they are given and return undefined for anything else, so a synthetic payload would
     * have tested the validator, not the wiring.
     */
    const payload = buildAllDataTransferPayload(
      {
        savedRumbleTeams: {
          schemaVersion: 1,
          source: 'saved-rumble-teams',
          rumbleTeams: [{ id: 'rumble-1' }],
        } as never,
      },
      '2026-09-13T00:00:00.000Z',
    );

    expect(payload.savedRumbleTeams?.rumbleTeams).toEqual([{ id: 'rumble-1' }]);
  });

  it('guards against the list itself shrinking', () => {
    // A guard that reads an empty list passes for the wrong reason; this is how that would rot.
    expect(ALL_DATA_TRANSFER_SCOPES).toHaveLength(9);
    expect(new Set(ALL_DATA_TRANSFER_SCOPES).size).toBe(ALL_DATA_TRANSFER_SCOPES.length);
  });

  it('IMPORTS every scope it exports', () => {
    /*
     * The same hole in the opposite direction, and the one no type can close: the import path is
     * seven hand-written `if (payload.<scope> !== undefined)` blocks, so deleting one silently
     * stops that scope ever being restored. Bound by reading the page source, the way the dataset
     * provenance map is bound to the importer.
     */
    const page = readFileSync(
      resolve(process.cwd(), 'src/app/pages/settings/settings.page.ts'),
      'utf8',
    );
    const applier = page.slice(page.indexOf('private async importAllDataBundle'));
    const body = applier.slice(0, applier.indexOf('\n  private '));

    for (const scope of ALL_DATA_TRANSFER_SCOPES) {
      expect(body, `importAllDataBundle restores ${scope}`).toContain(`payload.${scope} !== undefined`);
    }
  });

  /*
   * 869f12x4p. A third hole, found while adding the eighth scope, and the one the two tests above
   * cannot see: the PRODUCER.
   *
   * `UserDataTransferService.buildAllDataPayload` hands a `sections` object to the builder, and
   * every field of `AllDataTransferSections` is optional - it has to be, because a caller may
   * legitimately export a subset. So a scope the service never supplies reaches the builder as
   * `undefined`, the builder still writes the key, and `names every scope on a payload built from
   * nothing` above still passes: the key is present, its value is not.
   *
   * That is the same silent hole as the other two, one step upstream, and it is the step that
   * actually fills the reader's backup. Bound the same way, by reading the source.
   */
  it('SUPPLIES every scope from the service that builds the real payload', () => {
    const service = readFileSync(
      resolve(process.cwd(), 'src/app/core/services/user-data-transfer.service.ts'),
      'utf8',
    );
    const builder = service.slice(service.indexOf('public async buildAllDataPayload'));
    /*
     * Only the object literal handed to the builder, not the whole method: `favorites` and
     * `favoriteShips` are also local `const` names a few lines above, so a looser slice would
     * pass on the destructuring line and certify the two scopes it never checked.
     */
    const sections = builder.slice(
      builder.indexOf('buildAllDataTransferPayload('),
      builder.indexOf('exportedAt,\n    );'),
    );

    for (const scope of ALL_DATA_TRANSFER_SCOPES) {
      // Shorthand (`favorites,`) and explicit (`savedTeams: ...`) both count as supplied.
      expect(sections, `buildAllDataPayload supplies ${scope}`).toMatch(
        new RegExp(`\\b${scope}\\s*[,:]`, 'u'),
      );
    }
  });

  it('APPLIES every scope on the Drive sync path too', () => {
    /*
     * `applyAllDataPayload` is the Drive-sync twin of `importAllDataBundle`, with the same
     * hand-written per-scope blocks and the same failure mode. A scope exported to Drive and never
     * applied back is a backup that restores short, which is the defect this subtask started from.
     */
    const service = readFileSync(
      resolve(process.cwd(), 'src/app/core/services/user-data-transfer.service.ts'),
      'utf8',
    );
    const applier = service.slice(service.indexOf('public async applyAllDataPayload'));
    const body = applier.slice(0, applier.indexOf('\n  public '));

    for (const scope of ALL_DATA_TRANSFER_SCOPES) {
      expect(body, `applyAllDataPayload restores ${scope}`).toContain(`payload.${scope} !== undefined`);
    }
  });
});
