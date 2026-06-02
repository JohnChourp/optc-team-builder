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
  it('filters type and class suggestions case-insensitively and caps them at eight', () => {
    const component = new CharacterFilterRowComponent();
    component.typeOptions = [
      'DEX',
      'STR',
      'QCK',
      'PSY',
      'INT',
      'Dual',
      'Driven',
      'Free Spirit',
      'Fighter',
    ];
    component.typeQuery = 'd';
    component.classOptions = ['Fighter', 'Slasher', 'Free Spirit'];
    component.classQuery = '';

    expect(component.filteredTypeOptions()).toEqual(['DEX', 'Dual', 'Driven']);
    expect(component.filteredClassOptions()).toEqual(['Fighter', 'Slasher', 'Free Spirit']);
  });

  it('hides suggestions when the current query already matches the selected value', () => {
    const component = new CharacterFilterRowComponent();
    component.typeOptions = ['DEX', 'STR'];
    component.typeQuery = 'DEX';
    component.selectedType = 'DEX';

    expect(component.showTypeSuggestions()).toBe(false);
  });

  it('emits primitive filter values from controls', () => {
    const component = new CharacterFilterRowComponent();
    const typeQueries: string[] = [];
    const selectedTypes: string[] = [];
    const costChanges: Array<{ bound: string; value: string | number | null }> = [];

    component.typeQueryChange.subscribe((value) => typeQueries.push(value));
    component.typeSelected.subscribe((value) => selectedTypes.push(value));
    component.costRangeChange.subscribe((value) => costChanges.push(value));

    component.onTypeInput({ detail: { value: 'de' } } as CustomEvent<{ value?: string | null }>);
    component.selectType('DEX');
    component.onCostRangeChange('min', {
      detail: { value: '20' },
    } as CustomEvent<{ value?: string | number | null }>);

    expect(typeQueries).toEqual(['de']);
    expect(selectedTypes).toEqual(['DEX']);
    expect(costChanges).toEqual([{ bound: 'min', value: '20' }]);
  });

  it('renders optional controls and mobile one-column CSS', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/shared/character-filter-row/character-filter-row.component.html'),
      'utf8',
    );
    const styles = readFileSync(
      resolve(process.cwd(), 'src/app/shared/character-filter-row/character-filter-row.component.scss'),
      'utf8',
    );

    expect(template).toContain('showTypeFilter');
    expect(template).toContain('showClassFilter');
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
});
