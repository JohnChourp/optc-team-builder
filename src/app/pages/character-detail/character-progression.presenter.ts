import {
  type CharacterDropSource,
  type CharacterProgression,
} from '../../core/models/optc.models';

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

export interface ProgressionDisplayList {
  labelKey: string;
  items: string[];
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

export function buildEvolutionCard(
  progression: CharacterProgression,
  resolveName: CharacterNameResolver,
): ProgressionDisplayCard | null {
  const lists: ProgressionDisplayList[] = [];

  if (progression.evolvesFrom.length > 0) {
    lists.push({
      labelKey: 'progression.evolvesFrom',
      items: progression.evolvesFrom.map((characterId) => nameOf(characterId, resolveName)),
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
): ProgressionDisplayCard[] {
  if (!progression) {
    return [];
  }

  return [
    buildInvestmentCard(progression),
    buildEvolutionCard(progression, resolveName),
    buildDropSourceCard(progression),
  ].filter((card): card is ProgressionDisplayCard => card !== null);
}
