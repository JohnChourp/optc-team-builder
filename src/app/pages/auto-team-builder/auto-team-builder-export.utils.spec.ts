import { describe, expect, it } from 'vitest';

import { createEmptyAutoBuildManualSlots } from '../../core/models/auto-team-builder.models';
import { type CharacterTagSetSelection } from '../../core/models/optc.models';
import {
  AutoTeamSelectionImportError,
  buildAutoTeamSelectionExportPayload,
  parseAutoTeamSelectionImportPayload,
  sanitizeAutoTeamSelectionImportPayload,
  type AutoTeamSelectionExportPayload,
} from './auto-team-builder-export.utils';

/**
 * Covers only the character-tag-set half of the schema 33 bump: that a v32
 * payload still imports (with its operator reconstructed), that a v33 payload
 * round-trips the grouping intact, and that an unknown future version is
 * rejected rather than half-read.
 */
describe('auto-team-builder-export.utils character tag sets', () => {
  it('emits schema 33 and carries the tag sets through the payload', () => {
    const payload = buildExportPayload({
      operator: 'all',
      sets: [
        { id: 'set-1', operator: 'any', tags: ['Straw Hat Pirates', 'Heart Pirates'] },
        { id: 'set-2', operator: 'all', tags: ['Dressrosa'] },
      ],
    });

    expect(payload.schemaVersion).toBe(33);
    expect(payload.filters.characterTagSets).toEqual({
      operator: 'all',
      sets: [
        { id: 'set-1', operator: 'any', tags: ['Straw Hat Pirates', 'Heart Pirates'] },
        { id: 'set-2', operator: 'all', tags: ['Dressrosa'] },
      ],
    });
  });

  it('omits the tag sets entirely when nothing is selected', () => {
    const payload = buildExportPayload({ operator: 'all', sets: [] });

    expect(payload.filters).not.toHaveProperty('characterTagSets');
  });

  it('round-trips a v33 payload without collapsing the grouping', () => {
    const selection: CharacterTagSetSelection = {
      operator: 'any',
      sets: [
        { id: 'set-1', operator: 'any', tags: ['Straw Hat Pirates', 'Heart Pirates'] },
        { id: 'set-2', operator: 'all', tags: ['Dressrosa', 'Minks'] },
      ],
    };
    const parsed = parseAutoTeamSelectionImportPayload(
      JSON.stringify(buildExportPayload(selection)),
    );

    const { state } = sanitizeAutoTeamSelectionImportPayload(parsed, sanitizeOptions());

    expect(state.characterTagSets).toEqual(selection);
    // The flat list is derived from the sets, so both stay consistent.
    expect(state.selectedCharacterTags).toEqual([
      'Straw Hat Pirates',
      'Heart Pirates',
      'Dressrosa',
      'Minks',
    ]);
  });

  it('back-fills a strict v32 payload into a single AND group', () => {
    const legacy = legacyPayload(['Straw Hat Pirates', 'Minks'], true);

    const { state, warnings } = sanitizeAutoTeamSelectionImportPayload(
      parseAutoTeamSelectionImportPayload(JSON.stringify(legacy)),
      sanitizeOptions(),
    );

    expect(state.characterTagSets?.operator).toBe('all');
    expect(state.characterTagSets?.sets).toHaveLength(1);
    expect(state.characterTagSets?.sets[0]?.operator).toBe('all');
    expect(state.characterTagSets?.sets[0]?.tags).toEqual(['Straw Hat Pirates', 'Minks']);
    expect(state.requireAllSelectedCharacterTagsInTeam).toBe(true);
    expect(warnings).toEqual([]);
  });

  it('back-fills a relaxed v32 payload into a single OR group', () => {
    const legacy = legacyPayload(['Straw Hat Pirates', 'Minks'], false);

    const { state } = sanitizeAutoTeamSelectionImportPayload(
      parseAutoTeamSelectionImportPayload(JSON.stringify(legacy)),
      sanitizeOptions(),
    );

    expect(state.characterTagSets?.sets[0]?.operator).toBe('any');
    expect(state.requireAllSelectedCharacterTagsInTeam).toBe(false);
  });

  it('leaves a tagless v32 payload with no groups at all', () => {
    const { state } = sanitizeAutoTeamSelectionImportPayload(
      parseAutoTeamSelectionImportPayload(JSON.stringify(legacyPayload([], false))),
      sanitizeOptions(),
    );

    expect(state.characterTagSets?.sets).toEqual([]);
    expect(state.selectedCharacterTags).toEqual([]);
  });

  it('preserves the original casing of imported tags', () => {
    const { state } = sanitizeAutoTeamSelectionImportPayload(
      parseAutoTeamSelectionImportPayload(
        JSON.stringify(
          buildExportPayload({
            operator: 'all',
            sets: [{ id: 'set-1', operator: 'any', tags: ['straw hat pirates'] }],
          }),
        ),
      ),
      sanitizeOptions(),
    );

    expect(state.characterTagSets?.sets[0]?.tags).toEqual(['straw hat pirates']);
  });

  it('normalizes the flat back-compat list without touching the sets', () => {
    const { state } = sanitizeAutoTeamSelectionImportPayload(
      parseAutoTeamSelectionImportPayload(
        JSON.stringify(
          buildExportPayload({
            operator: 'all',
            sets: [
              { id: 'set-1', operator: 'any', tags: ['Straw Hat Pirates', 'Heart  Pirates'] },
              { id: 'set-2', operator: 'any', tags: ['straw hat pirates'] },
            ],
          }),
        ),
      ),
      sanitizeOptions(),
    );

    // Pre-schema-33 readers count the flat list, so it stays deduped
    // case-insensitively with inner whitespace collapsed.
    expect(state.selectedCharacterTags).toEqual(['Straw Hat Pirates', 'Heart Pirates']);
    // The sets are what the picker shows, so they keep every tag verbatim.
    expect(state.characterTagSets?.sets[0]?.tags).toEqual(['Straw Hat Pirates', 'Heart  Pirates']);
    expect(state.characterTagSets?.sets[1]?.tags).toEqual(['straw hat pirates']);
  });

  it('warns about tag groups it had to drop', () => {
    const payload = buildExportPayload({ operator: 'all', sets: [] });
    const raw = {
      ...payload,
      filters: {
        ...payload.filters,
        characterTagSets: {
          operator: 'all',
          sets: [
            { id: 'set-1', operator: 'any', tags: ['Straw Hat Pirates'] },
            { id: 'set-2', operator: 'any', tags: [] },
            { id: 'set-3', operator: 'any', tags: ['   '] },
          ],
        },
      },
    };

    const { state, warnings } = sanitizeAutoTeamSelectionImportPayload(
      parseAutoTeamSelectionImportPayload(JSON.stringify(raw)),
      sanitizeOptions(),
    );

    expect(state.characterTagSets?.sets).toHaveLength(1);
    expect(warnings).toContainEqual({
      key: 'preset.warnings.unavailableCharacterTagSets',
      params: { count: 2 },
    });
  });

  it('rejects an unknown future schema version', () => {
    const payload = { ...buildExportPayload({ operator: 'all', sets: [] }), schemaVersion: 34 };

    expect(() => parseAutoTeamSelectionImportPayload(JSON.stringify(payload))).toThrowError(
      AutoTeamSelectionImportError,
    );
  });

  it('rejects a payload whose tag sets are not a set collection', () => {
    const payload = buildExportPayload({ operator: 'all', sets: [] });
    const raw = {
      ...payload,
      filters: { ...payload.filters, characterTagSets: { operator: 'all' } },
    };

    expect(() => parseAutoTeamSelectionImportPayload(JSON.stringify(raw))).toThrowError(
      AutoTeamSelectionImportError,
    );
  });
});

