import '@angular/compiler';
import { describe, expect, it } from 'vitest';

import { type SavedEnemy } from '../../core/models/optc.models';
import { normalizeBattleRequirementsWithLegacyFallback } from '../../core/services/auto-team-builder-battle.utils';
import { CharacterOverridesService } from '../../core/services/character-overrides.service';
import { DriveSyncStateService } from '../../core/services/drive-sync-state.service';
import { appendAbilityRequirementsFromEnemyMechanics } from '../../core/services/enemy-mechanic-draft.utils';
import { OptcbxImportService } from '../../core/services/optcbx-import.service';
import { expandRequiredAbilitiesToCharacterGroups } from '../../core/services/required-character-groups.utils';
import { UserDataTransferService } from '../../core/services/user-data-transfer.service';
import { UserStateService } from '../../core/services/user-state.service';

/*
 * 869f6td1y. An imported enemy must carry the requirements its mechanics imply, exactly as the
 * same record does when it is read from storage.
 *
 * 869f1935z taught the loader to expand the mechanics into required groups. The import path never
 * learned it: the sanitizer built the groups from the manual abilities alone, `mergeImportedEnemies`
 * then found groups and kept them, and a stored enemy's groups are never derived again - so an
 * April-2026 file, a single-enemy file, or the brain's own agent-drafted Eustass Kid file was
 * stored without its mechanic requirements for good, through a Settings import, an all-data import
 * and a Drive sync alike.
 *
 * Its own file because it runs the REAL UserStateService and UserDataTransferService over an
 * in-memory store: the defect lived between the sanitizer and the loader, where neither suite of
 * its own could see it.
 */

const EXPORTED_AT = '2026-04-20T10:00:00.000Z';

class MemoryPreferences {
  public readonly store: Map<string, string>;

  public constructor(initial: Record<string, unknown>) {
    this.store = new Map(
      Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)] as const),
    );
  }

  public async get({ key }: { key: string }): Promise<{ value: string | null }> {
    return { value: this.store.get(key) ?? null };
  }

  public async set({ key, value }: { key: string; value: string }): Promise<void> {
    this.store.set(key, value);
  }

  public read<T>(key: string): T {
    return JSON.parse(this.store.get(key) ?? 'null') as T;
  }
}

function createDevice(stored: Record<string, unknown> = {}) {
  const preferences = new MemoryPreferences(stored);
  const repository = {
    getCharactersByIds: async (ids: number[]) =>
      ids.map((id) => ({ id, name: `Character ${id}`, number: id })),
    getShips: async () => [],
  };
  const i18n = { translate: (key: string) => key };
  const driveSyncState = new DriveSyncStateService(preferences as never);
  const userState = new UserStateService(i18n as never, preferences as never, driveSyncState);
  const transfer = new UserDataTransferService(
    repository as never,
    i18n as never,
    userState,
    new CharacterOverridesService(preferences as never, driveSyncState),
    new OptcbxImportService(repository as never),
  );

  return { preferences, transfer, userState };
}

/** What storage makes of a record: a device whose `savedEnemies` already holds it. */
async function hydrate(record: SavedEnemy): Promise<SavedEnemy> {
  const { userState } = createDevice({ savedEnemies: [record] });

  await userState.readySavedEnemies();

  return userState.savedEnemies()[0]!;
}

function groupKeys(groups: SavedEnemy['requiredCharacterGroups']): string[] {
  return (groups ?? []).map((group) =>
    group.abilities.map((ability) => ability.abilityKey).join('+'),
  );
}

function battleGroupKeys(enemy: SavedEnemy): string[][] {
  return (enemy.battleRequirements ?? []).map((battle) =>
    groupKeys(battle.requiredCharacterGroups),
  );
}

function requirement(abilityKey: string, minTurns: number | null = null) {
  return { abilityKey, minTurns, slotTokens: [], requiredCharacterCount: 1 };
}

function mechanic(
  mechanicKey: string,
  category: SavedEnemy['enemyMechanics'][number]['category'],
  derivedAbilityKey: string | null,
  options: { minTurns?: number | null; requiredCharacterCount?: number } = {},
): SavedEnemy['enemyMechanics'][number] {
  return {
    mechanicKey,
    category,
    minTurns: options.minTurns ?? null,
    ...(options.requiredCharacterCount
      ? { requiredCharacterCount: options.requiredCharacterCount }
      : {}),
    triggerTags: [],
    responseTags: [],
    conditionTags: [],
    derivedAbilityKey,
  };
}

/* The shape the app exported between 2026-04-04 (mechanics) and 2026-04-30 (groups and battles). */
function aprilEnemy(overrides: Partial<SavedEnemy> = {}): SavedEnemy {
  return {
    id: 'enemy-april',
    name: 'Barrier boss',
    notes: '',
    rawEnemyText: '',
    imageDataUrl: null,
    selectedTypes: [],
    selectedClasses: [],
    requiredAbilities: [requirement('delay')],
    enemyMechanics: [mechanic('enemy_barrier', 'enemyDefense', 'remove_enemy_barrier')],
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    createdAt: EXPORTED_AT,
    updatedAt: EXPORTED_AT,
    ...overrides,
  };
}

