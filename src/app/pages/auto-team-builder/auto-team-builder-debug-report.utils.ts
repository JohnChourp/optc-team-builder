import {
  type AutoBuildAbilityRequirement,
  type AutoBuildEnemyMechanicRequirement,
} from '../../core/models/auto-team-builder-ability.models';
import {
  type AutoBuildConstraints,
  type AutoBuildInput,
  type AutoBuildLeaderBoostRange,
  type AutoBuildResult,
  type AutoBuildSlotExplanationReasonParam,
} from '../../core/models/auto-team-builder.models';
import { type DatasetManifest } from '../../core/models/optc.models';

/*
 * "Copy debug report" on Auto Team Builder (869exmkdp; owner, 2026-09-11).
 *
 * A versioned, compact projection of one build: the app and dataset it ran on, the request, the
 * outcome with every slot's reason codes, and the timings. It carries codes and ids, never
 * translated text, so a report reads the same whichever language the player uses. It is built
 * only when the player asks and never leaves the device on its own.
 *
 * Redaction: no team name, notes, box names or ids, battle titles, file names, share codes or
 * user agent. Character ids and names are game data, and they are the point of the report.
 */

export const AUTO_TEAM_DEBUG_REPORT_SCHEMA = 'optc-atb-debug-report';
export const AUTO_TEAM_DEBUG_REPORT_SCHEMA_VERSION = 1;
/** Where the report goes (owner, 2026-09-11): a plain link, never a URL carrying the report. */
export const AUTO_TEAM_DEBUG_REPORT_ISSUE_URL =
  'https://github.com/JohnChourp/optc-team-builder/issues/new';

/** Why the last build shows no team. Kept beside the translated message, which a report cannot use. */
export type AutoTeamBuildFailureCode =
  'noTeam' | 'searchTooLarge' | 'buildFailed' | 'guidedRelaxedOnly';

export type AutoTeamDebugReportStatus = 'exact' | 'fallback' | AutoTeamBuildFailureCode;

/** The last build's timings, kept after the build ends (869exmkep). */
export interface AutoTeamBuildStats {
  /** From the Build press to the answer, as the player waited. */
  wallMs: number;
  /** The search alone, as the service measured it: after candidates loaded and workers started. */
  searchMs: number;
  attemptsCompleted: number;
  totalAttempts: number;
  activeWorkers: number | null;
}

export interface AutoTeamDebugReportContext {
  candidateSource: 'all' | 'box' | 'favorites' | 'boxFavorites';
  /** How many characters a box limited the search to (after favourites-only), or null for none. */
  candidatePoolSize: number | null;
  boxCharacterCount: number | null;
  excludeBoxCharacterCount: number | null;
  favoriteCharacterCount: number;
  guidedAutoBuild: boolean;
  workerCount: number;
}

export interface AutoTeamDebugReportRuleState {
  key: string;
  state: 'passed' | 'relaxed' | 'notApplicable';
}

export type AutoTeamDebugReportRequestSource = Pick<AutoBuildInput, 'types' | 'selectedClasses'> &
  AutoBuildConstraints;

export interface AutoTeamDebugReportInput {
  createdAt: string;
  app: { version: string; platform: string; language: string };
  dataset: Pick<
    DatasetManifest,
    'generatedAt' | 'sourceVersion' | 'characterCount' | 'detailCount'
  > | null;
  /** The ability catalog's own `generatedAt`, or null when it failed to load. */
  abilityCatalogGeneratedAt: string | null;
  /** Every character with a local edit on this device: ids only. */
  localOverrideCharacterIds: readonly number[];
  context: AutoTeamDebugReportContext;
  /** The request as sent: `result.requestedInput`, or the page's inputs when no team came back. */
  request: AutoTeamDebugReportRequestSource;
  result: AutoBuildResult | null;
  failure: AutoTeamBuildFailureCode | null;
  rules: readonly AutoTeamDebugReportRuleState[];
  performance: AutoTeamBuildStats | null;
}

interface AutoTeamDebugReportReason {
  code: string;
  params?: Record<string, AutoBuildSlotExplanationReasonParam>;
}

interface AutoTeamDebugReportAbility {
  key: string;
  count: number;
  minTurns?: number;
  minEffectValue?: number;
  slotScope?: string;
  sourceScope?: string;
  effectTargetScope?: string;
  slotTokens?: string[];
}

interface AutoTeamDebugReportMechanic {
  key: string;
  category: string;
  minTurns?: number;
  count?: number;
  derivedAbilityKey?: string;
}

