import {
  type CharacterListItem,
  type LocalCharacterOverride,
} from '../../core/models/optc.models';

/**
 * What a local override actually changed, field by field.
 *
 * 869f12x4e. An "Edited locally" chip shipped in v0.4.15 and says THIS ONE is
 * edited. Nothing said which characters are edited, or what an edit did. An
 * override that quietly disagrees with the dataset is exactly the kind of thing
 * that makes a builder result look wrong for reasons the reader has forgotten
 * about - which also makes this a support tool, not only a feature: it is the
 * first thing to check when a result is disputed.
 *
 * Pure on purpose. Settings pages have no TestBed in this repo, so the
 * comparison has to be testable without one.
 */
export interface CharacterOverrideFieldChange {
  /** Key segment under `management.characterOverrides.fields`. */
  readonly field: string;
  /** The dataset's value, as a reader would read it. */
  readonly from: string;
  /** The reader's value. */
  readonly to: string;
}

export interface CharacterOverrideDiff {
  readonly characterId: number;
  /** The reader's name for it, falling back to the dataset's. */
  readonly name: string;
  readonly updatedAt: string;
  readonly changes: readonly CharacterOverrideFieldChange[];
  /**
   * True when the dataset no longer has this character. The override is kept -
   * deleting it would be losing the reader's work over a data update - but its
   * changes cannot be shown against anything.
   */
  readonly datasetMissing: boolean;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : '—';
  }

  return String(value);
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftItems = Array.isArray(left) ? left : [];
    const rightItems = Array.isArray(right) ? right : [];

    return (
      leftItems.length === rightItems.length &&
      leftItems.every((item, index) => item === rightItems[index])
    );
  }

  /*
   * `null` and `undefined` both mean "not set" here: an override writes null for
   * a stat a reader cleared, and the dataset may simply not carry it. Treating
   * those as a change would report an edit nobody made.
   */
  if ((left ?? null) === null && (right ?? null) === null) {
    return true;
  }

  return left === right;
}

/**
 * One override against the dataset character it overrides.
 *
 * `null` when the override changes nothing the reader can see - which happens
 * after they edit a field back to its original value. Showing it would be
 * listing a character as edited when it now matches the dataset exactly.
 */
export function buildCharacterOverrideDiff(
  override: LocalCharacterOverride,
  datasetCharacter: CharacterListItem | null | undefined,
): CharacterOverrideDiff | null {
  const name = override.name?.trim() || datasetCharacter?.name || '';

  if (!datasetCharacter) {
    return {
      characterId: override.characterId,
      name,
      updatedAt: override.updatedAt,
      changes: [],
      datasetMissing: true,
    };
  }

  const comparisons: { field: string; from: unknown; to: unknown }[] = [
    { field: 'name', from: datasetCharacter.name, to: override.name },
    { field: 'type', from: datasetCharacter.type, to: override.type },
    { field: 'classes', from: datasetCharacter.classes, to: override.classes },
    { field: 'stars', from: datasetCharacter.stars, to: override.stars },
    { field: 'cost', from: datasetCharacter.cost, to: override.cost },
    { field: 'combo', from: datasetCharacter.combo, to: override.combo },
    /*
     * The dataset nests its stats as `min`/`max` ranges while an override
     * stores them flat. Reading `stats.minHp` compiles to `undefined` on a
     * looser type and would report every stat as unchanged - the comparison
     * would pass and say nothing.
     */
    { field: 'minHp', from: datasetCharacter.stats?.min?.hp, to: override.minHp },
    { field: 'minAtk', from: datasetCharacter.stats?.min?.atk, to: override.minAtk },
    { field: 'minRcv', from: datasetCharacter.stats?.min?.rcv, to: override.minRcv },
    { field: 'maxHp', from: datasetCharacter.stats?.max?.hp, to: override.maxHp },
    { field: 'maxAtk', from: datasetCharacter.stats?.max?.atk, to: override.maxAtk },
    { field: 'maxRcv', from: datasetCharacter.stats?.max?.rcv, to: override.maxRcv },
    { field: 'growth', from: datasetCharacter.stats?.growth, to: override.growth },
  ];
  const changes = comparisons
    .filter((comparison) => !sameValue(comparison.from, comparison.to))
    .map((comparison) => ({
      field: comparison.field,
      from: formatValue(comparison.from),
      to: formatValue(comparison.to),
    }));

  if (changes.length === 0) {
    return null;
  }

  return {
    characterId: override.characterId,
    name,
    updatedAt: override.updatedAt,
    changes,
    datasetMissing: false,
  };
}

/** Every override that still differs from the dataset, newest edit first. */
export function buildCharacterOverrideDiffs(
  overrides: readonly LocalCharacterOverride[],
  charactersById: ReadonlyMap<number, CharacterListItem>,
): CharacterOverrideDiff[] {
  return overrides
    .map((override) =>
      buildCharacterOverrideDiff(override, charactersById.get(override.characterId)),
    )
    .filter((diff): diff is CharacterOverrideDiff => diff !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
