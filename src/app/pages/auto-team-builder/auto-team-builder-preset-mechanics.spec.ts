import '@angular/compiler';
import { describe, expect, it } from 'vitest';

import {
  AUTO_TEAM_BUILDER_TYPES,
  createEmptyAutoBuildManualSlots,
} from '../../core/models/auto-team-builder.models';
import {
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityRequirement,
  type AutoBuildBattleRequirement,
  type AutoBuildEnemyMechanicRequirement,
} from '../../core/models/auto-team-builder-ability.models';
import { type SavedEnemy } from '../../core/models/optc.models';
import { DriveSyncStateService } from '../../core/services/drive-sync-state.service';
import {
  deriveAbilityRequirementsFromEnemyMechanics,
  mergeAbilityRequirements,
} from '../../core/services/enemy-mechanic-draft.utils';
import { UserStateService } from '../../core/services/user-state.service';
import {
  buildAutoTeamSelectionExportPayload,
  parseAutoTeamSelectionImportPayload,
  sanitizeAutoTeamSelectionImportPayload,
} from './auto-team-builder-export.utils';

/*
 * 869f6td1y, the Auto Team Builder half. A preset without battles gets battle 1 from its groups,
 * and a preset without groups had them migrated from `requiredAbilities` alone - so a preset that
 * listed only the enemy's own abilities next to its mechanics arrived with battle 1 holding the
 * own abilities and not one requirement the mechanics imply, where the loader gives the same enemy
 * both. That is the shape the app wrote for 34 minutes on 2026-04-30, and the shape anyone writes
 * by hand.
 *
 * Its own file because it compares the preset path with the REAL loader: an in-memory store under
 * UserStateService, the same enemy stored there.
 */

const EXPORTED_AT = '2026-04-20T10:00:00.000Z';

class MemoryPreferences {
  private readonly store: Map<string, string>;

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
}

interface EnemyRequirements {
  requiredAbilities: AutoBuildAbilityRequirement[];
  enemyMechanics: AutoBuildEnemyMechanicRequirement[];
}

function requirement(abilityKey: string): AutoBuildAbilityRequirement {
  return { abilityKey, minTurns: null, slotTokens: [], requiredCharacterCount: 1 };
}