export interface AutoTeamDebugReport {
  schema: typeof AUTO_TEAM_DEBUG_REPORT_SCHEMA;
  schemaVersion: typeof AUTO_TEAM_DEBUG_REPORT_SCHEMA_VERSION;
  createdAt: string;
  app: { version: string; platform: string; language: string };
  dataset: {
    generatedAt: string;
    sourceVersion: string;
    characterCount: number;
    detailCount: number;
    abilityCatalogGeneratedAt: string | null;
  } | null;
  dataQuality: {
    abilityCatalogLoaded: boolean;
    localOverrideCount: number;
    overriddenTeamCharacterIds: number[];
    incompleteTeamCharacterIds: number[];
  };
  context: AutoTeamDebugReportContext;
  request: {
    types: string[];
    classes: string[];
    characterTags: string[];
    characterTagSets: {
      operator: string;
      sets: Array<{ operator: string; tags: string[] }>;
    } | null;
    characterNames: string[];
    requiredAbilities: AutoTeamDebugReportAbility[];
    battles: Array<{
      enemyMechanics: AutoTeamDebugReportMechanic[];
      characterGroups: AutoTeamDebugReportAbility[][];
    }>;
    enemyMechanics: AutoTeamDebugReportMechanic[];
    manualSlots: Array<{ role: string; characterIds: number[] }>;
    manualShipId: number | null;
    requireManualShip: boolean;
    excludedCharacterCount: number;
    excludedShipCount: number;
    leaderBoostFilters: string[];
    leaderBoostRanges: Record<string, { min: number | null; max: number | null }>;
    maxTotalCost: number | null;
    flags: Record<string, boolean>;
  };
  outcome: {
    status: AutoTeamDebugReportStatus;
    candidateCount?: number;
    teamKey?: string;
    ship?: { id: number; source: 'manual' | 'recommended' } | null;
    slots?: Array<{
      role: 'captain' | 'friendCaptain' | 'sub';
      characterId: number;
      name: string;
      primaryReason: AutoTeamDebugReportReason | null;
      reasons: AutoTeamDebugReportReason[];
      fallbackReasons: AutoTeamDebugReportReason[];
      rejected: Array<{ characterId: number; reasons: AutoTeamDebugReportReason[] }>;
    }>;
  };
  rules?: AutoTeamDebugReportRuleState[];
  relaxation?: AutoBuildResult['relaxation'];
  coverage?: {
    missingAbilityKeys: string[];
    missingRequiredCharacterGroups: number;
    missingBattles: number;
    leaderScopeSlots: { matching: number; total: number };
    leaderTiersCovered: boolean;
    uncoveredTierLabels: string[];
  };
  performance?: AutoTeamBuildStats;
}

const REQUEST_FLAG_KEYS = [
  'requireAllSelectedTypesInTeam',
  'requireAllSelectedClassesPerCharacter',
  'requireAllSelectedClassesInTeam',
  'requireAllSelectedCharacterTagsInTeam',
  'requireAllSelectedCharacterNamesInTeam',
  'requireAllSlotsInLeaderSuperEffectScope',
  'requireFullCaptainAbilityCoverage',
  'requireBothLeadersFullCaptainAbilityCoverage',
  'strictSuperSpecialCriteriaCoverage',
  'strictSuperTandemCriteriaCoverage',
  'requireUniqueBaseCharacterNames',
  'favoritesOnly',
  'allowAnyFriendCaptainAutoFill',
  'favoriteShipsOnly',
] as const satisfies ReadonlyArray<keyof AutoBuildConstraints>;

