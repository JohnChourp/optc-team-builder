import { describe, expect, it } from 'vitest';

import {
  EnemyImportError,
  parseEnemyImportPayload,
  sanitizeEnemyImportPayload,
} from './saved-enemies-import.utils';

describe('saved enemies import utils', () => {
  it('parses and sanitizes a valid enemy payload while preserving the current image fallback', () => {
    const payload = parseEnemyImportPayload(
      JSON.stringify({
        schemaVersion: 1,
        source: 'optc-enemy-skill',
        exportType: 'enemy',
        enemy: {
          name: ' Red Cloth Bundle ',
          notes: ' Uses very high defense. ',
          requiredAbilities: [
            {
              abilityKey: 'deal_fixed_damage',
              minTurns: 3,
              slotTokens: ['str'],
              requiredCharacterCount: 2,
            },
            {
              abilityKey: 'inflict_poison',
              requiredCharacterCount: 1,
            },
          ],
          enemyMechanics: [
            {
              mechanicKey: 'enemy_increased_defense',
              category: 'interrupt',
              minTurns: 99,
              triggerTags: ['onSpecial'],
            },
          ],
          requireAllSelectedTypesInTeam: true,
        },
      }),
    );
    const result = sanitizeEnemyImportPayload(payload, {
      untitledEnemyName: 'Untitled Enemy',
      currentImageDataUrl: 'data:image/jpeg;base64,keep-me',
      availableTypes: ['DEX', 'QCK', 'STR'],
      availableClasses: ['Fighter', 'Slasher'],
      abilityCatalogItems: [
        createAbilityCatalogItem('deal_fixed_damage', 'Deal Fixed Damage', false),
        createAbilityCatalogItem('inflict_poison', 'Inflict Poison', false),
      ],
    });

    expect(result.enemy).toEqual({
      name: 'Red Cloth Bundle',
      notes: 'Uses very high defense.',
      imageDataUrl: 'data:image/jpeg;base64,keep-me',
      selectedTypes: ['DEX', 'QCK', 'STR'],
      selectedClasses: ['Fighter', 'Slasher'],
      requiredAbilities: [
        {
          abilityKey: 'deal_fixed_damage',
          minTurns: null,
          slotTokens: [],
          requiredCharacterCount: 2,
        },
        {
          abilityKey: 'inflict_poison',
          minTurns: null,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
      ],
      enemyMechanics: [
        {
          mechanicKey: 'enemy_increased_defense',
          category: 'enemyDefense',
          minTurns: 99,
          triggerTags: [],
          responseTags: [],
          conditionTags: [],
          derivedAbilityKey: 'remove_enemy_increased_defense',
        },
      ],
      requireAllSelectedTypesInTeam: true,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSpecialsSupportTeam: false,
    });
    expect(result.warnings).toEqual([
      { key: 'editor.import.warnings.defaultedTypes' },
      { key: 'editor.import.warnings.defaultedClasses' },
      {
        key: 'editor.import.warnings.adjustedAbilities',
        params: { count: 1 },
      },
    ]);
  });

  it('filters unknown classes, types, abilities, and mechanics with deterministic warnings', () => {
    const payload = parseEnemyImportPayload(
      JSON.stringify({
        schemaVersion: 1,
        source: 'optc-enemy-skill',
        exportType: 'enemy',
        enemy: {
          name: 'Bundle',
          imageDataUrl: null,
          selectedTypes: ['DEX', 'rainbow'],
          selectedClasses: ['Fighter', 'Unknown Class'],
          requiredAbilities: [
            { abilityKey: 'deal_fixed_damage' },
            { abilityKey: 'unknown_ability' },
          ],
          enemyMechanics: [
            { mechanicKey: 'enemy_increased_defense' },
            { mechanicKey: 'unknown_mechanic', category: 'enemyDefense' },
          ],
        },
      }),
    );
    const result = sanitizeEnemyImportPayload(payload, {
      untitledEnemyName: 'Untitled Enemy',
      currentImageDataUrl: 'data:image/jpeg;base64,keep-me',
      availableTypes: ['DEX', 'QCK', 'STR'],
      availableClasses: ['Fighter', 'Slasher'],
      abilityCatalogItems: [
        createAbilityCatalogItem('deal_fixed_damage', 'Deal Fixed Damage', false),
      ],
    });

    expect(result.enemy.imageDataUrl).toBeNull();
    expect(result.enemy.selectedTypes).toEqual(['DEX']);
    expect(result.enemy.selectedClasses).toEqual(['Fighter']);
    expect(result.enemy.requiredAbilities).toEqual([
      {
        abilityKey: 'deal_fixed_damage',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);
    expect(result.enemy.enemyMechanics).toEqual([
      expect.objectContaining({
        mechanicKey: 'enemy_increased_defense',
      }),
    ]);
    expect(result.warnings).toEqual([
      {
        key: 'editor.import.warnings.unavailableTypes',
        params: { count: 1 },
      },
      {
        key: 'editor.import.warnings.unavailableClasses',
        params: { count: 1 },
      },
      {
        key: 'editor.import.warnings.unsupportedAbilities',
        params: { count: 1 },
      },
      {
        key: 'editor.import.warnings.unsupportedMechanics',
        params: { count: 1 },
      },
    ]);
  });

  it('throws deterministic parse errors for invalid json and unsupported schema', () => {
    expect(() => parseEnemyImportPayload('{bad-json')).toThrowError(
      expect.objectContaining<Partial<EnemyImportError>>({
        key: 'editor.import.errors.invalidJson',
      }),
    );

    expect(() =>
      parseEnemyImportPayload(
        JSON.stringify({
          schemaVersion: 2,
          source: 'optc-enemy-skill',
          exportType: 'enemy',
          enemy: {},
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<EnemyImportError>>({
        key: 'editor.import.errors.unsupportedSchema',
      }),
    );
  });
});

function createAbilityCatalogItem(
  key: string,
  label: string,
  supportsTurns: boolean,
): {
  key: string;
  label: string;
  supportsTurns: boolean;
  supportsSlotTokens: boolean;
  availableSlotTokens: string[];
  availableSources: Array<'specialText'>;
  availableCoverageModes: Array<'explicit'>;
  matchCount: number;
  sampleCharacterIds: number[];
  sampleTexts: string[];
} {
  return {
    key,
    label,
    supportsTurns,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['specialText'],
    availableCoverageModes: ['explicit'],
    matchCount: 1,
    sampleCharacterIds: [1],
    sampleTexts: ['sample'],
  };
}
