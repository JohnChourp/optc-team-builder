import {
  AUTO_BUILD_MANUAL_SLOT_ROLES,
  createEmptyAutoBuildManualSlots,
} from "../../core/models/auto-team-builder.models";
import {
  type CharacterListItem,
  type SavedTeam,
  type ShipRecord,
} from "../../core/models/optc.models";
import { type AutoTeamSelectionImportState } from "./auto-team-builder-export.utils";

export function buildAutoTeamBuilderStateFromSavedTeam(
  team: SavedTeam,
  availableCharacters: CharacterListItem[],
  availableShips: ShipRecord[],
): AutoTeamSelectionImportState {
  const availableCharacterIdSet = new Set(availableCharacters.map((character) => character.id));
  const availableShipIdSet = new Set(availableShips.map((ship) => ship.id));
  const manualSlots = createEmptyAutoBuildManualSlots();

  team.slots.forEach((characterId, index) => {
    const slotRole = AUTO_BUILD_MANUAL_SLOT_ROLES[index];

    if (
      !slotRole ||
      typeof characterId !== "number" ||
      !availableCharacterIdSet.has(characterId)
    ) {
      return;
    }

    const slot = manualSlots.find((entry) => entry.role === slotRole);

    if (slot) {
      slot.characterIds = [characterId];
    }
  });

  return {
    selectedTypes: [],
    selectedClasses: [],
    requiredAbilities: [],
    enemyMechanics: [],
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    requireLeaderSuperSpecialCriteria: true,
    requireUniqueBaseCharacterNames: false,
    favoritesOnly: false,
    favoriteShipsOnly: false,
    manualSlots,
    lockedCharacterIds: [],
    excludedCharacterIds: [],
    selectedLeaderIds: [],
    captainLeaderId: null,
    manualShipId:
      typeof team.shipId === "number" && availableShipIdSet.has(team.shipId) ? team.shipId : null,
    excludedShipIds: [],
  };
}
