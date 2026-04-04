import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

  it('sanitizes the Onami and Shinobu whole-quest import fixture without warnings', () => {
    const payload = parseEnemyImportPayload(
      readFileSync(
        resolve(
          process.cwd(),
          'public/assets/data/import-examples/clash-onami-shinobu-bewitching.enemy.json',
        ),
        'utf8',
      ),
    );
    const result = sanitizeEnemyImportPayload(payload, {
      untitledEnemyName: 'Untitled Enemy',
      currentImageDataUrl: null,
      availableTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
      availableClasses: [
        'Booster',
        'Cerebral',
        'Driven',
        'Evolver',
        'Fighter',
        'Free Spirit',
        'Powerhouse',
        'Shooter',
        'Slasher',
        'Striker',
      ],
      abilityCatalogItems: [
        createAbilityCatalogItem('remove_chain_multiplier_limit', 'Remove Chain Multiplier Limit', true),
        createAbilityCatalogItem('remove_bind', 'Remove Bind', true),
        createAbilityCatalogItem('remove_despair', 'Remove Despair', true),
        createAbilityCatalogItem('remove_special_bind', 'Remove Special Bind', true),
        createAbilityCatalogItem('remove_atk_down', 'Remove ATK Down', true),
        createAbilityCatalogItem('remove_slot_bind', 'Remove Slot Bind', true),
        createAbilityCatalogItem('remove_ship_bind', 'Remove Ship Bind', true),
      ],
    });

    expect(result.enemy).toEqual({
      name: 'Clash!! Onami & Shinobu: Bewitching',
      notes:
        'Whole quest import. Battle 1: slot chance down. Battle 3: 4 turns top-row and bottom-row bind plus 4 turns top-row despair. Battle 4: 1 turn special reverse and defeat retreat/self-heal to 100%. Boss: changes to DEX, converts [RCV][TND][BOMB] to [BLOCK], interrupts beneficial slots with 10 turns of slot bind, and applies Limited Taps 2 times after revive. Boss bind/despair pattern is positional: top-right, middle-left, bottom-right bind for 6 turns and top-row despair for 6 turns.',
      imageDataUrl: null,
      selectedTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
      selectedClasses: [
        'Booster',
        'Cerebral',
        'Driven',
        'Evolver',
        'Fighter',
        'Free Spirit',
        'Powerhouse',
        'Shooter',
        'Slasher',
        'Striker',
      ],
      requiredAbilities: [
        {
          abilityKey: 'remove_chain_multiplier_limit',
          minTurns: 5,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
        {
          abilityKey: 'remove_bind',
          minTurns: 6,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
        {
          abilityKey: 'remove_despair',
          minTurns: 6,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
        {
          abilityKey: 'remove_special_bind',
          minTurns: 4,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
        {
          abilityKey: 'remove_atk_down',
          minTurns: 6,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
        {
          abilityKey: 'remove_slot_bind',
          minTurns: 10,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
        {
          abilityKey: 'remove_ship_bind',
          minTurns: 3,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
      ],
      enemyMechanics: [
        {
          mechanicKey: 'enemy_immunity',
          category: 'enemyDefense',
          minTurns: 98,
          triggerTags: [],
          responseTags: [],
          conditionTags: [],
          derivedAbilityKey: null,
        },
        {
          mechanicKey: 'crew_chain_multiplier_limit',
          category: 'crewDebuff',
          minTurns: 5,
          triggerTags: [],
          responseTags: [],
          conditionTags: [],
          derivedAbilityKey: 'remove_chain_multiplier_limit',
        },
        {
          mechanicKey: 'crew_bind',
          category: 'crewDebuff',
          minTurns: 6,
          triggerTags: [],
          responseTags: [],
          conditionTags: [],
          derivedAbilityKey: 'remove_bind',
        },
        {
          mechanicKey: 'crew_despair',
          category: 'crewDebuff',
          minTurns: 6,
          triggerTags: [],
          responseTags: [],
          conditionTags: [],
          derivedAbilityKey: 'remove_despair',
        },
        {
          mechanicKey: 'crew_special_bind',
          category: 'crewDebuff',
          minTurns: 4,
          triggerTags: [],
          responseTags: [],
          conditionTags: [],
          derivedAbilityKey: 'remove_special_bind',
        },
        {
          mechanicKey: 'crew_atk_down',
          category: 'crewDebuff',
          minTurns: 6,
          triggerTags: [],
          responseTags: [],
          conditionTags: [],
          derivedAbilityKey: 'remove_atk_down',
        },
        {
          mechanicKey: 'orb_slot_bind',
          category: 'orbControl',
          minTurns: 10,
          triggerTags: [],
          responseTags: [],
          conditionTags: [],
          derivedAbilityKey: 'remove_slot_bind',
        },
        {
          mechanicKey: 'condition_revive',
          category: 'conditional',
          minTurns: null,
          triggerTags: [],
          responseTags: [],
          conditionTags: ['revive'],
          derivedAbilityKey: null,
        },
      ],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSpecialsSupportTeam: false,
    });
    expect(result.warnings).toEqual([]);
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
