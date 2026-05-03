import {
  normalizeAbilityRequirementSourceScope,
  type AutoBuildAbilityRequirement,
  type AutoBuildBattleRequirement,
  type AutoBuildEnemyMechanicRequirement,
  type AutoBuildRequiredCharacterGroup,
} from '../models/auto-team-builder-ability.models';
import {
  deriveAbilityRequirementsFromEnemyMechanics,
  normalizeEnemyMechanicRequirements,
} from './enemy-mechanic-draft.utils';
import {
  cloneRequiredCharacterGroups,
  createRequiredCharacterGroup,
  expandRequiredAbilitiesToCharacterGroups,
  MAX_REQUIRED_CHARACTER_GROUPS,
} from './required-character-groups.utils';

export const DEFAULT_BATTLE_TITLE_PREFIX = 'Battle';
export const MAX_AUTO_BUILD_BATTLE_COUNT = 10;

export function createAutoBuildBattleRequirement(
  options: Partial<AutoBuildBattleRequirement> = {},
  index = 0,
): AutoBuildBattleRequirement {
  return {
    id: normalizeBattleId(options.id) ?? createBattleRequirementId(),
    title: normalizeBattleTitle(options.title, index),
    enemyMechanics: normalizeEnemyMechanicRequirements(options.enemyMechanics ?? []),
    requiredCharacterGroups: cloneRequiredCharacterGroups(options.requiredCharacterGroups),
  };
}

export function createBattleRequirementId(): string {
  return `battle-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createEmptyBattleRequirement(index: number): AutoBuildBattleRequirement {
  return createAutoBuildBattleRequirement(
    {
      id: createBattleRequirementId(),
      title: `${DEFAULT_BATTLE_TITLE_PREFIX} ${index + 1}`,
      enemyMechanics: [],
      requiredCharacterGroups: [],
    },
    index,
  );
}

export function cloneBattleRequirement(
  battle: AutoBuildBattleRequirement,
  index = 0,
): AutoBuildBattleRequirement {
  return createAutoBuildBattleRequirement(battle, index);
}

export function cloneBattleRequirements(
  battles: readonly AutoBuildBattleRequirement[] | null | undefined,
): AutoBuildBattleRequirement[] {
  return (Array.isArray(battles) ? battles : [])
    .slice(0, MAX_AUTO_BUILD_BATTLE_COUNT)
    .map((battle, index) => cloneBattleRequirement(battle, index))
    .filter(
      (battle) => battle.enemyMechanics.length > 0 || battle.requiredCharacterGroups.length > 0,
    );
}

export function flattenBattleRequiredCharacterGroups(
  battles: readonly AutoBuildBattleRequirement[] | null | undefined,
): AutoBuildRequiredCharacterGroup[] {
  return cloneBattleRequirements(battles).flatMap((battle) =>
    cloneRequiredCharacterGroups(battle.requiredCharacterGroups),
  );
}

export function flattenBattleEnemyMechanics(
  battles: readonly AutoBuildBattleRequirement[] | null | undefined,
): AutoBuildEnemyMechanicRequirement[] {
  return cloneBattleRequirements(battles).flatMap((battle) =>
    normalizeEnemyMechanicRequirements(battle.enemyMechanics),
  );
}

export function normalizeBattleRequirementsWithLegacyFallback(options: {
  battles?: readonly AutoBuildBattleRequirement[] | null;
  requiredAbilities?: readonly AutoBuildAbilityRequirement[] | null;
  requiredCharacterGroups?: readonly AutoBuildRequiredCharacterGroup[] | null;
  enemyMechanics?: readonly AutoBuildEnemyMechanicRequirement[] | null;
}): AutoBuildBattleRequirement[] {
  const battles = cloneBattleRequirements(options.battles);

  if (battles.length > 0) {
    return battles;
  }

  const legacyEnemyMechanics = normalizeEnemyMechanicRequirements(options.enemyMechanics ?? []);
  const legacyRequiredGroups = cloneRequiredCharacterGroups(options.requiredCharacterGroups);
  const manualRequiredAbilities = Array.isArray(options.requiredAbilities)
    ? options.requiredAbilities.filter(
        (requirement) =>
          normalizeAbilityRequirementSourceScope(requirement.sourceScope) !== 'captainAbility',
      )
    : [];
  const derivedRequiredAbilities =
    deriveAbilityRequirementsFromEnemyMechanics(legacyEnemyMechanics);
  const fallbackRequiredGroups =
    legacyRequiredGroups.length > 0
      ? legacyRequiredGroups
      : expandRequiredAbilitiesToCharacterGroups([
          ...derivedRequiredAbilities,
          ...manualRequiredAbilities,
        ]).groups;

  if (!legacyEnemyMechanics.length && !fallbackRequiredGroups.length) {
    return [];
  }

  return [
    createAutoBuildBattleRequirement({
      id: 'battle-1',
      title: `${DEFAULT_BATTLE_TITLE_PREFIX} 1`,
      enemyMechanics: legacyEnemyMechanics,
      requiredCharacterGroups: fallbackRequiredGroups.slice(0, MAX_REQUIRED_CHARACTER_GROUPS),
    }),
  ];
}

export function addEmptyGroupToBattle(
  battles: readonly AutoBuildBattleRequirement[],
  battleId: string,
): AutoBuildBattleRequirement[] {
  return battles.map((battle) =>
    battle.id === battleId
      ? {
          ...battle,
          requiredCharacterGroups: [
            ...battle.requiredCharacterGroups,
            createRequiredCharacterGroup(),
          ].slice(0, MAX_REQUIRED_CHARACTER_GROUPS),
        }
      : battle,
  );
}

function normalizeBattleId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeBattleTitle(value: string | null | undefined, index: number): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return `${DEFAULT_BATTLE_TITLE_PREFIX} ${index + 1}`;
}