function buildExportPayload(
  characterTagSets: CharacterTagSetSelection,
): AutoTeamSelectionExportPayload {
  return buildAutoTeamSelectionExportPayload({
    selectedTypes: [],
    selectedClasses: [],
    characterTagSets,
    requiredAbilities: [],
    enemyMechanics: [],
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    requireAllSlotsInLeaderSuperEffectScope: false,
    requireUniqueBaseCharacterNames: true,
    favoritesOnly: false,
    favoriteCount: 0,
    manualSlots: createEmptyAutoBuildManualSlots(),
    lockedCharacterIds: [],
    lockedCharacters: [],
    excludedCharacters: [],
    selectedLeaderIds: [],
    captainLeaderId: null,
    friendCaptainLeaderId: null,
    exportedAt: '2026-07-19T00:00:00.000Z',
  });
}

/** A schema 32 payload: flat tag list plus the legacy strictness boolean. */
function legacyPayload(
  selectedCharacterTags: string[],
  requireAllSelectedCharacterTagsInTeam: boolean,
): Record<string, unknown> {
  const payload = buildExportPayload({ operator: 'all', sets: [] });

  return {
    ...payload,
    schemaVersion: 32,
    filters: {
      ...payload.filters,
      selectedCharacterTags,
      requireAllSelectedCharacterTagsInTeam,
    },
  };
}

function sanitizeOptions() {
  return {
    availableTypes: [] as const,
    availableClasses: [] as const,
    abilityCatalogItems: [],
    availableLockedCharacters: [],
  };
}
