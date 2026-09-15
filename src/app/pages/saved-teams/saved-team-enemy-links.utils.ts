import { type SavedEnemy } from '../../core/models/optc.models';

/**
 * 869f1327n. Which saved enemies a saved team was built against.
 *
 * The link already existed and ran ONE way: `SavedEnemy.associatedTeamIds` lets a reader open a
 * saved enemy and see the teams they kept for it. From a team there was no way back, so a reader
 * looking at a team they saved three weeks ago could not tell which stage it answers.
 *
 * Derived rather than stored, and that is the whole design. Adding a `savedEnemyIds` field to
 * `SavedTeam` would be a second copy of one relationship, which then needs a migration rule, an
 * export-payload entry, and a repair path for the day the two copies disagree. Reading the
 * existing edge backwards needs none of those: there is one writer, one truth, and a team deleted
 * from an enemy's list stops appearing here the moment that write lands.
 */
export interface SavedTeamEnemyLink {
  enemyId: string;
  enemyName: string;
  updatedAt: string;
}

export function buildSavedTeamEnemyLinkIndex(
  savedEnemies: readonly SavedEnemy[],
): Map<string, SavedTeamEnemyLink[]> {
  const index = new Map<string, SavedTeamEnemyLink[]>();

  for (const enemy of savedEnemies) {
    for (const teamId of enemy.associatedTeamIds ?? []) {
      const normalizedTeamId = typeof teamId === 'string' ? teamId.trim() : '';

      if (!normalizedTeamId.length) {
        continue;
      }

      const links = index.get(normalizedTeamId) ?? [];

      // An enemy can only answer for a team once, however many times its list repeats the id.
      if (links.some((link) => link.enemyId === enemy.id)) {
        continue;
      }

      links.push({
        enemyId: enemy.id,
        enemyName: enemy.name,
        updatedAt: enemy.updatedAt,
      });
      index.set(normalizedTeamId, links);
    }
  }

  /*
   * Most recently updated enemy first. A reader who solved a stage three weeks ago and another one
   * yesterday wants yesterday's at the front, and `updatedAt` is the only ordering the stored data
   * can support honestly - the association itself carries no timestamp of its own.
   */
  for (const links of index.values()) {
    links.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  return index;
}
