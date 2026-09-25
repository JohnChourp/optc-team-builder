import { Component, Input, type OnChanges } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { type CharacterFacetSelection } from '../../core/models/optc.models';
import {
  type CharacterFacetRecordLike,
  type FormOnlyClassMatch,
  resolveFormOnlyClassMatch,
} from '../../core/services/character-facet-filter.utils';

/**
 * 869f63gv6. "Driven after swap (as Smoker)": the mark a class match carries when it exists only
 * through one of a dual or VS unit's forms.
 *
 * The class filters and Captain Coverage count a form's classes, because a unit's classes after a
 * swap are its form's classes - but #1983 Smoker & Tashigi is Driven only as Smoker, so a Driven
 * list that showed it with nothing said would be claiming more than the game gives. Every host that
 * lets a form's class count renders this beside the card; it renders nothing otherwise.
 *
 * A host either hands over the record and its class filter's selection, resolved here, or - where
 * a Captain's boost counts too - a `match` it resolved itself, which wins.
 */
@Component({
  selector: 'app-form-class-marker',
  standalone: true,
  imports: [TranslocoDirective],
  templateUrl: './form-class-marker.component.html',
  styleUrl: './form-class-marker.component.scss',
})
export class FormClassMarkerComponent implements OnChanges {
  @Input() public match: FormOnlyClassMatch | null | undefined = undefined;
  @Input() public record: CharacterFacetRecordLike | null = null;
  @Input() public selection: CharacterFacetSelection | null = null;

  public resolved: FormOnlyClassMatch | null = null;

  public ngOnChanges(): void {
    this.resolved =
      this.match !== undefined
        ? this.match
        : this.record
          ? resolveFormOnlyClassMatch(this.record, this.selection)
          : null;
  }
}