function savedEnemiesFile(enemies: SavedEnemy[]) {
  return { schemaVersion: 1, source: 'saved-enemies', exportedAt: EXPORTED_AT, enemies };
}

/*
 * The brain's `.codex/tmp/eustass-kid-whole-quest.enemy.json`, minus its notes: one manual ability
 * and seven mechanics, five of which imply SIX groups between them.
 */
function eustassKidFile() {
  return {
    schemaVersion: 1,
    source: 'optc-enemy-skill',
    exportType: 'enemy',
    enemy: {
      name: 'Eustass "Captain" Kid Whole Quest',
      selectedTypes: ['DEX', 'INT', 'PSY', 'QCK', 'STR'],
      selectedClasses: ['Cerebral'],
      requiredAbilities: [requirement('ignore_normal_attack_only')],
      enemyMechanics: [
        mechanic('orb_block', 'orbControl', null),
        mechanic('crew_special_bind', 'crewDebuff', 'remove_special_bind', {
          minTurns: 99,
          requiredCharacterCount: 2,
        }),
        mechanic('enemy_immunity', 'enemyDefense', null),
        mechanic('enemy_percent_damage_reduction', 'enemyDefense', 'remove_damage_reduction'),
        mechanic('crew_despair', 'crewDebuff', 'remove_despair', { minTurns: 7 }),
        mechanic('orb_slot_bind', 'orbControl', 'remove_slot_bind', { minTurns: 1 }),
        mechanic('crew_atk_down', 'crewDebuff', 'remove_atk_down'),
      ],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
    },
  };
}

