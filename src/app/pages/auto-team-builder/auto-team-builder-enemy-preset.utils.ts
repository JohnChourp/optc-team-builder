import {
  AUTO_TEAM_BUILDER_TYPES,
  createEmptyAutoBuildManualSlots,
  type AutoTeamBuilderType,
} from "../../core/models/auto-team-builder.models";
import { type SavedEnemy } from "../../core/models/optc.models";
import { type AutoTeamSelectionImportState } from "./auto-team-builder-export.utils";

export function buildAutoTeamBuilderStateFromSavedEnemy(
  enemy: SavedEnemy,
): AutoTeamSelectionImportState {
  const availableTypes = new Set<AutoTeamBuilderType>(AUTO_TEAM_BUILDER_TYPES);

  return {
    selectedTypes: enemy.selectedTypes.filter((type): type is AutoTeamBuilderType =>
      availableTypes.has(type as AutoTeamBuilderType),
    ),
    selectedClasses: [...enemy.selectedClasses],
    requiredAbilities: enemy.requiredAbilities.map((requirement) => ({
      ...requirement,
      slotTokens: [...requirement.slotTokens],
    })),
    enemyMechanics: enemy.enemyMechanics.map((mechanic) => ({
      ...mechanic,
      triggerTags: [...mechanic.triggerTags],
      responseTags: [...mechanic.responseTags],
      conditionTags: [...mechanic.conditionTags],
    })),
    requireAllSelectedTypesInTeam: enemy.requireAllSelectedTypesInTeam,
    requireAllSelectedClassesPerCharacter: enemy.requireAllSelectedClassesPerCharacter,
    requireAllSpecialsSupportTeam: enemy.requireAllSpecialsSupportTeam,
    requireLeaderSuperSpecialCriteria: true,
    requireUniqueBaseCharacterNames: false,
    requireSameCaptainAndFriendCaptain: false,
    favoritesOnly: false,
    favoriteShipsOnly: false,
    manualSlots: createEmptyAutoBuildManualSlots(),
    lockedCharacterIds: [],
    excludedCharacterIds: [],
    selectedLeaderIds: [],
    captainLeaderId: null,
    manualShipId: null,
    excludedShipIds: [],
  };
}