function mechanic(
  mechanicKey: string,
  category: AutoBuildEnemyMechanicRequirement['category'],
  derivedAbilityKey: string | null,
  options: { minTurns?: number; requiredCharacterCount?: number } = {},
): AutoBuildEnemyMechanicRequirement {
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

function catalogItem(key: string): AutoBuildAbilityCatalogItem {
  return {
    key,
    label: key,
    supportsTurns: true,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: [],
    matchCount: 1,
    sampleCharacterIds: [],
    sampleTexts: [],
  };
}

const CATALOG = [
  'apply_delay',
  'remove_bind',
  'remove_enemy_barrier',
  'ignore_normal_attack_only',
  'remove_special_bind',
  'remove_damage_reduction',
  'remove_despair',
  'remove_slot_bind',
  'remove_atk_down',
].map(catalogItem);

const BARRIER_BOSS: EnemyRequirements = {
  requiredAbilities: [requirement('apply_delay')],
  enemyMechanics: [mechanic('enemy_barrier', 'enemyDefense', 'remove_enemy_barrier')],
};

/* The brain's Eustass Kid enemy: one ability of its own and mechanics implying SIX groups. */
const EUSTASS_KID: EnemyRequirements = {
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
};

/* A schema-20 preset: mechanics and abilities, and neither groups nor battles. */
function schema20Preset(enemy: EnemyRequirements) {
  return {
    schemaVersion: 20,
    exportedAt: EXPORTED_AT,
    source: 'auto-team-builder',
    exportType: 'preset',
    filters: {
      selectedTypes: ['STR'],
      selectedClasses: [],
      requiredAbilities: enemy.requiredAbilities,
      enemyMechanics: enemy.enemyMechanics,
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireUniqueBaseCharacterNames: false,
      favoritesOnly: false,
      favoriteCount: 0,
    },
    manualSelection: {
      lockedCharacterIds: [],
      selectedLeaderIds: [],
      captainLeaderId: null,
      friendCaptainLeaderId: null,
      characters: [],
    },
  };
}

function importPreset(file: unknown) {
  return sanitizeAutoTeamSelectionImportPayload(
    parseAutoTeamSelectionImportPayload(JSON.stringify(file)),
    {
      availableTypes: AUTO_TEAM_BUILDER_TYPES,
      availableClasses: [],
      abilityCatalogItems: CATALOG,
      availableLockedCharacters: [],
    },
  );
}

/** The loader's battles for the same enemy: a device whose `savedEnemies` already holds it. */
async function loaderBattles(enemy: EnemyRequirements): Promise<AutoBuildBattleRequirement[]> {
  const preferences = new MemoryPreferences({
    savedEnemies: [
      {
        id: 'enemy-1',
        name: 'Stored enemy',
        notes: '',
        rawEnemyText: '',
        imageDataUrl: null,
        selectedTypes: ['STR'],
        selectedClasses: [],
        requiredAbilities: enemy.requiredAbilities,
        enemyMechanics: enemy.enemyMechanics,
        requireAllSelectedTypesInTeam: false,
        requireAllSelectedClassesPerCharacter: false,
        createdAt: EXPORTED_AT,
        updatedAt: EXPORTED_AT,
      } satisfies SavedEnemy,
    ],
  });
  const i18n = { translate: (key: string) => key };
  const driveSyncState = new DriveSyncStateService(preferences as never);
  const userState = new UserStateService(i18n as never, preferences as never, driveSyncState);

  await userState.readySavedEnemies();

  return userState.savedEnemies()[0]!.battleRequirements ?? [];
}

function battleKeys(battles: readonly AutoBuildBattleRequirement[]): string[][] {
  return battles.map((battle) =>
    battle.requiredCharacterGroups.map((group) =>
      group.abilities.map((ability) => ability.abilityKey).join('+'),
    ),
  );
}

describe('Auto Team Builder preset import keeps the requirements an enemy mechanic implies (869f6td1y)', () => {
  it("builds battle 1 from the preset's own abilities and the ones its mechanics imply, as the loader does", async () => {
    const { state, warnings } = importPreset(schema20Preset(BARRIER_BOSS));

    expect(battleKeys(state.battleRequirements ?? [])).toEqual([
      ['apply_delay', 'remove_enemy_barrier'],
    ]);
    expect(battleKeys(state.battleRequirements ?? [])).toEqual(
      battleKeys(await loaderBattles(BARRIER_BOSS)),
    );
    expect(warnings).toEqual([]);
  });

  it("keeps the preset's own ability when the mechanics fill the six groups, and says one was cut", async () => {
    const { state, warnings } = importPreset(schema20Preset(EUSTASS_KID));
    const expected = [
      'ignore_normal_attack_only',
      'remove_special_bind',
      'remove_special_bind',
      'remove_damage_reduction',
      'remove_despair',
      'remove_slot_bind',
    ];

    expect(battleKeys(state.battleRequirements ?? [])).toEqual([expected]);
    expect(battleKeys(await loaderBattles(EUSTASS_KID))).toEqual([expected]);
    expect(warnings).toEqual([{ key: 'preset.warnings.adjustedAbilities', params: { count: 1 } }]);
  });

  it("does not count a mechanic's ability twice when the preset already lists it", async () => {
    // What the app itself wrote until 2026-04-30 19:46: the mechanics' abilities merged in front.
    const { state } = importPreset(
      schema20Preset({
        ...BARRIER_BOSS,
        requiredAbilities: mergeAbilityRequirements([
          ...deriveAbilityRequirementsFromEnemyMechanics(BARRIER_BOSS.enemyMechanics),
          ...BARRIER_BOSS.requiredAbilities,
        ]),
      }),
    );

    expect(battleKeys(state.battleRequirements ?? [])).toEqual(
      battleKeys(await loaderBattles(BARRIER_BOSS)),
    );
  });

  it('applies a preset that carries its own battles exactly as the file has them, with no new warning', async () => {
    // A preset the app writes today: its battles, and `requiredAbilities` flattened from them.
    const battles = await loaderBattles(EUSTASS_KID);
    const { state, warnings } = importPreset(
      buildAutoTeamSelectionExportPayload({
        selectedTypes: ['STR'],
        selectedClasses: [],
        requiredAbilities: battles.flatMap((battle) =>
          battle.requiredCharacterGroups.flatMap((group) => group.abilities),
        ),
        battleRequirements: battles,
        enemyMechanics: EUSTASS_KID.enemyMechanics,
        requireAllSelectedTypesInTeam: false,
        requireAllSelectedClassesPerCharacter: false,
        requireAllSlotsInLeaderSuperEffectScope: false,
        requireUniqueBaseCharacterNames: true,
        favoritesOnly: false,
        favoriteCount: 0,
        manualSlots: createEmptyAutoBuildManualSlots(),
        lockedCharacterIds: [],
        lockedCharacters: [],
        selectedLeaderIds: [],
        captainLeaderId: null,
        friendCaptainLeaderId: null,
        exportedAt: EXPORTED_AT,
      }),
    );

    expect(battleKeys(state.battleRequirements ?? [])).toEqual(battleKeys(battles));
    expect(warnings).toEqual([]);
  });

  it('leaves a preset with only its own abilities, or only mechanics, as it always was', async () => {
    const ownOnly: EnemyRequirements = {
      requiredAbilities: [requirement('apply_delay'), requirement('remove_bind')],
      enemyMechanics: [],
    };
    const mechanicsOnly: EnemyRequirements = { ...BARRIER_BOSS, requiredAbilities: [] };

    expect(
      battleKeys(importPreset(schema20Preset(ownOnly)).state.battleRequirements ?? []),
    ).toEqual([['apply_delay', 'remove_bind']]);
    expect(
      battleKeys(importPreset(schema20Preset(mechanicsOnly)).state.battleRequirements ?? []),
    ).toEqual([['remove_enemy_barrier']]);
    expect(battleKeys(await loaderBattles(ownOnly))).toEqual([['apply_delay', 'remove_bind']]);
  });
});
