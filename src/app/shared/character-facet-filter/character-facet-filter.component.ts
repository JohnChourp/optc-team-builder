import {
  Component,
  EventEmitter,
  Input,
  type OnChanges,
  type OnInit,
  Output,
  type SimpleChanges,
  computed,
  signal,
} from '@angular/core';
import { IonButton, IonIcon, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { swapHorizontalOutline } from 'ionicons/icons';

import {
  type CharacterFacetKind,
  type CharacterFacetMatchMode,
  type CharacterFacetSelection,
} from '../../core/models/optc.models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import {
  MAX_HELD_CHARACTER_FACET_VALUES,
  characterFacetSelectionsEqual,
  createEmptyCharacterFacetSelection,
  foldCharacterFacetValue,
  isCharacterFacetAllModeSatisfiable,
  normalizeCharacterFacetSelection,
  toggleCharacterFacetValue,
} from '../../core/services/character-facet-filter.utils';
import { CharacterFacetFilterStylePanelsComponent } from './character-facet-filter-style-panels.component';

/**
 * `chips` renders every option as a togglable pill — one tap per value, which is
 * right for the five type codes. `select` renders an `ion-select[multiple]` plus
 * a removable chip row, which is what Auto Team Builder already ships and what
 * the ten class names need so the control never opens a horizontal scroll rail
 * inside `ion-content`.
 */
export type CharacterFacetPresentation = 'chips' | 'select';

/**
 * `capacity` — the selection holds more values than a character can ever hold,
 * so `all` is arithmetically unsatisfiable. Provable from arity alone, so it
 * renders on every host.
 * `disjoint` — a satisfiable `all` selection that simply matches no row. A real,
 * legitimate query, and a different message. Rendered ONLY where the host
 * supplies `matchCount`: the control never claims a disjointness it cannot prove.
 */
export type CharacterFacetZeroReason = 'capacity' | 'disjoint';

/**
 * One flat value list plus one match mode, for the two closed facet vocabularies
 * (`type`, `class`). Deliberately NOT the multi-set modal used by ability tags
 * and character tags: a character holds at most two values of either facet, so
 * every multi-set formula other than a single conjunction is degenerate.
 *
 * FACET VALUES ARE NEVER TRANSLATED. `STR`, `QCK`, `Free Spirit` are in-game
 * identifiers that every predicate and every SQL `LIKE` param compares against
 * the dataset verbatim; translating them would break matching in `el`. Verified:
 * no i18n file in this repo contains a type code or a class name.
 */
