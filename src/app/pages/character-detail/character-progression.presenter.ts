import {
  type CharacterDetailRecord,
  type CharacterDropSource,
  type CharacterProgression,
} from '../../core/models/optc.models';
import { normalizeHtmlToText } from '../../core/services/html-text.utils';

/**
 * 869f1935z. The two questions the builders could never answer, turned into display rows.
 *
 *  - **"I do not own this - where do I get it?"** The builder recommends a unit and stops. The
 *    evolution graph answers it for 2,927 of 4,618 characters, and the useful direction is the
 *    REVERSE one: a player often already owns the base form, which turns a blocker into a task.
 *  - **"What do I invest in this one?"** Socket slots and the special's cooldown range are what a
 *    player plans weeks of farming against.
 *
 * Everything here is a pure function over the progression record plus a name resolver, so it is
 * testable without a TestBed - the page specs in this repo have no DOM and no injector.
 *
 * The one rule that matters more than the layout: **an absent drop source is a SILENCE, not a
 * negative.** `drops.js` covers 1,620 characters, so most units simply have no entry, and the vast
 * majority of those are sugo-only rather than unobtainable. This never renders "not farmable"; it
 * renders nothing, and the section is omitted. A wrong "farm this stage" costs a player real
 * stamina, and a wrong "there is no way to get this" costs them the unit.
 */

export interface ProgressionDisplayRow {
  labelKey: string;
  value: string;
}

/** A translated line under one list item, e.g. "Same Captain Ability · cost 40". */
export interface ProgressionDisplayNote {
  key: string;
  params: Record<string, number>;
}

export interface ProgressionDisplayList {
  labelKey: string;
  items: string[];
  /** Parallel to `items`, present only when at least one item has a note. */
  notes?: Array<ProgressionDisplayNote | null>;
}

export interface ProgressionDisplayCard {
  titleKey: string;
  rows: ProgressionDisplayRow[];
  lists: ProgressionDisplayList[];
}

/** Resolves a character id to a display name; unknown ids come back as null, never as "#123". */
export type CharacterNameResolver = (characterId: number) => string | null;

/** Every character id this progression needs a name for, so the page can fetch them in one query. */
export function collectProgressionCharacterIds(progression: CharacterProgression): number[] {
  const ids = new Set<number>();

  for (const source of progression.evolvesFrom) {
    ids.add(source);
  }

  for (const branch of progression.evolvesTo) {
    ids.add(branch.toId);

    for (const material of branch.materials) {
      if (material.characterId !== null) {
        ids.add(material.characterId);
      }
    }
  }

  return [...ids];
}

function nameOf(characterId: number, resolveName: CharacterNameResolver): string {
  return resolveName(characterId) ?? `#${characterId}`;
}

/**
 * Drop sources collapsed to one line per stage. A character commonly drops from several slots of
 * the same stage - `'1'`, `'2'`, `'3'` of Fushia Village - and listing each slot separately turns
 * three useful stages into fifteen indistinguishable lines.
 */
export function summarizeDropSources(sources: readonly CharacterDropSource[]): string[] {
  const byStage = new Map<string, { group: string; stage: string; global: boolean }>();

  for (const source of sources) {
    const stage = source.stage || source.dropId;
    // A JSON pair rather than a joined string: a group or stage name may contain any separator.
    const key = JSON.stringify([source.group, stage]);
    const existing = byStage.get(key);

    if (existing) {
      // Global availability is per stage, so any global slot makes the stage reachable on global.
      existing.global = existing.global || source.global;
      continue;
    }

    byStage.set(key, { group: source.group, stage, global: source.global });
  }

  return [...byStage.values()].map((entry) =>
    entry.global ? `${entry.stage} (${entry.group})` : `${entry.stage} (${entry.group}, JP only)`,
  );
}

function formatCooldown(progression: CharacterProgression): string | null {
  const { specialCooldownMax, specialCooldownMin } = progression;

  if (specialCooldownMax === null || specialCooldownMin === null) {
    return null;
  }

  // A special that never speeds up reads oddly as "12 - 12"; say the single number instead.
  return specialCooldownMax === specialCooldownMin
    ? `${specialCooldownMax}`
    : `${specialCooldownMax} → ${specialCooldownMin}`;
}

export function buildInvestmentCard(
  progression: CharacterProgression,
): ProgressionDisplayCard | null {
  const rows: ProgressionDisplayRow[] = [];

  /*
   * `0` is a real answer - 239 units genuinely have no socket slot - so this checks for null
   * rather than falsiness. Treating 0 as "unknown" would hide the one fact a player most needs
   * before spending a socket book.
   */
  if (progression.maxSockets !== null) {
    rows.push({ labelKey: 'progression.socketSlots', value: `${progression.maxSockets}` });
  }

  const cooldown = formatCooldown(progression);

  if (cooldown !== null) {
    rows.push({ labelKey: 'progression.specialCooldown', value: cooldown });
  }

  return rows.length > 0 ? { titleKey: 'sections.investment', rows, lists: [] } : null;
}

/**
 * Repeated materials collapsed to `ink ×5`. Upstream lists one entry per copy, so a Rainbow Ink
 * evolution renders as `ink ink ink ink ink` - five lines that say one thing, and a player counting
 * them is doing the work the surface was added to do.
 *
 * Order is preserved: the first appearance keeps its place, so the reading order still matches the
 * upstream list rather than being sorted into something unrecognisable.
 */
