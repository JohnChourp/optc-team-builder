import { describe, expect, it } from 'vitest';

import {
  type AutoBuildAbilityCatalogItem,
  type AutoBuildEnemyMechanicCatalogItem,
} from '../../core/models/auto-team-builder-ability.models';
import {
  applyAutocompleteSelection,
  buildAutocompleteSuggestions,
  extractAutocompleteToken,
  type EnemyTextAutocompleteSuggestion,
  type EnemyTextAutocompleteToken,
} from './saved-enemies-text-autocomplete.utils';

describe('extractAutocompleteToken', () => {
  it('returns the current line up to the caret', () => {
    const value = 'first line\n4 turn(s) Para';
    const token = extractAutocompleteToken(value, value.length);

    expect(token).toEqual({
      lineContent: '4 turn(s) Para',
      start: 'first line\n'.length,
      end: value.length,
    });
  });

  it('strips leading bullet markers and whitespace', () => {
    const value = '  - Para';
    const token = extractAutocompleteToken(value, value.length);

    expect(token?.lineContent).toBe('Para');
    expect(token?.start).toBe(4);
  });

  it('returns null when the line is empty or whitespace only', () => {
    expect(extractAutocompleteToken('', 0)).toBeNull();
    expect(extractAutocompleteToken('\n\n   ', 5)).toBeNull();
  });

  it('clamps an out-of-range caret index', () => {
    const value = 'Paralysis';
    const token = extractAutocompleteToken(value, 999);

    expect(token?.lineContent).toBe('Paralysis');
    expect(token?.end).toBe(value.length);
  });

  it('only considers the line that contains the caret', () => {
    const value = '4 turn(s) Paralysis\nfix';
    const token = extractAutocompleteToken(value, value.length);

    expect(token?.lineContent).toBe('fix');
    expect(token?.start).toBe('4 turn(s) Paralysis\n'.length);
  });
});