@Component({
  selector: 'app-character-facet-filter',
  standalone: true,
  imports: [
    CharacterFacetFilterStylePanelsComponent,
    IonButton,
    IonIcon,
    IonSelect,
    IonSelectOption,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './character-facet-filter.component.html',
  styleUrl: './character-facet-filter.component.scss',
})
export class CharacterFacetFilterComponent implements OnChanges, OnInit {
  @Input({ required: true }) public kind: CharacterFacetKind = 'type';

  /** The facet vocabulary, in dataset case. Normally `DatasetManifest.availableTypes`/`availableClasses`. */
  @Input({ required: true }) public options: string[] = [];

  /** Host-owned source of truth. A host reset propagates here through `ngOnChanges`. */
  @Input({ required: true }) public selection: CharacterFacetSelection =
    createEmptyCharacterFacetSelection();

  /** Host name; test ids become `${testIdPrefix}-${kind}-facet-*`. */
  @Input({ required: true }) public testIdPrefix = '';

  @Input() public label = '';
  @Input() public placeholder = '';
  @Input() public presentation: CharacterFacetPresentation = 'select';

  /**
   * Mirrored into `disabledState` by `ngOnChanges`. A `computed()` only
   * recomputes when a SIGNAL it read changes; reading a plain `@Input` inside
   * one latches whatever the property held on first evaluation. Hosts bind this
   * to a load flag that is true during the very first render, which is exactly
   * how the Characters-page tag filter once latched disabled forever and made
   * the whole filter unreachable. Do not "simplify" this away.
   */
  @Input() public disabled = false;

  /**
   * Live count of characters matching THIS facet alone, or `null` when the host
   * has no cheap catalog in hand. Only hosts that already hold a catalog pass it.
   */
  @Input() public matchCount: number | null = null;

  @Output() public readonly selectionChange = new EventEmitter<CharacterFacetSelection>();

  public readonly kindState = signal<CharacterFacetKind>('type');
  public readonly optionsState = signal<string[]>([]);
  public readonly selectionState = signal<CharacterFacetSelection>(
    createEmptyCharacterFacetSelection(),
  );
  /** Signal mirror of the `disabled` @Input — see the note on that property. */
  public readonly disabledState = signal(false);
  public readonly matchCountState = signal<number | null>(null);
  public readonly announcement = signal('');
  public readonly swapIcon = swapHorizontalOutline;

  /**
   * The user's INTENT, remembered across a demotion, so dropping back to a
   * satisfiable count restores `all` automatically. Component-local by design:
   * a host-held intent would reintroduce the impossible `all`-across-three value
   * the normalizer exists to make unrepresentable. It is lost when the component
   * is destroyed — documented, and acceptable.
   *
   * A SIGNAL rather than a plain field because `zeroReason` reads it.
   */
  private readonly preferredMatchMode = signal<CharacterFacetMatchMode>('any');

  public readonly values = computed(() => this.selectionState().values);
  public readonly matchMode = computed(() => this.selectionState().matchMode);
  public readonly maxAllValues = computed(() => MAX_HELD_CHARACTER_FACET_VALUES[this.kindState()]);

  /**
   * Progressive disclosure at ONE value, not two: `all` over a pair is the
   * headline capability of this control, and a mode toggle that only materialises
   * after the second tap is a capability nobody discovers.
   */
  public readonly showModeControl = computed(() => this.values().length >= 1);

  public readonly allModeSatisfiable = computed(() =>
    isCharacterFacetAllModeSatisfiable(this.kindState(), this.values().length),
  );

  public readonly zeroReason = computed<CharacterFacetZeroReason | null>(() => {
    /*
     * `capacity` reports a DEMOTION, so it is keyed off the user's intent, not
     * off the value count alone. Selecting three types in `any` mode is an
     * ordinary query and must stay silent.
     */
    if (this.preferredMatchMode() === 'all' && !this.allModeSatisfiable()) {
      return 'capacity';
    }

    if (this.matchMode() !== 'all' || this.values().length < 2) {
      return null;
    }

    // Never claimed without evidence: `null` means the host supplied no count.
    return this.matchCountState() === 0 ? 'disjoint' : null;
  });

  public readonly selectedText = computed(() => this.values().join(', '));

  public readonly supportText = computed(() => {
    if (this.values().length === 0) {
      return this.t('support.empty');
    }

    return this.t(`support.${this.matchMode()}`);
  });

  public constructor(private readonly i18n: AppI18nService) {}

  public async ngOnInit(): Promise<void> {
    // Warm this control's own scope so nothing renders a raw key. Hosts do not
    // have to remember: the component owns its scope, exactly as the character
    // tag filter owns `character-tag-filter`.
    await this.i18n.preloadScope('character-facet-filter');
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['kind']) {
      this.kindState.set(this.kind);
    }

    if (changes['options']) {
      this.optionsState.set([...this.options]);
    }

    if (changes['disabled']) {
      this.disabledState.set(this.disabled);
    }

    if (changes['matchCount']) {
      this.matchCountState.set(this.matchCount);
    }

    if (changes['selection']) {
      // The host is the source of truth. This is what makes a host reset
      // visibly clear the chips and the mode row.
      const next = normalizeCharacterFacetSelection(this.kind, this.selection);

      this.selectionState.set(next);
      this.preferredMatchMode.set(next.matchMode);
    }
  }

  public isSelected(option: string): boolean {
    const key = foldCharacterFacetValue(option);

    return this.values().some((value) => foldCharacterFacetValue(value) === key);
  }

  /** `chips` presentation. */
  public toggleValue(option: string): void {
    this.emit(toggleCharacterFacetValue(this.values(), option), this.preferredMatchMode());
  }

  /** `select` presentation. */
  public onValuesChange(event: CustomEvent<{ value?: string[] | null }>): void {
    this.emit(event.detail.value ?? [], this.preferredMatchMode());
  }

  /**
   * Removing ONE value does not reset the mode: a user who chose `All` keeps
   * that preference. Only `clear()` drops it, because an empty selection has no
   * mode left to preserve.
   */
  public removeValue(value: string): void {
    this.emit(toggleCharacterFacetValue(this.values(), value), this.preferredMatchMode());
  }

  public setMatchMode(mode: CharacterFacetMatchMode): void {
    if (this.disabledState()) {
      return;
    }

    if (mode === 'all' && !this.allModeSatisfiable()) {
      // Belt and braces alongside the disabled button: a synthetic click, a
      // restored preset or a future URL param cannot get through either.
      return;
    }

    this.emit(this.values(), mode);
  }

  public clear(): void {
    this.emit([], 'any');
  }

  public facetTestId(suffix: string): string {
    return `${this.testIdPrefix}-${this.kindState()}-facet-${suffix}`;
  }

  public valueTestId(value: string): string {
    return this.facetTestId(`value-${value.trim().toLowerCase().replace(/\s+/g, '-')}`);
  }

  /** The single write path: every mutation normalizes, announces and emits here. */
  private emit(values: readonly string[], requestedMode: CharacterFacetMatchMode): void {
    if (this.disabledState()) {
      return;
    }

    this.preferredMatchMode.set(requestedMode);

    const kind = this.kindState();
    // Sticky intent: `all` comes back the moment the selection is small enough.
    const wanted: CharacterFacetMatchMode = isCharacterFacetAllModeSatisfiable(kind, values.length)
      ? requestedMode
      : 'any';
    const next = normalizeCharacterFacetSelection(kind, { values: [...values], matchMode: wanted });

    if (characterFacetSelectionsEqual(this.selectionState(), next)) {
      return;
    }

    this.selectionState.set(next);
    this.announcement.set(this.buildAnnouncement(next));
    this.selectionChange.emit(next);
  }

  private buildAnnouncement(next: CharacterFacetSelection): string {
    if (next.values.length === 0) {
      return this.t('a11y.cleared');
    }

    if (this.preferredMatchMode() === 'all' && next.matchMode === 'any') {
      // The one path prevention cannot cover: growing a satisfiable `all` set
      // past what a character can hold. Say what happened, never silently rewrite.
      return this.t(`mode.capacity.${this.kindState()}`, {
        max: this.maxAllValues(),
        count: next.values.length,
      });
    }

    return this.t('a11y.applied', {
      count: next.values.length,
      mode: this.t(`mode.${next.matchMode}`),
    });
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.translate(key, params, 'character-facet-filter');
  }
}