export function buildAutoTeamDebugReport(input: AutoTeamDebugReportInput): AutoTeamDebugReport {
  const { result } = input;
  const teamCharacterIds = result?.slots.map((slot) => slot.character.id) ?? [];
  const localOverrideIds = new Set(input.localOverrideCharacterIds);
  const report: AutoTeamDebugReport = {
    schema: AUTO_TEAM_DEBUG_REPORT_SCHEMA,
    schemaVersion: AUTO_TEAM_DEBUG_REPORT_SCHEMA_VERSION,
    createdAt: input.createdAt,
    app: { ...input.app },
    dataset: input.dataset
      ? {
          generatedAt: input.dataset.generatedAt,
          sourceVersion: input.dataset.sourceVersion,
          characterCount: input.dataset.characterCount,
          detailCount: input.dataset.detailCount,
          abilityCatalogGeneratedAt: input.abilityCatalogGeneratedAt,
        }
      : null,
    dataQuality: {
      abilityCatalogLoaded: input.abilityCatalogGeneratedAt !== null,
      localOverrideCount: localOverrideIds.size,
      overriddenTeamCharacterIds: uniqueSorted(
        teamCharacterIds.filter((characterId) => localOverrideIds.has(characterId)),
      ),
      incompleteTeamCharacterIds: uniqueSorted(
        result?.slots
          .filter((slot) => slot.character.isIncomplete)
          .map((slot) => slot.character.id) ?? [],
      ),
    },
    context: { ...input.context },
    request: compactRequest(input.request),
    outcome: { status: resolveStatus(input) },
  };

  if (result) {
    report.outcome = {
      ...report.outcome,
      candidateCount: result.candidateCount,
      teamKey: buildAutoTeamDebugReportTeamKey(result.slots),
      ship: result.shipSelection
        ? { id: result.shipSelection.ship.id, source: result.shipSelection.source }
        : null,
      slots: result.slots.map((slot) => ({
        role: slot.role,
        characterId: slot.character.id,
        name: slot.character.name,
        primaryReason: slot.explanation ? compactReason(slot.explanation.primaryReason) : null,
        reasons: slot.explanation?.reasons.map(compactReason) ?? [],
        fallbackReasons: slot.explanation?.fallbackReasons.map(compactReason) ?? [],
        rejected:
          slot.explanation?.rejectedCandidates.map((candidate) => ({
            characterId: candidate.characterId,
            reasons: candidate.reasons.map(compactReason),
          })) ?? [],
      })),
    };
    report.rules = input.rules.map((rule) => ({ key: rule.key, state: rule.state }));
    report.relaxation = { ...result.relaxation };
    report.coverage = {
      missingAbilityKeys: result.coverage.abilityRequirements.missing.map(
        (requirement) => requirement.abilityKey,
      ),
      missingRequiredCharacterGroups: result.coverage.requiredCharacterGroups.missing.length,
      missingBattles: result.coverage.battleRequirements?.missing.length ?? 0,
      leaderScopeSlots: {
        matching: result.coverage.leaderCriteria.matchingSlots,
        total: result.coverage.leaderCriteria.totalSlots,
      },
      leaderTiersCovered: result.coverage.leaderCriteria.allLeaderTiersCovered,
      uncoveredTierLabels: result.coverage.leaderCriteria.leaderTierCoverages.flatMap(
        (tier) => tier.uncoveredTierLabels,
      ),
    };
  }

  if (input.performance) {
    report.performance = { ...input.performance };
  }

  return report;
}

/**
 * The report as text for a bug report or a message: a few plain lines, then the JSON. English on
 * purpose, like the JSON: it is read by whoever fixes the problem, and it is pasted into GitHub.
 */
export function formatAutoTeamDebugReportMarkdown(report: AutoTeamDebugReport): string {
  const lines = [
    '### Auto Team Builder debug report',
    '',
    `- App: ${report.app.version} (${report.app.platform}, ${report.app.language})`,
    report.dataset
      ? `- Data: ${report.dataset.characterCount} characters, generated ${report.dataset.generatedAt}` +
        (report.dataQuality.abilityCatalogLoaded ? '' : ', ability catalog not loaded')
      : '- Data: not loaded',
    `- Result: ${describeOutcome(report)}`,
  ];

  if (report.dataQuality.overriddenTeamCharacterIds.length) {
    lines.push(
      `- Local character edits in this team: ${report.dataQuality.overriddenTeamCharacterIds.join(', ')}`,
    );
  }

  lines.push('', '```json', JSON.stringify(report, null, 2), '```', '');

  return lines.join('\n');
}

/** Leaders, then subs, each sorted: the same team reads the same whatever the slot order. */
export function buildAutoTeamDebugReportTeamKey(slots: AutoBuildResult['slots']): string {
  const sortedIds = (roles: ReadonlyArray<AutoBuildResult['slots'][number]['role']>): number[] =>
    slots
      .filter((slot) => roles.includes(slot.role))
      .map((slot) => slot.character.id)
      .sort((left, right) => left - right);

  return `${sortedIds(['captain', 'friendCaptain']).join(',')}|${sortedIds(['sub']).join(',')}`;
}

function resolveStatus(input: AutoTeamDebugReportInput): AutoTeamDebugReportStatus {
  if (input.failure) {
    return input.failure;
  }

  return input.result?.relaxation.usedFallback ? 'fallback' : 'exact';
}

function describeOutcome(report: AutoTeamDebugReport): string {
  const seconds = report.performance
    ? ` in ${(report.performance.wallMs / 1000).toFixed(1)} s`
    : '';
  const candidates =
    report.outcome.candidateCount === undefined
      ? ''
      : ` from ${report.outcome.candidateCount} candidates`;
  const labels: Record<AutoTeamDebugReportStatus, string> = {
    exact: 'team found with every rule kept',
    fallback: 'team found with some rules relaxed',
    noTeam: 'no team found',
    searchTooLarge: 'search too large',
    buildFailed: 'build failed',
    guidedRelaxedOnly: 'guided build found only a relaxed team',
  };

  return `${labels[report.outcome.status]}${candidates}${seconds}`;
}

