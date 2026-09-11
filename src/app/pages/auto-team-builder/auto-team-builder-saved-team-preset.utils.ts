import {
  AUTO_BUILD_LEADER_BOOST_FILTERS,
  AUTO_BUILD_MANUAL_SLOT_ROLES,
  createEmptyAutoBuildCostRange,
  createEmptyAutoBuildLeaderBoostRanges,
  createEmptyAutoBuildManualSlots,
} from '../../core/models/auto-team-builder.models';
import {
  type CharacterListItem,
  type SavedTeam,
  type ShipRecord,
} from '../../core/models/optc.models';
import { type AutoTeamSelectionImportState } from './auto-team-builder-export.utils';

/**
 * A saved team carries slots and a ship, nothing else. It carries no type or class filter either,
 * so it opens on the page's neutral selection - every type and class, which the engine treats as no
 * filter. Landing with none selected left Build grey on arrival with the team already locked
 * (869exmkbe).
 */
export function buildAutoTeamBuilderStateFromSavedTeam(
  team: SavedTeam,
  availableCharacters: CharacterListItem[],
  availableShips: ShipRecord[],
  neutralSelection: Pick<AutoTeamSelectionImportState, 'selectedTypes' | 'selectedClasses'>,
): AutoTeamSelectionImportState {
  const availableCharacterIdSet = new Set(availableCharacters.map((character) => character.id));
  const availableShipIdSet = new Set(availableShips.map((ship) => ship.id));
  const manualSlots = createEmptyAutoBuildManualSlots();

  team.slots.forEach((characterId, index) => {
    const slotRole = AUTO_BUILD_MANUAL_SLOT_ROLES[index];

    if (!slotRole || typeof characterId !== 'number' || !availableCharacterIdSet.has(characterId)) {
      return;
    }

    const slot = manualSlots.find((entry) => entry.role === slotRole);

    if (slot) {
      slot.characterIds = [characterId];
    }
  });

  return {
    selectedTypes: [...neutralSelection.selectedTypes],
    selectedClasses: [...neutralSelection.selectedClasses],
    selectedCharacterTags: [],
    selectedCharacterNames: [],
    requiredAbilities: [],
    requiredCharacterGroups: [],
    enemyMechanics: [],
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    requireAllSelectedCharacterTagsInTeam: false,
    requireAllSelectedCharacterNamesInTeam: false,
    requireAllSlotsInLeaderSuperEffectScope: false,
    requireFullCaptainAbilityCoverage: false,
    requireBothLeadersFullCaptainAbilityCoverage: true,
    requireSuperSpecialCriteriaCoverage: true,
    requireSuperTandemCriteriaCoverage: true,
    requireUniqueBaseCharacterNames: false,
    favoritesOnly: false,
    allowAnyFriendCaptainAutoFill: false,
    favoriteShipsOnly: false,
    leaderBoostFilters: [...AUTO_BUILD_LEADER_BOOST_FILTERS],
    leaderBoostRanges: createEmptyAutoBuildLeaderBoostRanges(),
    leaderCostRange: createEmptyAutoBuildCostRange(),
    subCostRange: createEmptyAutoBuildCostRange(),
    maxTotalCost: null,
    manualSlots,
    lockedCharacterIds: [],
    excludedCharacterIds: [],
    selectedLeaderIds: [],
    captainLeaderId: null,
    manualShipId:
      typeof team.shipId === 'number' && availableShipIdSet.has(team.shipId) ? team.shipId : null,
    excludedShipIds: [],
  };
}
