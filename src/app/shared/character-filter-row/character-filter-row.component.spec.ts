import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { CharacterFilterRowComponent } from './character-filter-row.component';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonInput: class {},
  IonSelect: class {},
  IonSelectOption: class {},
  IonToggle: class {},
}));

describe('CharacterFilterRowComponent', () => {
  it('emits primitive filter values from controls', () => {
    const component = new CharacterFilterRowComponent();
    const characterBoxes: string[] = [];
    const costChanges: Array<{ bound: string; value: string | number | null }> = [];

    component.characterBoxChange.subscribe((value) => characterBoxes.push(value));
    component.costRangeChange.subscribe((value) => costChanges.push(value));

    component.onCharacterBoxChange({ detail: { value: 'box-1' } } as CustomEvent<{
      value?: string | null;
    }>);
    component.onCostRangeChange('min', {
      detail: { value: '20' },
    } as CustomEvent<{ value?: string | number | null }>);

    expect(characterBoxes).toEqual(['box-1']);
    expect(costChanges).toEqual([{ bound: 'min', value: '20' }]);
  });

  it('renders optional controls and mobile one-column CSS', () => {
    const template = readFileSync(
      resolve(
        process.cwd(),
        'src/app/shared/character-filter-row/character-filter-row.component.html',
      ),
      'utf8',
    );
    const styles = readFileSync(
      resolve(
        process.cwd(),
        'src/app/shared/character-filter-row/character-filter-row.component.scss',
      ),
      'utf8',
    );

    expect(template).toContain('showCharacterBoxFilter');
    expect(template).toContain("favoriteMode === 'toggles'");
    expect(template).toContain("favoriteMode === 'select'");
    expect(template).toContain('showCostFilter');
    expect(template).toContain('showMembershipFilter');
    expect(template).toContain('showSortFilter');
    expect(template).toContain('showIdOrderFilter');
    expect(styles).toContain('flex-wrap: wrap');
    expect(styles).toContain('@media (max-width: 640px)');
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr)');
  });

  /*
   * Type and class moved to `app-character-facet-filter`, a multi-select with an
   * AND/OR match mode. The single-value typeahead that used to live here cannot
   * express that, so it is gone rather than kept as a second, weaker way to
   * filter the same two facets. This test fails if any of it comes back.
   */
  it('no longer exposes type or class inputs, outputs, or typeahead markup', () => {
    const component = new CharacterFilterRowComponent() as unknown as Record<string, unknown>;
    const retiredMembers = [
      'showTypeFilter',
      'typeLabel',
      'typePlaceholder',
      'typeOptions',
      'typeQuery',
      'selectedType',
      'showClassFilter',
      'classLabel',
      'classPlaceholder',
      'classOptions',
      'classQuery',
      'selectedClass',
      'typeQueryChange',
      'typeSelected',
      'typeCleared',
      'classQueryChange',
      'classSelected',
      'classCleared',
      'filteredTypeOptions',
      'filteredClassOptions',
      'showTypeSuggestions',
      'showClassSuggestions',
      'onTypeInput',
      'selectType',
      'clearType',
      'onClassInput',
      'selectClass',
      'clearClass',
      'filterTextOptions',
    ];

    for (const member of retiredMembers) {
      expect(component[member]).toBeUndefined();
    }

    const template = readFileSync(
      resolve(
        process.cwd(),
        'src/app/shared/character-filter-row/character-filter-row.component.html',
      ),
      'utf8',
    );
    const styles = readFileSync(
      resolve(
        process.cwd(),
        'src/app/shared/character-filter-row/character-filter-row.component.scss',
      ),
      'utf8',
    );

    for (const marker of [
      'showTypeFilter',
      'showClassFilter',
      'character-filter-suggestion',
      'character-filter-inline-clear',
    ]) {
      expect(template).not.toContain(marker);
      expect(styles).not.toContain(marker);
    }
  });
});
