import { Component, EventEmitter, Input, Output } from '@angular/core';

import { type AutoBuildAbilityCategory } from '../../core/models/auto-team-builder-ability.models';

export type AbilityFilterRailCategory = Extract<
  AutoBuildAbilityCategory,
  'special' | 'crewmate' | 'potential' | 'support'
> | 'captainAbility';

export interface AbilityFilterRailItem {
  category: AbilityFilterRailCategory;
  label: string;
  count: number;
  disabled?: boolean;
  clearDisabled?: boolean;
}

@Component({
  selector: 'app-ability-filter-rail',
  standalone: true,
  templateUrl: './ability-filter-rail.component.html',
  styleUrl: './ability-filter-rail.component.scss',
})
export class AbilityFilterRailComponent {
  @Input({ required: true }) public items: AbilityFilterRailItem[] = [];
  @Input() public ariaLabel = '';
  @Input() public disabled = false;

  @Output() public readonly selectCategory = new EventEmitter<AbilityFilterRailCategory>();
  @Output() public readonly clearCategory = new EventEmitter<AbilityFilterRailCategory>();

  public open(item: AbilityFilterRailItem): void {
    if (this.isDisabled(item)) {
      return;
    }

    this.selectCategory.emit(item.category);
  }

  public clear(item: AbilityFilterRailItem, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.isClearDisabled(item)) {
      return;
    }

    this.clearCategory.emit(item.category);
  }

  public isDisabled(item: AbilityFilterRailItem): boolean {
    return this.disabled || Boolean(item.disabled);
  }

  public isClearDisabled(item: AbilityFilterRailItem): boolean {
    return this.isDisabled(item) || Boolean(item.clearDisabled) || item.count <= 0;
  }
}