describe('buildAutocompleteSuggestions', () => {
  const paralysis = createMechanic({
    key: 'crew_paralysis',
    label: 'Paralysis',
    keywords: ['paralysis'],
    category: 'crewDebuff',
  });
  const specialBind = createMechanic({
    key: 'crew_special_bind',
    label: 'Silence / Special Bind',
    keywords: ['silence', 'special bind'],
    category: 'crewDebuff',
  });
  const damageNullification = createMechanic({
    key: 'enemy_damage_nullification',
    label: 'Damage Nullification',
    keywords: ['damage nullification'],
    category: 'enemyDefense',
  });

  const dealFixedDamage = createAbility({
    key: 'deal_fixed_damage',
    label: 'Fixed Damage',
    category: 'special',
  });
  const removeParalysis = createAbility({
    key: 'remove_paralysis',
    label: 'Remove Paralysis',
    category: 'special',
  });

  it('returns nothing for tokens shorter than the minimum length', () => {
    const suggestions = buildAutocompleteSuggestions({
      token: createToken('p'),
      mechanics: [paralysis],
      abilities: [],
    });

    expect(suggestions).toEqual([]);
  });

  it('suggests matching mechanics by label prefix and exposes the matched offset', () => {
    const suggestions = buildAutocompleteSuggestions({
      token: createToken('4 turn(s) Para'),
      mechanics: [paralysis, specialBind, damageNullification],
      abilities: [],
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual(['Paralysis']);
    expect(suggestions[0]?.replaceStartOffset).toBe('4 turn(s) '.length);
  });

  it('suggests matching mechanics by keyword and reports the matched keyword', () => {
    const suggestions = buildAutocompleteSuggestions({
      token: createToken('4 turn(s) Special b'),
      mechanics: [specialBind, paralysis, damageNullification],
      abilities: [],
    });

    expect(suggestions[0]?.label).toBe('Silence / Special Bind');
    expect(suggestions[0]?.matchedKeyword).toBe('special bind');
    expect(suggestions[0]?.replaceStartOffset).toBe('4 turn(s) '.length);
  });

  it('matches ability labels when the line ends with their prefix', () => {
    const suggestions = buildAutocompleteSuggestions({
      token: createToken('fix'),
      mechanics: [paralysis, damageNullification],
      abilities: [dealFixedDamage],
    });

    expect(suggestions.map((suggestion) => suggestion.id)).toEqual(['ability:deal_fixed_damage']);
  });

  it('ranks the longer match higher when ability and mechanic both match', () => {
    const suggestions = buildAutocompleteSuggestions({
      token: createToken('Remove Para'),
      mechanics: [paralysis],
      abilities: [removeParalysis],
    });

    expect(suggestions[0]?.id).toBe('ability:remove_paralysis');
  });

  it('caps the result count', () => {
    const noisyAbilities: AutoBuildAbilityCatalogItem[] = Array.from({ length: 20 }, (_, index) =>
      createAbility({
        key: `noise_${index}`,
        label: `Noise ${index}`,
        category: 'special',
      }),
    );

    const suggestions = buildAutocompleteSuggestions({
      token: createToken('Noise'),
      mechanics: [],
      abilities: noisyAbilities,
      maxResults: 5,
    });

    expect(suggestions).toHaveLength(5);
  });

  it('ignores abilities without a resolved category', () => {
    const uncategorized: AutoBuildAbilityCatalogItem = {
      ...createAbility({ key: 'no_cat', label: 'Mystery', category: 'special' }),
      category: undefined,
    };

    const suggestions = buildAutocompleteSuggestions({
      token: createToken('Myst'),
      mechanics: [],
      abilities: [uncategorized],
    });

    expect(suggestions).toEqual([]);
  });

  it('ignores suggestions where the candidate does not extend from the line suffix', () => {
    const suggestions = buildAutocompleteSuggestions({
      token: createToken('Random text Para xyz'),
      mechanics: [paralysis],
      abilities: [],
    });

    expect(suggestions).toEqual([]);
  });
});

describe('applyAutocompleteSelection', () => {
  it('replaces only the matched suffix and appends a space', () => {
    const value = '4 turn(s) Para';
    const token = extractAutocompleteToken(value, value.length);

    expect(token).not.toBeNull();
    if (!token) {
      return;
    }

    const suggestion = createSuggestion('Paralysis', '4 turn(s) '.length);
    const result = applyAutocompleteSelection(value, token, suggestion);

    expect(result.value).toBe('4 turn(s) Paralysis ');
    expect(result.caret).toBe('4 turn(s) Paralysis '.length);
  });

  it('does not add a trailing space when the next character is whitespace', () => {
    const value = '4 turn(s) Para next';
    const token = extractAutocompleteToken(value, '4 turn(s) Para'.length);

    expect(token).not.toBeNull();
    if (!token) {
      return;
    }

    const suggestion = createSuggestion('Paralysis', '4 turn(s) '.length);
    const result = applyAutocompleteSelection(value, token, suggestion);

    expect(result.value).toBe('4 turn(s) Paralysis next');
  });

  it('does not add a trailing space when the next character is a newline', () => {
    const value = 'Para\nrest';
    const token = extractAutocompleteToken(value, 'Para'.length);

    expect(token).not.toBeNull();
    if (!token) {
      return;
    }

    const suggestion = createSuggestion('Paralysis', 0);
    const result = applyAutocompleteSelection(value, token, suggestion);

    expect(result.value).toBe('Paralysis\nrest');
  });
});

function createToken(lineContent: string): EnemyTextAutocompleteToken {
  return {
    lineContent,
    start: 0,
    end: lineContent.length,
  };
}

function createMechanic(
  overrides: Partial<AutoBuildEnemyMechanicCatalogItem> &
    Pick<AutoBuildEnemyMechanicCatalogItem, 'key' | 'label' | 'keywords' | 'category'>,
): AutoBuildEnemyMechanicCatalogItem {
  return {
    supportsTurns: true,
    availableTriggerTags: [],
    availableResponseTags: [],
    availableConditionTags: [],
    defaultTriggerTags: [],
    defaultResponseTags: [],
    defaultConditionTags: [],
    derivedAbilityKey: null,
    ...overrides,
  };
}

function createAbility(
  overrides: Partial<AutoBuildAbilityCatalogItem> &
    Pick<AutoBuildAbilityCatalogItem, 'key' | 'label' | 'category'>,
): AutoBuildAbilityCatalogItem {
  return {
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['specialText'],
    matchCount: 1,
    sampleCharacterIds: [1],
    sampleTexts: [],
    ...overrides,
  };
}

function createSuggestion(
  label: string,
  replaceStartOffset: number,
): EnemyTextAutocompleteSuggestion {
  return {
    id: `mechanic:${label.toLowerCase()}`,
    source: 'mechanic',
    label,
    insertText: label,
    category: 'crewDebuff',
    hint: null,
    matchedKeyword: null,
    replaceStartOffset,
    score: 50,
  };
}