describe('Saved Enemies import keeps the requirements an enemy mechanic implies (869f6td1y)', () => {
  it('imports an April-2026 file with the groups storage derives for the same record', async () => {
    const { preferences, transfer, userState } = createDevice();

    const summary = await transfer.importSavedEnemiesPayload(savedEnemiesFile([aprilEnemy()]));
    const imported = userState.savedEnemies()[0]!;
    const hydrated = await hydrate(aprilEnemy());

    expect(summary).toMatchObject({ addedCount: 1, updatedCount: 0 });
    expect(groupKeys(hydrated.requiredCharacterGroups)).toEqual(['delay', 'remove_enemy_barrier']);
    expect(groupKeys(imported.requiredCharacterGroups)).toEqual(
      groupKeys(hydrated.requiredCharacterGroups),
    );
    expect(battleGroupKeys(imported)).toEqual([['delay', 'remove_enemy_barrier']]);
    expect(battleGroupKeys(imported)).toEqual(battleGroupKeys(hydrated));
    expect(
      groupKeys(preferences.read<SavedEnemy[]>('savedEnemies')[0]!.requiredCharacterGroups),
    ).toEqual(['delay', 'remove_enemy_barrier']);
  });

  it('imports a single-enemy file with the groups its mechanics imply', async () => {
    const { transfer, userState } = createDevice();
    const bindMechanic = mechanic('crew_special_bind', 'crewDebuff', 'remove_special_bind', {
      minTurns: 5,
    });

    await transfer.importSavedEnemiesPayload({
      schemaVersion: 1,
      source: 'optc-enemy-skill',
      exportType: 'enemy',
      enemy: {
        name: 'Bind boss',
        requiredAbilities: [requirement('ignore_normal_attack_only')],
        enemyMechanics: [bindMechanic],
      },
    });
    const imported = userState.savedEnemies()[0]!;
    const hydrated = await hydrate(
      aprilEnemy({
        id: imported.id,
        name: 'Bind boss',
        requiredAbilities: [requirement('ignore_normal_attack_only')],
        enemyMechanics: [bindMechanic],
      }),
    );

    expect(groupKeys(imported.requiredCharacterGroups)).toEqual([
      'ignore_normal_attack_only',
      'remove_special_bind',
    ]);
    expect(groupKeys(imported.requiredCharacterGroups)).toEqual(
      groupKeys(hydrated.requiredCharacterGroups),
    );
    expect(battleGroupKeys(imported)).toEqual(battleGroupKeys(hydrated));
  });

  it("keeps the file's own ability when its mechanics alone fill the six groups", async () => {
    const { transfer, userState } = createDevice();
    const file = eustassKidFile();

    await transfer.importSavedEnemiesPayload(file);
    const imported = userState.savedEnemies()[0]!;
    const hydrated = await hydrate(
      aprilEnemy({
        id: imported.id,
        requiredAbilities: file.enemy.requiredAbilities,
        enemyMechanics: file.enemy.enemyMechanics,
      }),
    );
    const expected = [
      'ignore_normal_attack_only',
      'remove_special_bind',
      'remove_special_bind',
      'remove_damage_reduction',
      'remove_despair',
      'remove_slot_bind',
    ];

    // Seven groups are implied and six fit: the one the cap cuts is a mechanic's, never the file's.
    expect(
      expandRequiredAbilitiesToCharacterGroups(
        appendAbilityRequirementsFromEnemyMechanics(
          file.enemy.requiredAbilities,
          file.enemy.enemyMechanics,
        ),
      ).truncatedCount,
    ).toBe(1);
    expect(groupKeys(imported.requiredCharacterGroups)).toEqual(expected);
    expect(groupKeys(hydrated.requiredCharacterGroups)).toEqual(expected);
    expect(battleGroupKeys(imported)).toEqual([expected]);
    expect(battleGroupKeys(hydrated)).toEqual([expected]);
  });

  it('still has those groups after the app restarts', async () => {
    const first = createDevice();

    await first.transfer.importSavedEnemiesPayload(savedEnemiesFile([aprilEnemy()]));

    const restarted = createDevice({
      savedEnemies: first.preferences.read<SavedEnemy[]>('savedEnemies'),
    });

    await restarted.userState.readySavedEnemies();

    const enemy = restarted.userState.savedEnemies()[0]!;

    expect(groupKeys(enemy.requiredCharacterGroups)).toEqual(['delay', 'remove_enemy_barrier']);
    expect(battleGroupKeys(enemy)).toEqual([['delay', 'remove_enemy_barrier']]);
  });

  it('repairs an enemy an older build stored without them when the same file is imported again', async () => {
    // What the old import stored: groups and a battle built from the manual ability alone.
    const storedByOldImport = aprilEnemy({
      requiredCharacterGroups: [{ id: 'group-1', abilities: [requirement('delay')] }],
      battleRequirements: [
        {
          id: 'battle-1',
          title: 'Battle 1',
          enemyMechanics: [mechanic('enemy_barrier', 'enemyDefense', 'remove_enemy_barrier')],
          requiredCharacterGroups: [{ id: 'group-1', abilities: [requirement('delay')] }],
        },
      ],
    });
    const { transfer, userState } = createDevice({ savedEnemies: [storedByOldImport] });

    await userState.readySavedEnemies();

    // Stored groups are the reader's arrangement, so loading does not rebuild them: no migration.
    expect(groupKeys(userState.savedEnemies()[0]!.requiredCharacterGroups)).toEqual(['delay']);

    const summary = await transfer.importSavedEnemiesPayload(savedEnemiesFile([aprilEnemy()]));
    const repaired = userState.savedEnemies()[0]!;

    expect(summary).toMatchObject({ addedCount: 0, updatedCount: 1 });
    expect(groupKeys(repaired.requiredCharacterGroups)).toEqual(['delay', 'remove_enemy_barrier']);
    expect(battleGroupKeys(repaired)).toEqual([['delay', 'remove_enemy_barrier']]);
  });

  it('leaves the groups and battles a file does carry exactly as the file has them', async () => {
    const { transfer, userState } = createDevice();

    await transfer.importSavedEnemiesPayload(
      savedEnemiesFile([
        aprilEnemy({
          requiredCharacterGroups: [{ id: 'group-own', abilities: [requirement('remove_bind')] }],
          battleRequirements: [
            {
              id: 'battle-own',
              title: 'Final stage',
              enemyMechanics: [],
              requiredCharacterGroups: [
                { id: 'group-own', abilities: [requirement('remove_bind')] },
              ],
            },
          ],
        }),
      ]),
    );
    const imported = userState.savedEnemies()[0]!;

    expect(groupKeys(imported.requiredCharacterGroups)).toEqual(['remove_bind']);
    expect(imported.battleRequirements?.map((battle) => battle.title)).toEqual(['Final stage']);
    expect(battleGroupKeys(imported)).toEqual([['remove_bind']]);
  });

  it("puts the reader's own ability first in the loader, a synthesised battle and the shared list", async () => {
    const manual = [requirement('ignore_normal_attack_only')];
    const mechanics = [mechanic('crew_paralysis', 'crewDebuff', 'remove_paralysis')];
    const [battle] = normalizeBattleRequirementsWithLegacyFallback({
      requiredAbilities: manual,
      enemyMechanics: mechanics,
    });
    const hydrated = await hydrate(
      aprilEnemy({ requiredAbilities: manual, enemyMechanics: mechanics }),
    );

    expect(
      appendAbilityRequirementsFromEnemyMechanics(manual, mechanics).map(
        (entry) => entry.abilityKey,
      ),
    ).toEqual(['ignore_normal_attack_only', 'remove_paralysis']);
    expect(groupKeys(battle?.requiredCharacterGroups)).toEqual([
      'ignore_normal_attack_only',
      'remove_paralysis',
    ]);
    expect(groupKeys(hydrated.requiredCharacterGroups)).toEqual([
      'ignore_normal_attack_only',
      'remove_paralysis',
    ]);
  });
});
