import {
  AUTO_BUILD_LEADER_BOOST_FILTERS,
  AUTO_TEAM_BUILDER_TYPES,
  createEmptyAutoBuildCostRange,
  createEmptyAutoBuildLeaderBoostRanges,
  createEmptyAutoBuildManualSlots,
  type AutoTeamBuilderType,
} from '../../core/models/auto-team-builder.models';
import { type SavedEnemy } from '../../core/models/optc.models';
import { normalizeBattleRequirementsWithLegacyFallback } from '../../core/services/auto-team-builder-battle.utils';
import { splitManualAbilityRequirementsFromEnemyMechanics } from '../../core/services/enemy-mechanic-draft.utils';
import { expandRequiredAbilitiesToCharacterGroups } from '../../core/services/required-character-groups.utils';
import { type AutoTeamSelectionImportState } from './auto-team-builder-export.utils';

export function buildAutoTeamBuilderStateFromSavedEnemy(
  enemy: SavedEnemy,
): AutoTeamSelectionImportState {
  const availableTypes = new Set<AutoTeamBuilderType>(AUTO_TEAM_BUILDER_TYPES);
  const manualRequiredAbilities = splitManualAbilityRequirementsFromEnemyMechanics(
    enemy.requiredAbilities,
    enemy.enemyMechanics,
  );

  return {
    selectedTypes: enemy.selectedTypes.filter((type): type is AutoTeamBuilderType =>
      availableTypes.has(type as AutoTeamBuilderType),
    ),
    selectedClasses: [...enemy.selectedClasses],
    requiredAbilities: enemy.requiredAbilities.map((requirement) => ({
      ...requirement,
      slotTokens: [...requirement.slotTokens],
    })),
    requiredCharacterGroups: (enemy.requiredCharacterGroups?.length ?? 0)
      ? enemy.requiredCharacterGroups!.map((group) => ({
          id: group.id,
          abilities: group.abilities.map((requirement) => ({
            ...requirement,
            slotTokens: [...requirement.slotTokens],
            requiredCharacterCount: 1,
          })),
        }))
      : expandRequiredAbilitiesToCharacterGroups(enemy.requiredAbilities).groups,
    battleRequirements: normalizeBattleRequirementsWithLegacyFallback({
      battles: enemy.battleRequirements,
      requiredAbilities: manualRequiredAbilities,
      requiredCharacterGroups: enemy.requiredCharacterGroups,
      enemyMechanics: enemy.enemyMechanics,
    }),
    enemyMechanics: enemy.enemyMechanics.map((mechanic) => ({
      ...mechanic,
      triggerTags: [...mechanic.triggerTags],
      responseTags: [...mechanic.responseTags],
      conditionTags: [...mechanic.conditionTags],
    })),
    requireAllSelectedTypesInTeam: enemy.requireAllSelectedTypesInTeam,
    requireAllSelectedClassesPerCharacter: enemy.requireAllSelectedClassesPerCharacter,
    requireAllSlotsInLeaderSuperEffectScope: false,
    requireFullCaptainAbilityCoverage: false,
    requireBothLeadersFullCaptainAbilityCoverage: false,
    requireSuperSpecialCriteriaCoverage: false,
    requireUniqueBaseCharacterNames: false,
    favoritesOnly: false,
    allowAnyFriendCaptainAutoFill: false,
    favoriteShipsOnly: false,
    leaderBoostFilters: [...AUTO_BUILD_LEADER_BOOST_FILTERS],
    leaderBoostRanges: createEmptyAutoBuildLeaderBoostRanges(),
    leaderCostRange: createEmptyAutoBuildCostRange(),
    subCostRange: createEmptyAutoBuildCostRange(),
    maxTotalCost: null,
    manualSlots: createEmptyAutoBuildManualSlots(),
    lockedCharacterIds: [],
    excludedCharacterIds: [],
    selectedLeaderIds: [],
    captainLeaderId: null,
    manualShipId: null,
    excludedShipIds: [],
  };
}
