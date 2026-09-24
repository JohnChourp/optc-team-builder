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
import { neverExportedStorageKeys } from '../../core/data/browser-storage-keys.data';

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
    expect(ALL_DATA_TRANSFER_SCOPES).toHaveLength(10);
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
     * 869f63gug. The sections are no longer an object literal in the method: every scope's comes
     * from its entry in `syncScopeHandlers()`, a record typed over the scope list - so a scope with
     * no `build` no longer compiles. Still bound here: the method has to build every scope through
     * that record, and the record has to hold a `build` under every scope's name.
     */
    const handlers = service.slice(service.indexOf('private syncScopeHandlers()'));
    const record = handlers.slice(0, handlers.indexOf('\n  }\n'));

    expect(builder.slice(0, builder.indexOf('\n  }\n'))).toContain(
      'ALL_DATA_TRANSFER_SCOPES.map(async (scope) => [scope, await handlers[scope].build()])',
    );

    for (const scope of ALL_DATA_TRANSFER_SCOPES) {
      expect(record, `buildAllDataPayload supplies ${scope}`).toMatch(
        new RegExp(`\\b${scope}: \\{\\n\\s+build: `, 'u'),
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

/**
 * 869f135ua. The export must not carry a key that never leaves the device.
 *
 * `browser-storage-keys.data.ts` already classifies all 28 stored keys and
 * `browser-storage-keys.data.spec.ts` already asserts over that REGISTRY - that a
 * key marked `credential` declares no export scope, that every key carries a
 * reason. All of it reads the record. None of it reads the object the exporter
 * actually produces, so the registry could be perfectly consistent while the
 * builder wrote a session token into a scope payload.
 *
 * This is the test that looks at the payload. It asserts on the SERIALISED text
 * rather than on `Object.keys`, because the only vector the structural
 * guarantees leave open is a forbidden key nested inside a scope - a session
 * token spread into a saved team, not a top-level `optc_google_account_session`
 * field that no reviewer would miss.
 *
 * Out of scope on purpose: `appProperties.accountId` at
 * `drive-backup.service.ts:1113`. That is Drive file metadata in the player's
 * own Drive, uploaded as a separate multipart part from the payload blob, so it
 * is not in this object and is not meant to be.
 */
describe('never-exported storage keys', () => {
  const EXPORTED_AT = '2026-09-16T10:00:00.000Z';

  /**
   * Every scope populated, because an absence test over an empty payload is the
   * definition of a check that cannot fail. The three richest scopes carry real
   * fixtures; the rest carry one record each, which is enough for the cloner to
   * run and for the scope to appear in the serialised text.
   */
  function fullSections(
    savedTeamExtras: Record<string, unknown> = {},
  ): Parameters<typeof buildAllDataTransferPayload>[0] {
    return {
      favorites: { characters: [{ number: 1001, name: 'Luffy' }] },
      favoriteShips: {
        schemaVersion: 1,
        source: 'favorite-ships',
        exportedAt: EXPORTED_AT,
        ships: [{ id: 9001, name: 'Going Merry' }],
      },
      savedTeams: {
        schemaVersion: 1,
        source: 'saved-teams',
        exportedAt: EXPORTED_AT,
        teams: [
          {
            id: 'team-1',
            name: 'Crew 1',
            notes: '',
            shipId: null,
            slots: [1001, null, null, null, null, null],
            createdAt: EXPORTED_AT,
            updatedAt: EXPORTED_AT,
            ...savedTeamExtras,
          } as never,
        ],
      },
      savedRumbleTeams: {
        schemaVersion: 1,
        source: 'saved-rumble-teams',
        exportedAt: EXPORTED_AT,
        rumbleTeams: [{ id: 'rumble-1', name: 'Rumble crew' }] as never,
      },
      savedEnemies: {
        schemaVersion: 1,
        source: 'saved-enemies',
        exportedAt: EXPORTED_AT,
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
            createdAt: EXPORTED_AT,
            updatedAt: EXPORTED_AT,
          } as never,
        ],
      },
      characterBoxes: {
        schemaVersion: 1,
        source: 'character-boxes',
        exportedAt: EXPORTED_AT,
        boxes: [
          {
            id: 'box-1',
            name: 'Powerhouse Box',
            characterIds: [1001],
            createdAt: EXPORTED_AT,
            updatedAt: EXPORTED_AT,
          },
        ],
      },
      characterOverrides: {
        schemaVersion: 1,
        source: 'character-overrides',
        exportedAt: EXPORTED_AT,
        overrides: [{ characterId: 1001, name: 'Local Luffy' }] as never,
      },
      crewForgeProfiles: {
        schemaVersion: 1,
        source: 'crew-forge-profiles',
        exportedAt: EXPORTED_AT,
        profiles: [
          {
            id: 'profile-1',
            name: 'Wide',
            slotDefinitions: [{ id: 'slot-1' }],
            preprocess: { scale: 1 },
            examples: [{ id: 'example-1' }],
            exemplars: [{ id: 'exemplar-1', fingerprint: [1, 2, 3] }],
          },
        ] as never,
        lastProfileId: 'profile-1',
      },
      savedRumbleOpponents: {
        schemaVersion: 1,
        source: 'saved-rumble-opponents',
        exportedAt: EXPORTED_AT,
        opponents: [
          {
            id: 'opponent-1',
            name: 'Kaido',
            activeCharacterIds: [1001],
            benchCharacterIds: [],
          },
        ] as never,
      },
      boostedCharacterIds: {
        schemaVersion: 1,
        source: 'boosted-characters',
        exportedAt: EXPORTED_AT,
        characterIds: [1001],
      },
    };
  }

  it('populates every scope, so the absence assertions below are not vacuous', () => {
    const payload = buildAllDataTransferPayload(fullSections(), EXPORTED_AT);

    for (const scope of ALL_DATA_TRANSFER_SCOPES) {
      expect(payload[scope], `the fixture must populate ${scope}`).toBeDefined();
    }
  });

  it('carries no never-exported key anywhere in the serialised export', () => {
    const records = neverExportedStorageKeys();

    /*
     * A loop over an empty list passes. 17 of the 28 registered keys are
     * never-exported today; asserting the count is non-trivial is what stops a
     * future registry refactor from turning this test into a no-op.
     */
    expect(records.length).toBeGreaterThan(10);

    const payload = buildAllDataTransferPayload(fullSections(), EXPORTED_AT);
    const serialized = JSON.stringify(payload);

    for (const record of records) {
      expect(serialized, `the export must not carry ${record.key}`).not.toContain(
        `"${record.key}"`,
      );
    }

    const topLevel = Object.keys(payload).filter((key) =>
      records.some((record) => record.key === key),
    );

    expect(topLevel).toEqual([]);
  });

  it('goes red when a forbidden key is nested inside a scope payload', () => {
    /*
     * The mutation proof, kept as a test rather than done by hand once.
     * `cloneSavedTeamsPayload` spreads each team, so an injected key survives -
     * unlike `boostedCharacterIds` or `favorites`, whose cloners rebuild their
     * records and would strip the injection, making a broken test look green.
     */
    const payload = buildAllDataTransferPayload(
      fullSections({ optc_google_account_session: 'ya29.leaked' }),
      EXPORTED_AT,
    );

    expect(JSON.stringify(payload)).toContain('"optc_google_account_session"');
  });
});
