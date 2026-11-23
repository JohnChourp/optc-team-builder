import {
  combine,
  matchSupportTarget,
  normalizeSupportName,
  parseSupportTarget,
  type SupportTarget,
} from '../../core/grammar/support-target';
import { type CharacterDetailRecord } from '../../core/models/optc.models';
import { resolveCharacterSameCharacterKeys } from '../../core/services/character-party-conflict-keys.utils';
import { normalizeHtmlToText } from '../../core/services/html-text.utils';

/**
 * 869f63gy0. The Character screen's support finder: who can support this character, and who this
 * character can support - every support's "Supported characters" sentence read by
 * `support-target.ts`. Eligibility only, never a ranking: lists keep the catalogue's id order.
 */

export interface SupportFinderCharacter {
  id: number;
  name: string;
}

export interface SupportFinderMatches {
  yes: SupportFinderCharacter[];
  undetermined: SupportFinderCharacter[];
}

/** One support of the character on screen, and who it fits. */
export interface SupportFinderGiven extends SupportFinderMatches {
  index: number;
  sentence: string;
}

export interface SupportFinderResult {
  /** Supports - of the whole catalogue, or of the chosen box - that fit this character. */
  receives: SupportFinderMatches;
  /** Empty when the character has no support of its own. */
  gives: SupportFinderGiven[];
}

/**
 * `scope` is the chosen box's character ids, or null for the whole catalogue. It narrows both
 * sides: the supports that can attach to this character, and the characters its supports fit.
 */
export function buildSupportFinder(
  character: CharacterDetailRecord,
  catalog: readonly CharacterDetailRecord[],
  scope: ReadonlySet<number> | null,
): SupportFinderResult {
  const knownFamilies = new Set(
    catalog.flatMap((record) => record.families ?? []).map(normalizeSupportName),
  );
  const targets = new Map<string, SupportTarget>();
  const read = (text: string): SupportTarget => {
    let target = targets.get(text);

    if (!target) {
      target = parseSupportTarget(normalizeHtmlToText(text));
      targets.set(text, target);
    }

    return target;
  };
  const inScope = catalog
    .filter((record) => !scope || scope.has(record.id))
    .sort((left, right) => left.id - right.id);
  const receives: SupportFinderMatches = { yes: [], undetermined: [] };
  const onScreen = withNameFamily(character);

  for (const support of inScope) {
    if (support.id === character.id) {
      continue;
    }

    // A unit with several supports fits when any one of them does.
    const result = combine(
      (support.detail.supportData ?? []).map((entry) =>
        matchSupportTarget(read(entry.supportedCharactersText), onScreen, knownFamilies),
      ),
    );

    if (result !== 'no') {
      receives[result].push(toCharacter(support));
    }
  }

  const gives = (character.detail.supportData ?? []).map((entry, index) => {
    const target = read(entry.supportedCharactersText);
    const given: SupportFinderGiven = {
      index,
      sentence: normalizeHtmlToText(entry.supportedCharactersText),
      yes: [],
      undetermined: [],
    };

    for (const candidate of inScope) {
      if (candidate.id === character.id) {
        continue;
      }

      const result = matchSupportTarget(target, withNameFamily(candidate), knownFamilies);

      if (result !== 'no') {
        given[result].push(toCharacter(candidate));
      }
    }

    return given;
  });

  return { receives, gives };
}

/**
 * A unit upstream names no family for (82 on the shipped seed: fodder, evolution material and the
 * Luffy cards #4130 and #4131) is named by the app's one same-character rule instead, which reads
 * the card name: "Monkey D. Luffy - Warrior in White Going Wild" is Monkey D. Luffy, and a Robber
 * Penguin is no listed character rather than "cannot tell".
 */
function withNameFamily(record: CharacterDetailRecord): CharacterDetailRecord {
  return record.families?.length
    ? record
    : { ...record, families: resolveCharacterSameCharacterKeys(record) };
}

function toCharacter(record: CharacterDetailRecord): SupportFinderCharacter {
  return { id: record.id, name: record.name };
}