export function summarizeMaterials(materials: readonly string[]): string[] {
  const counts = new Map<string, number>();

  for (const material of materials) {
    counts.set(material, (counts.get(material) ?? 0) + 1);
  }

  return [...counts.entries()].map(([material, count]) =>
    count > 1 ? `${material} ×${count}` : material,
  );
}

/** What `resolveCheaperSameCaptainAbilityForms` reads: the cost and the Captain Ability. */
export type CaptainAbilityForm = Pick<CharacterDetailRecord, 'id' | 'cost'> & {
  detail: Pick<CharacterDetailRecord['detail'], 'captainAbility' | 'captainAbilityVariants'>;
};

/**
 * 869f63gn4. The earlier forms that lead exactly as this character does, for less cost.
 *
 * A cost cap is a real constraint, and guides tell players to lead with the UNEVOLVED form of a unit
 * because it keeps the same Captain Ability at a lower cost - Whitebeard #260 leads like #261 for 40
 * cost instead of 55. The evolution chain already names that form; this is what lets it say so.
 *
 * **Identical, never similar.** The Captain Ability text and every variant - key, label and text,
 * in order - after `normalizeHtmlToText`, the normalisation the rest of the app reads captain text
 * through. Anything looser would tell a player to swap in a unit that does not lead the same way.
 * A character with no Captain Ability matches nothing.
 *
 * Measured over the shipped seed on 2026-09-25: 1,572 evolution steps, 296 keep an identical
 * Captain Ability, 285 of them at a lower cost, 11 at the same cost and none at a higher one - so 285
 * Character screens show the mark.
 *
 * Returns earlier form id -> its cost, for the forms that qualify.
 */
export function resolveCheaperSameCaptainAbilityForms(
  character: CaptainAbilityForm,
  earlierForms: readonly CaptainAbilityForm[],
): Map<number, number> {
  const signature = captainAbilitySignature(character);
  const costs = new Map<number, number>();

  if (signature === null) {
    return costs;
  }

  for (const form of earlierForms) {
    if (form.cost < character.cost && captainAbilitySignature(form) === signature) {
      costs.set(form.id, form.cost);
    }
  }

  return costs;
}

function captainAbilitySignature(form: CaptainAbilityForm): string | null {
  const text = normalizeHtmlToText(form.detail.captainAbility);

  if (!text) {
    return null;
  }

  return JSON.stringify([
    text,
    (form.detail.captainAbilityVariants ?? []).map((variant) => [
      variant.key,
      variant.label,
      normalizeHtmlToText(variant.text),
    ]),
  ]);
}

export function buildEvolutionCard(
  progression: CharacterProgression,
  resolveName: CharacterNameResolver,
  sameCaptainAbilityCostById: ReadonlyMap<number, number> = new Map(),
): ProgressionDisplayCard | null {
  const lists: ProgressionDisplayList[] = [];

  if (progression.evolvesFrom.length > 0) {
    // 869f63gn4. An earlier form that leads identically for less cost says so, and gives the cost.
    const notes = progression.evolvesFrom.map((characterId) => {
      const cost = sameCaptainAbilityCostById.get(characterId);

      return cost === undefined ? null : { key: 'progression.sameCaptainAbility', params: { cost } };
    });

    lists.push({
      labelKey: 'progression.evolvesFrom',
      items: progression.evolvesFrom.map((characterId) => nameOf(characterId, resolveName)),
      ...(notes.some((note) => note !== null) ? { notes } : {}),
    });
  }

  for (const branch of progression.evolvesTo) {
    const materials = branch.materials.map((material) =>
      material.characterId !== null
        ? nameOf(material.characterId, resolveName)
        : (material.token ?? ''),
    );

    lists.push({
      labelKey: 'progression.evolvesInto',
      /*
       * The target first, then what it costs. A branch with no materials still gets a line - some
       * evolutions genuinely need none, and an empty list would read as missing data.
       */
      items: [
        nameOf(branch.toId, resolveName),
        ...summarizeMaterials(materials.filter((entry) => entry.length > 0)),
      ],
    });
  }

  return lists.length > 0 ? { titleKey: 'sections.evolution', rows: [], lists } : null;
}

export function buildDropSourceCard(
  progression: CharacterProgression,
): ProgressionDisplayCard | null {
  const stages = summarizeDropSources(progression.dropSources);

  // No entry means nothing is recorded. Rendering an empty card would state the opposite.
  if (stages.length === 0) {
    return null;
  }

  return {
    titleKey: 'sections.dropSources',
    rows: [],
    lists: [{ labelKey: 'progression.dropsFrom', items: stages }],
  };
}

export function buildProgressionCards(
  progression: CharacterProgression | null,
  resolveName: CharacterNameResolver,
  sameCaptainAbilityCostById: ReadonlyMap<number, number> = new Map(),
): ProgressionDisplayCard[] {
  if (!progression) {
    return [];
  }

  return [
    buildInvestmentCard(progression),
    buildEvolutionCard(progression, resolveName, sameCaptainAbilityCostById),
    buildDropSourceCard(progression),
  ].filter((card): card is ProgressionDisplayCard => card !== null);
}
