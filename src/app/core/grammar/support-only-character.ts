/**
 * 869f6td4p. Support-only characters: units that can ONLY be placed in a Support slot.
 *
 * The official Global letter of 2026-04-16 (https://optc-ww.channel.or.jp/news/2045/) announced
 * characters that "do not have any Specials, Captain Abilities, Co-Op Captain Abilities, or Pirate
 * Rumble Combat Stats" and can only be added to the Support slot. The dataset states the same thing
 * without saying it: support data, and no Captain Ability and no special. Six units matched on
 * 2026-09-24 (Demalo Black, Monkey D. Dragon, St. Figarland Garling, Blade, Biblo, Ange); the count
 * the shipped dataset holds today is `supportOnlyCharacters` in
 * `src/app/core/data/dataset-measurements.json`, measured with this very function.
 *
 * Nothing in the app treated them differently, so the Manual Team Builder, Captain Coverage and the
 * Auto Team Builder's manual picks all let one into a crew slot. Every crew slot refuses them now -
 * Captain, Friend Captain and the four subs alike, since a unit with no Captain Ability cannot lead
 * either - and every screen that refuses one says why. They are MARKED, never hidden: the catalogue
 * still lists them and the Character screen says what they are for.
 *
 * The Auto Team Builder never picked one by itself, before or after (its candidate pool keeps only
 * units with Captain, special or sailor text, and these have none) - measured on 11 of 11 real runs.
 *
 * It keeps the three constraints `captain-boost-grammar.ts` documents (import-free, erasable syntax
 * only, the `package.json` beside it), so `scripts/lib/dataset-measurements.mjs` counts the census
 * with this function rather than a copy of it, and the two can never disagree about what the number
 * means.
 */

interface SupportOnlyCaptainVariant {
  text?: string | null;
}

/** The fields the rule reads. A dataset detail, a Local edit's detail and the raw seed JSON all fit. */
export interface SupportOnlyDetailSource {
  captainAbility?: string | null;
  captainAbilityVariants?: ReadonlyArray<SupportOnlyCaptainVariant | null> | null;
  specialText?: string | null;
  supportData?: readonly unknown[] | null;
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isSupportOnlyCharacterDetail(
  detail: SupportOnlyDetailSource | null | undefined,
): boolean {
  if (!detail || !Array.isArray(detail.supportData) || detail.supportData.length === 0) {
    return false;
  }

  const hasCaptainAbility =
    hasText(detail.captainAbility) ||
    (detail.captainAbilityVariants ?? []).some((variant) => hasText(variant?.text));

  return !hasCaptainAbility && !hasText(detail.specialText);
}

/**
 * Whether a character is Support-only. A record without its detail - a list item - answers `false`:
 * the rule cannot be read from it, and every surface that refuses one holds the detail. Typed as any
 * object for that reason, so a list item can be asked without a cast.
 */
export function isSupportOnlyCharacter(character: object | null | undefined): boolean {
  if (!character || !('detail' in character)) {
    return false;
  }

  return isSupportOnlyCharacterDetail(
    (character as { detail?: SupportOnlyDetailSource | null }).detail,
  );
}
