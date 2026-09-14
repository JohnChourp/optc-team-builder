import { type AutoBuildResult, type AutoBuildSlot } from '../../core/models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../../core/models/optc.models';

/**
 * 869f1k0zv. The built team, parked so a reload does not throw it away.
 *
 * 869f12xbc measured this on a 375x812 viewport: a completed Auto Team Build wrote **zero bytes**
 * of storage, so the result did not survive a plain `location.reload()` - never mind a phone
 * killing a backgrounded tab. The page came back reading "ready to build" with the report gone,
 * which is the failure that makes someone stop using a companion app mid-run.
 *
 * Three decisions are load-bearing, and each was made against something measured.
 *
 * **The characters are stored as ids, not as records.** A six-slot result embeds six
 * `CharacterDetailRecord`s, and their detail payloads alone average 26 KB and reach 140 KB
 * (measured over all 4,618 rows of the shipped dataset). Everything else in an `AutoBuildResult` -
 * the coverage summary, the relaxation summary, the reason chips, the slot explanations - is ids,
 * codes and short labels. So the ids go in and the records are re-read on restore, which keeps a
 * recomputable cache small.
 *
 * **That also stops it going stale.** Character data moves at every dataset release. A stored
 * record would hand the reader a team whose stats quietly disagree with the rest of the app, and
 * nothing on screen would explain it. Re-reading by id means the restored team always shows what
 * this build of the dataset says.
 *
 * **A missing id abandons the whole snapshot.** If the dataset no longer has one of the six, the
 * restore returns `null` rather than a five-member team: a team the builder never produced is
 * worse than no team, because it looks like a result.
 *
 * This is deliberately NOT the preset apply path. `auto-team-builder-selection-state.utils.ts`
 * explains why the built team was kept out of the session selection state - that path is async,
 * repository-backed, and raises reader-visible warnings plus a preset-name banner. Restoring a
 * *result* replays none of it: no preset is named, no warning is raised, and nothing is re-searched.
 */

/**
 * Preferences-backed, not session: the point is surviving a tab the OS has killed.
 *
 * camelCase with no separators is the preferences convention - the dotted `optc.` spelling
 * belongs to the session keys, and `check-browser-storage-keys.mjs` rejects it here. The trailing
 * `V1` is the version, because the snapshot shape can change and a stale shape must be dropped
 * rather than half-read.
 */
export const AUTO_TEAM_BUILDER_RESULT_KEY = 'autoTeamBuilderResultV1';

/** A slot with its character reduced to an id. */
export type AutoTeamBuilderSnapshotSlot = Omit<AutoBuildSlot, 'character'> & {
  characterId: number;
};

export type AutoTeamBuilderSnapshotResult = Omit<AutoBuildResult, 'slots'> & {
  slots: AutoTeamBuilderSnapshotSlot[];
};

export interface AutoTeamBuilderResultSnapshot {
  version: 1;
  savedAt: string;
  result: AutoTeamBuilderSnapshotResult;
}

const SNAPSHOT_VERSION = 1;

export function buildAutoTeamBuilderResultSnapshot(
  result: AutoBuildResult,
  savedAt: string = new Date().toISOString(),
): AutoTeamBuilderResultSnapshot {
  const { slots, ...rest } = result;

  return {
    version: SNAPSHOT_VERSION,
    savedAt,
    result: {
      ...rest,
      slots: slots.map(({ character, ...slot }) => ({ ...slot, characterId: character.id })),
    },
  };
}

/**
 * Returns `null` for anything that is not a snapshot this build wrote. A shape that changed is a
 * `.v1` bump, never a best-effort read: half a restored result is indistinguishable from a real
 * one on screen.
 */
export function parseAutoTeamBuilderResultSnapshot(
  value: unknown,
): AutoTeamBuilderResultSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (record['version'] !== SNAPSHOT_VERSION || typeof record['savedAt'] !== 'string') {
    return null;
  }

  const result = record['result'];

  if (!result || typeof result !== 'object') {
    return null;
  }

  const slots = (result as Record<string, unknown>)['slots'];

  if (!Array.isArray(slots) || slots.length === 0) {
    return null;
  }

  const everySlotUsable = slots.every((slot) => {
    if (!slot || typeof slot !== 'object') {
      return false;
    }

    const candidate = slot as Record<string, unknown>;

    return (
      typeof candidate['characterId'] === 'number' &&
      Number.isFinite(candidate['characterId']) &&
      typeof candidate['role'] === 'string'
    );
  });

  return everySlotUsable ? (value as AutoTeamBuilderResultSnapshot) : null;
}

/** Every character the snapshot needs before it can be shown, in slot order and deduplicated. */
export function snapshotCharacterIds(snapshot: AutoTeamBuilderResultSnapshot): number[] {
  return [...new Set(snapshot.result.slots.map((slot) => slot.characterId))];
}

/**
 * Reassembles the result, or returns `null` when the dataset can no longer supply every slot.
 *
 * The same character may legally hold both leader seats, so one record can fill more than one
 * slot - the lookup is by id per slot rather than a zip of two lists.
 */
export function restoreAutoTeamBuilderResult(
  snapshot: AutoTeamBuilderResultSnapshot,
  charactersById: ReadonlyMap<number, CharacterDetailRecord>,
): AutoBuildResult | null {
  const slots: AutoBuildSlot[] = [];

  for (const { characterId, ...slot } of snapshot.result.slots) {
    const character = charactersById.get(characterId);

    if (!character) {
      return null;
    }

    slots.push({ ...slot, character });
  }

  return { ...snapshot.result, slots } as AutoBuildResult;
}