function compactRequest(source: AutoTeamDebugReportRequestSource): AutoTeamDebugReport['request'] {
  return {
    types: [...source.types],
    classes: [...source.selectedClasses],
    characterTags: [...(source.selectedCharacterTags ?? [])],
    characterTagSets: compactCharacterTagSets(source.characterTagSets),
    characterNames: [...(source.selectedCharacterNames ?? [])],
    requiredAbilities: (source.requiredAbilities ?? []).map(compactAbility),
    battles: (source.battleRequirements ?? [])
      .map((battle) => ({
        enemyMechanics: battle.enemyMechanics.map(compactMechanic),
        characterGroups: battle.requiredCharacterGroups.map((group) =>
          group.abilities.map(compactAbility),
        ),
      }))
      .filter((battle) => battle.enemyMechanics.length > 0 || battle.characterGroups.length > 0),
    enemyMechanics: (source.enemyMechanics ?? []).map(compactMechanic),
    manualSlots: (source.manualSlots ?? [])
      .filter((slot) => slot.characterIds.length > 0)
      .map((slot) => ({ role: slot.role, characterIds: [...slot.characterIds] })),
    manualShipId: source.manualShipId ?? null,
    requireManualShip: source.requireManualShip ?? false,
    excludedCharacterCount: source.excludedCharacterIds?.length ?? 0,
    excludedShipCount: source.excludedShipIds?.length ?? 0,
    leaderBoostFilters: [...(source.leaderBoostFilters ?? [])],
    leaderBoostRanges: Object.fromEntries(
      Object.entries(source.leaderBoostRanges ?? {})
        .filter((entry): entry is [string, Partial<AutoBuildLeaderBoostRange>] =>
          Boolean(entry[1] && (isFiniteNumber(entry[1].min) || isFiniteNumber(entry[1].max))),
        )
        .map(([filter, range]) => [
          filter,
          {
            min: isFiniteNumber(range.min) ? range.min : null,
            max: isFiniteNumber(range.max) ? range.max : null,
          },
        ]),
    ),
    maxTotalCost: source.maxTotalCost ?? null,
    flags: Object.fromEntries(REQUEST_FLAG_KEYS.map((key) => [key, source[key] === true])),
  };
}

function compactCharacterTagSets(
  selection: AutoBuildConstraints['characterTagSets'],
): AutoTeamDebugReport['request']['characterTagSets'] {
  const sets = (selection?.sets ?? [])
    .filter((set) => set.tags.length > 0)
    .map((set) => ({ operator: set.operator, tags: [...set.tags] }));

  return selection && sets.length ? { operator: selection.operator, sets } : null;
}

function compactAbility(requirement: AutoBuildAbilityRequirement): AutoTeamDebugReportAbility {
  return {
    key: requirement.abilityKey,
    count: requirement.requiredCharacterCount,
    ...(isFiniteNumber(requirement.minTurns) ? { minTurns: requirement.minTurns } : {}),
    ...(isFiniteNumber(requirement.minEffectValue)
      ? { minEffectValue: requirement.minEffectValue }
      : {}),
    ...(requirement.slotScope ? { slotScope: requirement.slotScope } : {}),
    ...(requirement.sourceScope ? { sourceScope: requirement.sourceScope } : {}),
    ...(requirement.effectTargetScope ? { effectTargetScope: requirement.effectTargetScope } : {}),
    ...(requirement.slotTokens.length ? { slotTokens: [...requirement.slotTokens] } : {}),
  };
}

function compactMechanic(
  requirement: AutoBuildEnemyMechanicRequirement,
): AutoTeamDebugReportMechanic {
  return {
    key: requirement.mechanicKey,
    category: requirement.category,
    ...(isFiniteNumber(requirement.minTurns) ? { minTurns: requirement.minTurns } : {}),
    ...(isFiniteNumber(requirement.requiredCharacterCount)
      ? { count: requirement.requiredCharacterCount }
      : {}),
    ...(requirement.derivedAbilityKey ? { derivedAbilityKey: requirement.derivedAbilityKey } : {}),
  };
}

function compactReason(reason: AutoTeamDebugReportReason): AutoTeamDebugReportReason {
  return reason.params && Object.keys(reason.params).length
    ? { code: reason.code, params: { ...reason.params } }
    : { code: reason.code };
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
