import {
  AUTO_BUILD_TOTAL_SLOT_COUNT,
  AUTO_TEAM_BUILDER_CLASSES,
  AUTO_TEAM_BUILDER_TYPES,
  type AutoBuildAttemptProgressSnapshot,
  type AutoBuildInput,
  type AutoBuildProgressSnapshot,
  type AutoBuildResult,
  type AutoBuildSlotExplanationReason,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import {
  buildAutoTeamResultFromPreparedContext,
  prepareAutoTeamBuildContext,
  normalizeAutoBuildCharacterMatchKey,
  resolveRequiredManualCharacterIds,
  resolveCharacterPartyConflictKeys,
  resolveCharacterTypeTokens,
  resolveUnsatisfiedSuperSpecialCriteriaCharacterNames,
  resolveUnsatisfiedSuperTandemCriteriaCharacterNames,
  type PreparedAutoTeamBuildContext,
} from './auto-team-builder.utils';

export interface AutoTeamBuildSearchOptions {
  onProgress?: (snapshot: AutoBuildProgressSnapshot) => void;
  isCancelled?: () => boolean;
  now?: () => number;
  friendCaptainRecords?: CharacterDetailRecord[];
  preparedContext?: PreparedAutoTeamBuildContext;
  friendCaptainContext?: PreparedAutoTeamBuildContext;
  autoFillCharacterIds?: number[];
  leaderAutoFillCharacterIds?: number[];
  subAutoFillCharacterIds?: number[];
  maxScheduledFallbackAttempts?: number;
}

export interface AutoTeamBuildAttemptExecutionOptions {
  onProgress?: (progress: AutoBuildAttemptProgressSnapshot) => void;
}

export interface AutoTeamBuildPlannedAttempt {
  input: AutoBuildInput;
  requireLeadersWithoutSuperEffects: boolean;
  allowedLeadersWithSuperEffects: boolean;
  droppedTypes: AutoTeamBuilderType[];
  droppedClasses: string[];
  droppedCharacterTags: string[];
  droppedCharacterNames: string[];
  ignoredLeaderSuperEffectScope: boolean;
  ignoredLeaderSuperSpecialCriteria: boolean;
}

interface AutoTeamBuildZeroDropRelaxationOption {
  apply: (input: AutoBuildInput) => AutoBuildInput;
  allowedLeadersWithSuperEffects: boolean;
  ignoredLeaderSuperEffectScope: boolean;
  ignoredLeaderSuperSpecialCriteria: boolean;
}

type AutoTeamBuildDroppedFilterKind = 'type' | 'class' | 'characterTag' | 'characterName';
export type AutoTeamBuildFallbackAttemptCategory = 'meta' | 'single' | 'double' | 'subset';

interface AutoTeamBuildFilterDropDescriptor {
  id: string;
  kind: AutoTeamBuildDroppedFilterKind;
  value: string;
  support: number;
}

interface AutoTeamBuildSubsetCandidate {
  attempt: AutoTeamBuildPlannedAttempt;
  category: Exclude<AutoTeamBuildFallbackAttemptCategory, 'meta'>;
  droppedFilterIds: string[];
  droppedCount: number;
  droppedSupport: number;
  remainingFilterCount: number;
}

export interface AutoTeamBuildFallbackPlannerOptions {
  maxScheduledFallbackAttempts?: number;
}

export interface AutoTeamBuildScheduledAttempt extends AutoTeamBuildPlannedAttempt {
  sequence: number;
  category: AutoTeamBuildFallbackAttemptCategory;
  droppedFilterIds: string[];
}

interface AutoTeamBuildFallbackCategoryTiming {
  completedAttempts: number;
  totalMs: number;
  averageMs: number;
}

export interface AutoTeamBuildTimingState {
  searchStartedAt: number;
  totalCompletedFallbackMs: number;
  completedFallbackAttempts: number;
  recentAverageFallbackMs: number | null;
  categoryTimings: Map<AutoTeamBuildFallbackAttemptCategory, AutoTeamBuildFallbackCategoryTiming>;
  now: () => number;
}

export interface AutoTeamBuildInFlightFallbackTiming {
  category: AutoTeamBuildFallbackAttemptCategory;
  startedAt: number;
}

type AutoBuildProgressSnapshotBase = Omit<
  AutoBuildProgressSnapshot,
  'elapsedMs' | 'estimatedRemainingMs' | 'averageFallbackAttemptMs' | 'completedFallbackAttempts'
> & {
  activeWorkerCount?: number;
  remainingFallbackCategories?: AutoTeamBuildFallbackAttemptCategory[];
  inFlightFallbackTimings?: AutoTeamBuildInFlightFallbackTiming[];
};

const MAX_DYNAMIC_TOTAL_ATTEMPTS = 31_744;
const MAX_DYNAMIC_SCHEDULED_FALLBACK_ATTEMPTS = MAX_DYNAMIC_TOTAL_ATTEMPTS - 1;
const RECENT_FALLBACK_AVERAGE_ALPHA = 0.35;
const MIN_CATEGORY_TIMING_SAMPLE_COUNT = 2;

export class AutoTeamBuildCancelledError extends Error {
  public constructor(message = 'Auto team build cancelled.') {
    super(message);
    this.name = 'AutoTeamBuildCancelledError';
  }
}

export function isAutoTeamBuildCancelledError(
  error: unknown,
): error is AutoTeamBuildCancelledError {
  return error instanceof AutoTeamBuildCancelledError;
}

export function runAutoTeamBuildSearch(
  records: CharacterDetailRecord[],
  requestedInput: AutoBuildInput,
  options: AutoTeamBuildSearchOptions = {},
): AutoBuildResult | null {
  const timingState = createTimingState(options);
  const requiredManualCharacterIds = resolveRequiredManualCharacterIds(requestedInput.manualSlots);
  const preparedContext =
    options.preparedContext &&
    requiredManualCharacterIds.every((characterId) =>
      options.preparedContext?.recordById.has(characterId),
    )
      ? options.preparedContext
      : prepareAutoTeamBuildContext(records, {
          forceIncludeRecordIds: requiredManualCharacterIds,
        });
  const friendCaptainContext =
    options.friendCaptainContext ??
    (options.friendCaptainRecords
      ? prepareAutoTeamBuildContext(options.friendCaptainRecords)
      : undefined);
  const planner = createAutoTeamBuildFallbackPlanner(requestedInput, records, {
    maxScheduledFallbackAttempts: options.maxScheduledFallbackAttempts,
  });
  const projectedTotalAttempts = planner.getProjectedTotalAttempts();

  assertNotCancelled(options);
  emitProgress(options, timingState, {
    stage: 'preparingSearch',
    candidateCount: records.length,
    completedAttempts: 0,
    totalAttempts: 0,
    attemptCountFinal: false,
    currentDroppedTypes: [],
    currentDroppedClasses: [],
    currentAllowedLeadersWithSuperEffects: false,
    currentIgnoredLeaderSuperSpecialCriteria: false,
    messageKey: 'progress.preparingSearch',
  });

  assertNotCancelled(options);
  const exactProgressBase: AutoBuildProgressSnapshotBase = {
    stage: 'exactAttempt',
    candidateCount: records.length,
    completedAttempts: 0,
    totalAttempts: projectedTotalAttempts,
    attemptCountFinal: planner.isAttemptCountFinal(),
    currentDroppedTypes: [],
    currentDroppedClasses: [],
    currentAllowedLeadersWithSuperEffects: false,
    currentIgnoredLeaderSuperSpecialCriteria: false,
    messageKey: 'progress.exactAttempt',
    messageParams: {
      current: 1,
      total: projectedTotalAttempts,
    },
  };

  emitProgress(options, timingState, exactProgressBase);

  const exactResult = runAutoTeamBuildAttempt(
    records,
    requestedInput,
    requestedInput,
    resolveExactAttemptRequiresNoSuperLeaders(requestedInput),
    options.friendCaptainRecords,
    options.autoFillCharacterIds,
    options.leaderAutoFillCharacterIds,
    options.subAutoFillCharacterIds,
    preparedContext,
    friendCaptainContext,
    {
      onProgress: (progress) =>
        emitProgress(options, timingState, {
          ...exactProgressBase,
          ...progress,
        }),
    },
  );

  if (satisfiesRequestedAutoTeamBuildCoverage(exactResult)) {
    emitCompletedProgress(options, timingState, records.length, 1, 1);
    return exactResult;
  }

  planner.scheduleInitialFallbackAttempts();

  if (!planner.hasPendingScheduledAttempts()) {
    emitCompletedProgress(options, timingState, records.length, planner.getTotalAttempts(), 1);
    return exactResult;
  }

  let completedAttempts = 1;

  for (
    let plannedAttempt = planner.takeNextScheduledAttempt();
    plannedAttempt;
    plannedAttempt = planner.takeNextScheduledAttempt()
  ) {
    assertNotCancelled(options);
    const fallbackStartedAt = timingState.now();
    const fallbackProgressBase: AutoBuildProgressSnapshotBase = {
      stage: 'fallbackAttempt',
      candidateCount: records.length,
      completedAttempts,
      totalAttempts: planner.getTotalAttempts(),
      attemptCountFinal: planner.isAttemptCountFinal(),
      remainingFallbackCategories: planner.getPendingScheduledFallbackAttemptCategories(),
      inFlightFallbackTimings: [
        {
          category: plannedAttempt.category,
          startedAt: fallbackStartedAt,
        },
      ],
      currentDroppedTypes: plannedAttempt.droppedTypes,
      currentDroppedClasses: plannedAttempt.droppedClasses,
      currentAllowedLeadersWithSuperEffects: plannedAttempt.allowedLeadersWithSuperEffects,
      currentIgnoredLeaderSuperSpecialCriteria: Boolean(
        plannedAttempt.ignoredLeaderSuperSpecialCriteria,
      ),
      messageKey: 'progress.fallbackAttempt',
      messageParams: {
        current: plannedAttempt.sequence + 2,
        total: planner.getTotalAttempts(),
      },
    };

    emitProgress(options, timingState, fallbackProgressBase);
    const relaxedResult = runAutoTeamBuildAttempt(
      records,
      plannedAttempt.input,
      requestedInput,
      plannedAttempt.requireLeadersWithoutSuperEffects,
      options.friendCaptainRecords,
      options.autoFillCharacterIds,
      options.leaderAutoFillCharacterIds,
      options.subAutoFillCharacterIds,
      preparedContext,
      friendCaptainContext,
      {
        onProgress: (progress) =>
          emitProgress(options, timingState, {
            ...fallbackProgressBase,
            ...progress,
          }),
      },
    );
    const fallbackEndedAt = timingState.now();

    recordAutoTeamBuildFallbackTiming(
      timingState,
      plannedAttempt.category,
      Math.max(0, fallbackEndedAt - fallbackStartedAt),
    );

    if (satisfiesRequestedAutoTeamBuildCoverage(relaxedResult)) {
      emitCompletedProgress(
        options,
        timingState,
        records.length,
        planner.getTotalAttempts(),
        completedAttempts + 1,
      );
      return relaxedResult;
    }

    planner.recordFailedFallbackAttempt(plannedAttempt);
    completedAttempts += 1;
  }

  emitCompletedProgress(
    options,
    timingState,
    records.length,
    planner.getTotalAttempts(),
    completedAttempts,
  );
  return null;
}

function emitCompletedProgress(
  options: AutoTeamBuildSearchOptions,
  timingState: AutoTeamBuildTimingState,
  candidateCount: number,
  totalAttempts: number,
  completedAttempts: number,
): void {
  emitProgress(options, timingState, {
    stage: 'completed',
    candidateCount,
    completedAttempts,
    totalAttempts,
    attemptCountFinal: true,
    remainingFallbackCategories: [],
    inFlightFallbackTimings: [],
    currentDroppedTypes: [],
    currentDroppedClasses: [],
    currentAllowedLeadersWithSuperEffects: false,
    currentIgnoredLeaderSuperSpecialCriteria: false,
    messageKey: 'progress.completed',
  });
}

function emitProgress(
  options: AutoTeamBuildSearchOptions,
  timingState: AutoTeamBuildTimingState,
  snapshot: AutoBuildProgressSnapshotBase,
): void {
  const {
    activeWorkerCount,
    remainingFallbackCategories,
    inFlightFallbackTimings,
    ...progressSnapshot
  } = snapshot;

  const nextSnapshot: AutoBuildProgressSnapshot = {
    ...buildAutoTeamBuildTimingSnapshot(
      timingState,
      progressSnapshot.totalAttempts,
      progressSnapshot.completedAttempts,
      {
        activeWorkerCount,
        remainingCategories: remainingFallbackCategories,
        inFlightAttempts: inFlightFallbackTimings,
      },
    ),
    ...progressSnapshot,
    currentDroppedTypes: [...progressSnapshot.currentDroppedTypes],
    currentDroppedClasses: [...progressSnapshot.currentDroppedClasses],
  };

  if (typeof activeWorkerCount === 'number') {
    nextSnapshot.activeWorkerCount = activeWorkerCount;
  }

  options.onProgress?.(nextSnapshot);
}

function assertNotCancelled(options: AutoTeamBuildSearchOptions): void {
  if (options.isCancelled?.()) {
    throw new AutoTeamBuildCancelledError();
  }
}

function createTimingState(options: AutoTeamBuildSearchOptions): AutoTeamBuildTimingState {
  const now = options.now ?? resolveCurrentTimestamp;

  return createAutoTeamBuildTimingState(now);
}

export function createAutoTeamBuildTimingState(
  now: () => number = resolveCurrentTimestamp,
): AutoTeamBuildTimingState {
  return {
    searchStartedAt: now(),
    totalCompletedFallbackMs: 0,
    completedFallbackAttempts: 0,
    recentAverageFallbackMs: null,
    categoryTimings: new Map(),
    now,
  };
}

export function recordAutoTeamBuildFallbackTiming(
  timingState: AutoTeamBuildTimingState,
  category: AutoTeamBuildFallbackAttemptCategory,
  durationMs: number,
): void {
  const normalizedDurationMs = Math.max(0, durationMs);
  const categoryTiming = timingState.categoryTimings.get(category) ?? {
    completedAttempts: 0,
    totalMs: 0,
    averageMs: 0,
  };

  categoryTiming.completedAttempts += 1;
  categoryTiming.totalMs += normalizedDurationMs;
  categoryTiming.averageMs = categoryTiming.totalMs / categoryTiming.completedAttempts;
  timingState.categoryTimings.set(category, categoryTiming);
  timingState.totalCompletedFallbackMs += normalizedDurationMs;
  timingState.completedFallbackAttempts += 1;
  timingState.recentAverageFallbackMs =
    timingState.recentAverageFallbackMs === null
      ? normalizedDurationMs
      : timingState.recentAverageFallbackMs * (1 - RECENT_FALLBACK_AVERAGE_ALPHA) +
        normalizedDurationMs * RECENT_FALLBACK_AVERAGE_ALPHA;
}

export function buildAutoTeamBuildTimingSnapshot(
  timingState: AutoTeamBuildTimingState,
  totalAttempts: number,
  completedAttempts: number,
  options: {
    activeWorkerCount?: number;
    remainingCategories?: AutoTeamBuildFallbackAttemptCategory[];
    inFlightAttempts?: AutoTeamBuildInFlightFallbackTiming[];
  } = {},
): Pick<
  AutoBuildProgressSnapshot,
  'elapsedMs' | 'estimatedRemainingMs' | 'averageFallbackAttemptMs' | 'completedFallbackAttempts'
> {
  const elapsedMs = Math.max(0, timingState.now() - timingState.searchStartedAt);
  const averageFallbackAttemptMs = resolveFallbackDefaultTimingMs(timingState);
  const remainingCategories =
    options.remainingCategories ??
    Array.from({
      length: Math.max(totalAttempts - completedAttempts - 1, 0),
    }).map(() => null);
  const pendingFallbackMs = remainingCategories.reduce(
    (total, category) => total + resolveFallbackCategoryTimingMs(timingState, category),
    0,
  );
  const inFlightFallbackMs = (options.inFlightAttempts ?? []).reduce((total, attempt) => {
    const elapsedAttemptMs = Math.max(0, timingState.now() - attempt.startedAt);
    const predictedAttemptMs = resolveFallbackCategoryTimingMs(timingState, attempt.category);

    return total + Math.max(predictedAttemptMs, elapsedAttemptMs);
  }, 0);
  const estimatedFallbackMs = pendingFallbackMs + inFlightFallbackMs;
  const activeWorkerCount = Math.max(options.activeWorkerCount ?? 1, 1);
  const estimatedRemainingMs =
    averageFallbackAttemptMs !== null && estimatedFallbackMs > 0
      ? estimatedFallbackMs / activeWorkerCount
      : null;

  return {
    elapsedMs,
    estimatedRemainingMs,
    averageFallbackAttemptMs,
    completedFallbackAttempts: timingState.completedFallbackAttempts,
  };
}

function resolveFallbackDefaultTimingMs(timingState: AutoTeamBuildTimingState): number | null {
  if (timingState.recentAverageFallbackMs !== null) {
    return timingState.recentAverageFallbackMs;
  }

  return timingState.completedFallbackAttempts > 0
    ? timingState.totalCompletedFallbackMs / timingState.completedFallbackAttempts
    : null;
}

function resolveFallbackCategoryTimingMs(
  timingState: AutoTeamBuildTimingState,
  category: AutoTeamBuildFallbackAttemptCategory | null,
): number {
  const defaultTimingMs = resolveFallbackDefaultTimingMs(timingState);

  if (category === null) {
    return defaultTimingMs ?? 0;
  }

  const categoryTiming = timingState.categoryTimings.get(category);

  if (categoryTiming && categoryTiming.completedAttempts >= MIN_CATEGORY_TIMING_SAMPLE_COUNT) {
    return categoryTiming.averageMs;
  }

  return defaultTimingMs ?? categoryTiming?.averageMs ?? 0;
}

function resolveCurrentTimestamp(): number {
  if (typeof globalThis.performance?.now === 'function') {
    return globalThis.performance.now();
  }

  return Date.now();
}

export function runAutoTeamBuildAttempt(
  records: CharacterDetailRecord[],
  input: AutoBuildInput,
  requestedInput: AutoBuildInput,
  requireLeadersWithoutSuperEffects: boolean,
  friendCaptainRecords?: CharacterDetailRecord[],
  autoFillCharacterIds?: number[],
  leaderAutoFillCharacterIds?: number[],
  subAutoFillCharacterIds?: number[],
  preparedContext: PreparedAutoTeamBuildContext = prepareAutoTeamBuildContext(records),
  friendCaptainContext?: PreparedAutoTeamBuildContext,
  executionOptions: AutoTeamBuildAttemptExecutionOptions = {},
): AutoBuildResult | null {
  const requiredManualCharacterIds = resolveRequiredManualCharacterIds(input.manualSlots);
  const attemptPreparedContext =
    requiredManualCharacterIds.every((characterId) => preparedContext.recordById.has(characterId))
      ? preparedContext
      : prepareAutoTeamBuildContext(records, {
          forceIncludeRecordIds: requiredManualCharacterIds,
        });
  const attempt = buildAutoTeamResultFromPreparedContext(attemptPreparedContext, input, {
    requireLeadersWithoutSuperEffects,
    friendCaptainRecords,
    friendCaptainContext,
    autoFillCharacterIds,
    leaderAutoFillCharacterIds: input.allowPartialCaptainAbilityCoverage
      ? autoFillCharacterIds
      : leaderAutoFillCharacterIds,
    subAutoFillCharacterIds: input.allowPartialCaptainAbilityCoverage
      ? autoFillCharacterIds
      : subAutoFillCharacterIds,
    onProgress: executionOptions.onProgress,
  });

  if (!attempt) {
    return null;
  }

  const allowedLeadersWithSuperEffects = shouldReportAllowedLeadersWithSuperEffects(
    requestedInput,
    requireLeadersWithoutSuperEffects,
  );
  const ignoredLeaderSuperSpecialCriteria = Boolean(
    requestedInput.requireLeaderSuperSpecialCriteria && !input.requireLeaderSuperSpecialCriteria,
  );
  const ignoredSuperSpecialCriteriaCharacterNames = ignoredLeaderSuperSpecialCriteria
    ? resolveUnsatisfiedSuperSpecialCriteriaCharacterNames(attempt.slots, requestedInput)
    : [];
  const ignoredSuperTandemCriteria = Boolean(
    requestedInput.requireSuperTandemCriteria && !input.requireSuperTandemCriteria,
  );
  const ignoredSuperTandemCriteriaCharacterNames = ignoredSuperTandemCriteria
    ? resolveUnsatisfiedSuperTandemCriteriaCharacterNames(attempt.slots, requestedInput)
    : [];
  const relaxation: AutoBuildResult['relaxation'] = {
    usedFallback: !inputsMatch(requestedInput, input) || allowedLeadersWithSuperEffects,
    droppedTypes: requestedInput.types.filter((type) => !input.types.includes(type)),
    droppedClasses: requestedInput.selectedClasses.filter(
      (selectedClass) => !input.selectedClasses.includes(selectedClass),
    ),
    droppedCharacterTags: (requestedInput.selectedCharacterTags ?? []).filter(
      (selectedTag) => !(input.selectedCharacterTags ?? []).includes(selectedTag),
    ),
    droppedCharacterNames: (requestedInput.selectedCharacterNames ?? []).filter(
      (selectedName) => !(input.selectedCharacterNames ?? []).includes(selectedName),
    ),
    minimumLeaderSuperEffectMatchingSlots: input.minimumLeaderSuperEffectMatchingSlots,
    allowedLeadersWithSuperEffects,
    ...((requestedInput.requireFullCaptainAbilityCoverage ||
      requestedInput.requireBothLeadersFullCaptainAbilityCoverage) &&
    input.allowPartialCaptainAbilityCoverage
      ? { ignoredCaptainAbilityCoverage: true }
      : {}),
    ...(requestedInput.requireFullCaptainAbilityCoverage &&
    !input.requireFullCaptainAbilityCoverage &&
    !input.allowPartialCaptainAbilityCoverage &&
    !requestedInput.requireBothLeadersFullCaptainAbilityCoverage
      ? { downgradedCaptainAbilityCoverageToSimple: true }
      : {}),
    ignoredLeaderSuperEffectScope: Boolean(
      requestedInput.requireAllSlotsInLeaderSuperEffectScope &&
      !input.requireAllSlotsInLeaderSuperEffectScope,
    ),
    ignoredLeaderSuperSpecialCriteria,
    ...(ignoredSuperSpecialCriteriaCharacterNames.length
      ? { ignoredSuperSpecialCriteriaCharacterNames }
      : {}),
    ignoredSuperTandemCriteria,
    ...(ignoredSuperTandemCriteriaCharacterNames.length
      ? { ignoredSuperTandemCriteriaCharacterNames }
      : {}),
  };

  return appendFallbackExplanationReasons({
    ...attempt,
    requestedInput,
    relaxation,
    shipSelection: null,
  });
}

function appendFallbackExplanationReasons(result: AutoBuildResult): AutoBuildResult {
  const fallbackReasons = buildFallbackExplanationReasons(result.relaxation);

  if (!fallbackReasons.length) {
    return result;
  }

  return {
    ...result,
    slots: result.slots.map((slot) => {
      const explanation = slot.explanation;
      const nextFallbackReasons = fallbackReasons.map(cloneExplanationReason);

      if (!explanation) {
        return {
          ...slot,
          explanation: {
            primaryReason: nextFallbackReasons[0]!,
            reasons: [],
            fallbackReasons: nextFallbackReasons,
            rejectedCandidates: [],
          },
        };
      }

      return {
        ...slot,
        explanation: {
          ...explanation,
          fallbackReasons: nextFallbackReasons,
        },
      };
    }),
  };
}

function buildFallbackExplanationReasons(
  relaxation: AutoBuildResult['relaxation'],
): AutoBuildSlotExplanationReason[] {
  if (!relaxation.usedFallback) {
    return [];
  }

  const reasons: AutoBuildSlotExplanationReason[] = [{ code: 'fallbackUsed' }];

  if (relaxation.droppedTypes.length) {
    reasons.push({
      code: 'fallbackDroppedTypes',
      params: { types: relaxation.droppedTypes, count: relaxation.droppedTypes.length },
    });
  }

  if (relaxation.droppedClasses.length) {
    reasons.push({
      code: 'fallbackDroppedClasses',
      params: { classes: relaxation.droppedClasses, count: relaxation.droppedClasses.length },
    });
  }

  if (relaxation.droppedCharacterTags.length) {
    reasons.push({
      code: 'fallbackDroppedCharacterTags',
      params: {
        tags: relaxation.droppedCharacterTags,
        count: relaxation.droppedCharacterTags.length,
      },
    });
  }

  if (relaxation.droppedCharacterNames.length) {
    reasons.push({
      code: 'fallbackDroppedCharacterNames',
      params: {
        names: relaxation.droppedCharacterNames,
        count: relaxation.droppedCharacterNames.length,
      },
    });
  }

  if (relaxation.allowedLeadersWithSuperEffects) {
    reasons.push({ code: 'fallbackAllowedSuperEffectLeaders' });
  }

  if (relaxation.ignoredLeaderSuperEffectScope) {
    reasons.push({ code: 'fallbackIgnoredLeaderSuperScope' });
  }

  if (relaxation.ignoredLeaderSuperSpecialCriteria) {
    reasons.push({
      code: 'fallbackIgnoredSuperSpecialCriteria',
      params: { names: relaxation.ignoredSuperSpecialCriteriaCharacterNames ?? [] },
    });
  }

  if (relaxation.ignoredSuperTandemCriteria) {
    reasons.push({
      code: 'fallbackIgnoredSuperTandemCriteria',
      params: { names: relaxation.ignoredSuperTandemCriteriaCharacterNames ?? [] },
    });
  }

  if (relaxation.ignoredCaptainAbilityCoverage) {
    reasons.push({ code: 'fallbackIgnoredCaptainAbilityCoverage' });
  }

  if (relaxation.downgradedCaptainAbilityCoverageToSimple) {
    reasons.push({ code: 'fallbackDowngradedCaptainAbilityCoverage' });
  }

  return reasons;
}

function cloneExplanationReason(
  reason: AutoBuildSlotExplanationReason,
): AutoBuildSlotExplanationReason {
  if (!reason.params) {
    return { code: reason.code };
  }

  return {
    code: reason.code,
    params: Object.fromEntries(
      Object.entries(reason.params).map(([key, value]) => [
        key,
        Array.isArray(value) ? [...value] : value,
      ]),
    ),
  };
}

export class AutoTeamBuildFallbackPlanner {
  private readonly zeroDropAttempts: AutoTeamBuildPlannedAttempt[];
  private readonly subsetCandidates: AutoTeamBuildSubsetCandidate[];
  private readonly projectedScheduledFallbackAttemptCount: number;
  private readonly scheduledAttempts: AutoTeamBuildScheduledAttempt[] = [];
  private readonly scheduledAttemptKeys = new Set<string>();
  private nextDispatchIndex = 0;
  private initialFallbacksScheduled = false;
  private attemptCountFinal = false;
  private readonly maxScheduledFallbackAttempts: number;
  private readonly baseSubsetInput: AutoBuildInput;

  public constructor(
    requestedInput: AutoBuildInput,
    records: CharacterDetailRecord[],
    options: AutoTeamBuildFallbackPlannerOptions = {},
  ) {
    const exactLeaderSuperEffectSlots =
      resolveRequestedLeaderSuperEffectMatchingSlots(requestedInput);
    const exactAttemptRequiresNoSuperLeaders =
      resolveExactAttemptRequiresNoSuperLeaders(requestedInput);
    const canRelaxLeaderSuperEffectScope =
      requestedInput.requireAllSlotsInLeaderSuperEffectScope;
    const canRelaxLeaderSuperSpecialCriteria =
      requestedInput.requireLeaderSuperSpecialCriteria;
    const canRelaxSuperTandemCriteria =
      requestedInput.requireSuperTandemCriteria;
    const canRelaxCaptainAbilityCoverage =
      (requestedInput.requireFullCaptainAbilityCoverage ||
        requestedInput.requireBothLeadersFullCaptainAbilityCoverage) &&
      !requestedInput.allowPartialCaptainAbilityCoverage;

    this.zeroDropAttempts = buildZeroDropFallbackAttempts(
      requestedInput,
      exactLeaderSuperEffectSlots,
      exactAttemptRequiresNoSuperLeaders,
      canRelaxLeaderSuperEffectScope,
      canRelaxLeaderSuperSpecialCriteria,
      canRelaxSuperTandemCriteria,
      canRelaxCaptainAbilityCoverage,
    );
    this.baseSubsetInput = buildBaseSubsetInput(
      requestedInput,
      canRelaxLeaderSuperEffectScope,
      canRelaxLeaderSuperSpecialCriteria,
      canRelaxSuperTandemCriteria,
      canRelaxCaptainAbilityCoverage,
    );
    this.subsetCandidates = buildSubsetCandidates(requestedInput, this.baseSubsetInput, records);
    this.maxScheduledFallbackAttempts = resolveMaxScheduledFallbackAttemptCount(
      requestedInput,
      this.zeroDropAttempts.length,
      options.maxScheduledFallbackAttempts,
    );
    this.projectedScheduledFallbackAttemptCount = resolveProjectedScheduledFallbackAttemptCount(
      this.zeroDropAttempts,
      this.subsetCandidates,
      this.maxScheduledFallbackAttempts,
    );
    this.attemptCountFinal = !this.hasPotentialFallbackAttempts();
  }

  public hasPotentialFallbackAttempts(): boolean {
    return this.zeroDropAttempts.length > 0 || this.subsetCandidates.length > 0;
  }

  public getTotalAttempts(): number {
    return 1 + this.scheduledAttempts.length;
  }

  public getProjectedTotalAttempts(): number {
    return 1 + this.projectedScheduledFallbackAttemptCount;
  }

  public isAttemptCountFinal(): boolean {
    return this.attemptCountFinal;
  }

  public getScheduledFallbackAttemptCount(): number {
    return this.scheduledAttempts.length;
  }

  public hasPendingScheduledAttempts(): boolean {
    return this.nextDispatchIndex < this.scheduledAttempts.length;
  }

  public getPendingScheduledFallbackAttemptCategories(): AutoTeamBuildFallbackAttemptCategory[] {
    return this.scheduledAttempts.slice(this.nextDispatchIndex).map((attempt) => attempt.category);
  }

  public scheduleInitialFallbackAttempts(): void {
    if (this.initialFallbacksScheduled) {
      return;
    }

    this.initialFallbacksScheduled = true;
    this.zeroDropAttempts.forEach((attempt) => {
      if (this.scheduledAttempts.length < this.maxScheduledFallbackAttempts) {
        this.enqueueScheduledAttempt(attempt, 'meta', []);
      }
    });
    this.subsetCandidates.forEach((candidate) => {
      if (this.scheduledAttempts.length < this.maxScheduledFallbackAttempts) {
        this.enqueueScheduledAttempt(
          candidate.attempt,
          candidate.category,
          candidate.droppedFilterIds,
        );
      }
    });
    this.refreshAttemptCountFinal();
  }

  public takeNextScheduledAttempt(): AutoTeamBuildScheduledAttempt | null {
    const nextAttempt = this.scheduledAttempts[this.nextDispatchIndex] ?? null;

    if (nextAttempt) {
      this.nextDispatchIndex += 1;
    }

    return nextAttempt;
  }

  public recordFailedFallbackAttempt(attempt: AutoTeamBuildScheduledAttempt): void {
    void attempt;
    this.refreshAttemptCountFinal();
  }

  private enqueueScheduledAttempt(
    attempt: AutoTeamBuildPlannedAttempt,
    category: AutoTeamBuildFallbackAttemptCategory,
    droppedFilterIds: string[],
    pairId?: string,
  ): void {
    const key = buildFallbackAttemptKey(attempt);

    if (this.scheduledAttemptKeys.has(key)) {
      return;
    }

    this.scheduledAttemptKeys.add(key);
    this.scheduledAttempts.push({
      ...attempt,
      sequence: this.scheduledAttempts.length,
      category,
      droppedFilterIds: [...droppedFilterIds],
    });

    void pairId;
  }

  private refreshAttemptCountFinal(): void {
    if (!this.hasPotentialFallbackAttempts()) {
      this.attemptCountFinal = true;
      return;
    }

    if (!this.initialFallbacksScheduled) {
      this.attemptCountFinal = false;
      return;
    }

    this.attemptCountFinal = true;
  }
}

export function createAutoTeamBuildFallbackPlanner(
  requestedInput: AutoBuildInput,
  records: CharacterDetailRecord[],
  options: AutoTeamBuildFallbackPlannerOptions = {},
): AutoTeamBuildFallbackPlanner {
  return new AutoTeamBuildFallbackPlanner(requestedInput, records, options);
}

function resolveProjectedScheduledFallbackAttemptCount(
  zeroDropAttempts: AutoTeamBuildPlannedAttempt[],
  subsetCandidates: AutoTeamBuildSubsetCandidate[],
  maxScheduledFallbackAttempts: number,
): number {
  if (maxScheduledFallbackAttempts <= 0) {
    return 0;
  }

  const scheduledAttemptKeys = new Set<string>();
  let scheduledAttemptCount = 0;
  const tryScheduleAttempt = (attempt: AutoTeamBuildPlannedAttempt): void => {
    if (scheduledAttemptCount >= maxScheduledFallbackAttempts) {
      return;
    }

    const key = buildFallbackAttemptKey(attempt);

    if (scheduledAttemptKeys.has(key)) {
      return;
    }

    scheduledAttemptKeys.add(key);
    scheduledAttemptCount += 1;
  };

  zeroDropAttempts.forEach((attempt) => {
    tryScheduleAttempt(attempt);
  });
  subsetCandidates.forEach((candidate) => {
    tryScheduleAttempt(candidate.attempt);
  });
  return scheduledAttemptCount;
}

function buildZeroDropFallbackAttempts(
  requestedInput: AutoBuildInput,
  exactLeaderSuperEffectSlots: number | null,
  exactAttemptRequiresNoSuperLeaders: boolean,
  canRelaxLeaderSuperEffectScope: boolean,
  canRelaxLeaderSuperSpecialCriteria: boolean,
  canRelaxSuperTandemCriteria: boolean,
  canRelaxCaptainAbilityCoverage: boolean,
): AutoTeamBuildPlannedAttempt[] {
  const relaxationOptions: AutoTeamBuildZeroDropRelaxationOption[] = [];

  if (exactLeaderSuperEffectSlots === null && exactAttemptRequiresNoSuperLeaders) {
    relaxationOptions.push({
      apply: (input) => ({ ...input }),
      allowedLeadersWithSuperEffects: true,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: false,
    });
  }

  if (canRelaxLeaderSuperEffectScope) {
    relaxationOptions.push({
      apply: (input) => ({
        ...input,
        requireAllSlotsInLeaderSuperEffectScope: false,
        minimumLeaderSuperEffectMatchingSlots: null,
      }),
      allowedLeadersWithSuperEffects: false,
      ignoredLeaderSuperEffectScope: true,
      ignoredLeaderSuperSpecialCriteria: false,
    });
  }

  if (canRelaxLeaderSuperSpecialCriteria) {
    relaxationOptions.push({
      apply: (input) => ({
        ...input,
        requireLeaderSuperSpecialCriteria: false,
      }),
      allowedLeadersWithSuperEffects: exactLeaderSuperEffectSlots === null,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: true,
    });
  }

  if (canRelaxSuperTandemCriteria) {
    relaxationOptions.push({
      apply: (input) => ({
        ...input,
        requireSuperTandemCriteria: false,
      }),
      allowedLeadersWithSuperEffects: exactLeaderSuperEffectSlots === null && exactAttemptRequiresNoSuperLeaders,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: false,
    });
  }

  if (canRelaxCaptainAbilityCoverage) {
    relaxationOptions.push({
      apply: (input) => ({
        ...input,
        requireBothLeadersFullCaptainAbilityCoverage: false,
        allowPartialCaptainAbilityCoverage: true,
      }),
      allowedLeadersWithSuperEffects: false,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: false,
    });
  }

  return dedupeFallbackAttempts(
    buildZeroDropRelaxationOptionSubsets(relaxationOptions).map((options) =>
      buildZeroDropFallbackAttempt(requestedInput, options),
    ),
  );
}

function buildZeroDropRelaxationOptionSubsets(
  options: AutoTeamBuildZeroDropRelaxationOption[],
): AutoTeamBuildZeroDropRelaxationOption[][] {
  const subsets: AutoTeamBuildZeroDropRelaxationOption[][] = [];

  for (let mask = 1; mask < 1 << options.length; mask += 1) {
    subsets.push(options.filter((_, index) => (mask & (1 << index)) !== 0));
  }

  return subsets.sort((left, right) => left.length - right.length);
}

function buildZeroDropFallbackAttempt(
  requestedInput: AutoBuildInput,
  options: AutoTeamBuildZeroDropRelaxationOption[],
): AutoTeamBuildPlannedAttempt {
  const input = options.reduce((nextInput, option) => option.apply(nextInput), requestedInput);

  return {
    input,
    requireLeadersWithoutSuperEffects: false,
    allowedLeadersWithSuperEffects: options.some((option) => option.allowedLeadersWithSuperEffects),
    droppedTypes: [],
    droppedClasses: [],
    droppedCharacterTags: [],
    droppedCharacterNames: [],
    ignoredLeaderSuperEffectScope: options.some(
      (option) => option.ignoredLeaderSuperEffectScope,
    ),
    ignoredLeaderSuperSpecialCriteria: options.some(
      (option) => option.ignoredLeaderSuperSpecialCriteria,
    ),
  };
}

function buildBaseSubsetInput(
  requestedInput: AutoBuildInput,
  canRelaxLeaderSuperEffectScope: boolean,
  canRelaxLeaderSuperSpecialCriteria: boolean,
  canRelaxSuperTandemCriteria: boolean,
  canRelaxCaptainAbilityCoverage: boolean,
): AutoBuildInput {
  return {
    ...requestedInput,
    requireAllSlotsInLeaderSuperEffectScope: canRelaxLeaderSuperEffectScope
      ? false
      : requestedInput.requireAllSlotsInLeaderSuperEffectScope,
    minimumLeaderSuperEffectMatchingSlots: canRelaxLeaderSuperEffectScope
      ? null
      : requestedInput.minimumLeaderSuperEffectMatchingSlots,
    requireLeaderSuperSpecialCriteria: canRelaxLeaderSuperSpecialCriteria
      ? false
      : requestedInput.requireLeaderSuperSpecialCriteria,
    requireSuperTandemCriteria: canRelaxSuperTandemCriteria
      ? false
      : requestedInput.requireSuperTandemCriteria,
    requireBothLeadersFullCaptainAbilityCoverage: canRelaxCaptainAbilityCoverage
      ? false
      : requestedInput.requireBothLeadersFullCaptainAbilityCoverage,
    allowPartialCaptainAbilityCoverage: canRelaxCaptainAbilityCoverage
      ? true
      : requestedInput.allowPartialCaptainAbilityCoverage,
  };
}

function buildSubsetCandidates(
  requestedInput: AutoBuildInput,
  baseInput: AutoBuildInput,
  records: CharacterDetailRecord[],
): AutoTeamBuildSubsetCandidate[] {
  const filterDescriptors = buildSortedFilterDropDescriptors(requestedInput, records);
  const supportByFilterId = new Map(
    filterDescriptors.map((descriptor) => [descriptor.id, descriptor.support] as const),
  );
  const candidates: AutoTeamBuildSubsetCandidate[] = [];
  const descriptorDropSubsets = buildDescriptorDropSubsets(filterDescriptors);

  for (const droppedFilterIds of descriptorDropSubsets) {
    const droppedFilterIdSet = new Set(droppedFilterIds);
    const nextTypes = requestedInput.types.filter(
      (type) => !droppedFilterIdSet.has(buildDroppedFilterId('type', type)),
    );

    if (!nextTypes.length) {
      continue;
    }

    const nextClasses = requestedInput.selectedClasses.filter(
      (selectedClass) => !droppedFilterIdSet.has(buildDroppedFilterId('class', selectedClass)),
    );
    const selectedCharacterTags = requestedInput.selectedCharacterTags ?? [];
    const selectedCharacterNames = requestedInput.selectedCharacterNames ?? [];
    const nextCharacterTags = selectedCharacterTags.filter(
      (selectedTag) => !droppedFilterIdSet.has(buildDroppedFilterId('characterTag', selectedTag)),
    );
    const nextCharacterNames = selectedCharacterNames.filter(
      (selectedName) => !droppedFilterIdSet.has(buildDroppedFilterId('characterName', selectedName)),
    );

    candidates.push({
      attempt: buildSubsetAttempt(
        requestedInput,
        baseInput,
        nextTypes,
        nextClasses,
        nextCharacterTags,
        nextCharacterNames,
      ),
      category: resolveSubsetAttemptCategory(droppedFilterIds.length),
      droppedFilterIds,
      droppedCount: droppedFilterIds.length,
      droppedSupport: droppedFilterIds.reduce(
        (sum, filterId) => sum + (supportByFilterId.get(filterId) ?? 0),
        0,
      ),
      remainingFilterCount:
        nextTypes.length + nextClasses.length + nextCharacterTags.length + nextCharacterNames.length,
    });
  }

  return dedupeSubsetCandidates(
    candidates.sort((left, right) => {
      if (left.droppedCount !== right.droppedCount) {
        return left.droppedCount - right.droppedCount;
      }

      if (left.remainingFilterCount !== right.remainingFilterCount) {
        return right.remainingFilterCount - left.remainingFilterCount;
      }

      if (left.droppedSupport !== right.droppedSupport) {
        return left.droppedSupport - right.droppedSupport;
      }

      return left.droppedFilterIds.join('|').localeCompare(right.droppedFilterIds.join('|'));
    }),
  );
}

function buildSortedFilterDropDescriptors(
  requestedInput: AutoBuildInput,
  records: CharacterDetailRecord[],
): AutoTeamBuildFilterDropDescriptor[] {
  const typeDescriptors: AutoTeamBuildFilterDropDescriptor[] =
    requestedInput.types.length > 1 && !shouldTreatSelectedTypesAsNeutral(requestedInput)
      ? requestedInput.types.map((type) => ({
          id: buildDroppedFilterId('type', type),
          kind: 'type',
          value: type,
          support: resolveTypeSupport(records, type),
        }))
      : [];
  const classDescriptors = shouldTreatSelectedClassesAsNeutral(requestedInput)
    ? []
    : requestedInput.selectedClasses.map((selectedClass) => ({
        id: buildDroppedFilterId('class', selectedClass),
        kind: 'class' as const,
        value: selectedClass,
        support: resolveClassSupport(records, selectedClass),
      }));
  const characterTagDescriptors: AutoTeamBuildFilterDropDescriptor[] =
    (requestedInput.selectedCharacterTags ?? []).length > 0
      ? (requestedInput.selectedCharacterTags ?? []).map((selectedTag) => ({
          id: buildDroppedFilterId('characterTag', selectedTag),
          kind: 'characterTag',
          value: selectedTag,
          support: resolveCharacterTagSupport(records, selectedTag),
        }))
      : [];
  const characterNameDescriptors: AutoTeamBuildFilterDropDescriptor[] =
    (requestedInput.selectedCharacterNames ?? []).length > 0
      ? (requestedInput.selectedCharacterNames ?? []).map((selectedName) => ({
          id: buildDroppedFilterId('characterName', selectedName),
          kind: 'characterName',
          value: selectedName,
          support: resolveCharacterNameSupport(records, selectedName),
        }))
      : [];

  return [
    ...typeDescriptors,
    ...classDescriptors,
    ...characterTagDescriptors,
    ...characterNameDescriptors,
  ].sort(compareFilterDescriptors);
}

function buildSubsetAttempt(
  requestedInput: AutoBuildInput,
  baseInput: AutoBuildInput,
  nextTypes: AutoTeamBuilderType[],
  nextClasses: string[],
  nextCharacterTags: string[],
  nextCharacterNames: string[],
): AutoTeamBuildPlannedAttempt {
  return {
    input: {
      ...requestedInput,
      types: nextTypes,
      selectedClasses: nextClasses,
      selectedCharacterTags: nextCharacterTags,
      selectedCharacterNames: nextCharacterNames,
      requireAllSlotsInLeaderSuperEffectScope: baseInput.requireAllSlotsInLeaderSuperEffectScope,
      minimumLeaderSuperEffectMatchingSlots: baseInput.minimumLeaderSuperEffectMatchingSlots,
      requireLeaderSuperSpecialCriteria: baseInput.requireLeaderSuperSpecialCriteria,
      requireSuperTandemCriteria: baseInput.requireSuperTandemCriteria,
      requireFullCaptainAbilityCoverage: baseInput.requireFullCaptainAbilityCoverage,
      requireBothLeadersFullCaptainAbilityCoverage:
        baseInput.requireBothLeadersFullCaptainAbilityCoverage,
      allowPartialCaptainAbilityCoverage: baseInput.allowPartialCaptainAbilityCoverage,
    },
    requireLeadersWithoutSuperEffects: false,
    allowedLeadersWithSuperEffects: shouldReportAllowedLeadersWithSuperEffects(
      requestedInput,
      false,
    ),
    droppedTypes: requestedInput.types.filter((type) => !nextTypes.includes(type)),
    droppedClasses: requestedInput.selectedClasses.filter(
      (selectedClass) => !nextClasses.includes(selectedClass),
    ),
    droppedCharacterTags: (requestedInput.selectedCharacterTags ?? []).filter(
      (selectedTag) => !nextCharacterTags.includes(selectedTag),
    ),
    droppedCharacterNames: (requestedInput.selectedCharacterNames ?? []).filter(
      (selectedName) => !nextCharacterNames.includes(selectedName),
    ),
    ignoredLeaderSuperEffectScope:
      requestedInput.requireAllSlotsInLeaderSuperEffectScope &&
      !baseInput.requireAllSlotsInLeaderSuperEffectScope,
    ignoredLeaderSuperSpecialCriteria:
      requestedInput.requireLeaderSuperSpecialCriteria &&
      !baseInput.requireLeaderSuperSpecialCriteria,
  };
}

function resolveSubsetAttemptCategory(
  droppedFilterCount: number,
): Exclude<AutoTeamBuildFallbackAttemptCategory, 'meta'> {
  if (droppedFilterCount === 1) {
    return 'single';
  }

  if (droppedFilterCount === 2) {
    return 'double';
  }

  return 'subset';
}

function resolveMaxScheduledFallbackAttemptCount(
  requestedInput: AutoBuildInput,
  zeroDropAttemptCount: number,
  configuredMaxScheduledFallbackAttempts?: number,
): number {
  const theoreticalSubsetTotalAttempts = resolveTheoreticalSubsetTotalAttempts(requestedInput);
  const theoreticalSubsetFallbackAttempts = Math.max(theoreticalSubsetTotalAttempts - 1, 0);
  const dynamicMaxScheduledFallbackAttempts = Math.max(
    zeroDropAttemptCount,
    Math.min(MAX_DYNAMIC_SCHEDULED_FALLBACK_ATTEMPTS, theoreticalSubsetFallbackAttempts),
  );

  if (configuredMaxScheduledFallbackAttempts === undefined) {
    return dynamicMaxScheduledFallbackAttempts;
  }

  return Math.max(
    zeroDropAttemptCount,
    Math.min(
      dynamicMaxScheduledFallbackAttempts,
      Math.max(0, Math.floor(configuredMaxScheduledFallbackAttempts)),
    ),
  );
}

function resolveTheoreticalSubsetTotalAttempts(input: AutoBuildInput): number {
  const relaxedFilterCount =
    (shouldTreatSelectedTypesAsNeutral(input) ? 0 : input.types.length) +
    (shouldTreatSelectedClassesAsNeutral(input) ? 0 : input.selectedClasses.length) +
    (input.selectedCharacterTags ?? []).length +
    (input.selectedCharacterNames ?? []).length;

  return resolveBoundedSubsetCount(relaxedFilterCount, true);
}

function resolveBoundedSubsetCount(length: number, excludeEmptySubset: boolean): number {
  let total = 1;

  for (let index = 0; index < length; index += 1) {
    if (total >= MAX_DYNAMIC_TOTAL_ATTEMPTS) {
      return MAX_DYNAMIC_TOTAL_ATTEMPTS;
    }

    total *= 2;
  }

  if (!excludeEmptySubset) {
    return Math.min(total, MAX_DYNAMIC_TOTAL_ATTEMPTS);
  }

  return Math.max(Math.min(total, MAX_DYNAMIC_TOTAL_ATTEMPTS) - 1, 0);
}

function buildDescriptorDropSubsets(
  descriptors: AutoTeamBuildFilterDropDescriptor[],
): string[][] {
  const subsets: string[][] = [];

  const visit = (index: number, selectedIds: string[]): void => {
    if (subsets.length >= MAX_DYNAMIC_TOTAL_ATTEMPTS) {
      return;
    }

    if (index >= descriptors.length) {
      if (selectedIds.length > 0) {
        subsets.push([...selectedIds]);
      }

      return;
    }

    visit(index + 1, selectedIds);

    if (subsets.length >= MAX_DYNAMIC_TOTAL_ATTEMPTS) {
      return;
    }

    selectedIds.push(descriptors[index]!.id);
    visit(index + 1, selectedIds);
    selectedIds.pop();
  };

  visit(0, []);

  return subsets;
}
function buildDroppedFilterId(kind: AutoTeamBuildDroppedFilterKind, value: string): string {
  return `${kind}:${value}`;
}

function compareFilterDescriptors(
  left: AutoTeamBuildFilterDropDescriptor,
  right: AutoTeamBuildFilterDropDescriptor,
): number {
  if (left.support !== right.support) {
    return left.support - right.support;
  }

  if (left.kind !== right.kind) {
    return resolveDroppedFilterKindOrder(left.kind) - resolveDroppedFilterKindOrder(right.kind);
  }

  return left.value.localeCompare(right.value);
}

function resolveDroppedFilterKindOrder(kind: AutoTeamBuildDroppedFilterKind): number {
  switch (kind) {
    case 'type':
      return 0;
    case 'class':
      return 1;
    case 'characterTag':
      return 2;
    case 'characterName':
      return 3;
  }
}

function dedupeFallbackAttempts(
  attempts: AutoTeamBuildPlannedAttempt[],
): AutoTeamBuildPlannedAttempt[] {
  const seenKeys = new Set<string>();

  return attempts.filter((attempt) => {
    const key = buildFallbackAttemptKey(attempt);

    if (seenKeys.has(key)) {
      return false;
    }

    seenKeys.add(key);
    return true;
  });
}

function dedupeSubsetCandidates(
  candidates: AutoTeamBuildSubsetCandidate[],
): AutoTeamBuildSubsetCandidate[] {
  const seenKeys = new Set<string>();

  return candidates.filter((candidate) => {
    const key = buildFallbackAttemptKey(candidate.attempt);

    if (seenKeys.has(key)) {
      return false;
    }

    seenKeys.add(key);
    return true;
  });
}

function buildFallbackAttemptKey(attempt: AutoTeamBuildPlannedAttempt): string {
  return [
    attempt.input.types.join('|'),
    attempt.input.selectedClasses.join('|'),
    (attempt.input.selectedCharacterTags ?? []).join('|'),
    (attempt.input.selectedCharacterNames ?? []).join('|'),
    attempt.input.requireAllSelectedCharacterTagsInTeam ? 'strict-tags' : 'relaxed-tags',
    attempt.input.requireAllSelectedCharacterNamesInTeam ? 'strict-names' : 'relaxed-names',
    attempt.input.requireLeaderSuperSpecialCriteria ? '1' : '0',
    attempt.input.strictSuperSpecialCriteriaCoverage
      ? 'strict-super-special'
      : 'best-effort-super-special',
    attempt.input.requireSuperTandemCriteria ? '1' : '0',
    attempt.input.strictSuperTandemCriteriaCoverage
      ? 'strict-super-tandem'
      : 'best-effort-super-tandem',
    attempt.input.requireAllSlotsInLeaderSuperEffectScope ? '1' : '0',
    attempt.input.requireFullCaptainAbilityCoverage ? 'full-captain' : 'simple-captain',
    attempt.input.requireBothLeadersFullCaptainAbilityCoverage
      ? 'both-leaders-captain'
      : 'leader-scope-captain',
    attempt.input.minimumLeaderSuperEffectMatchingSlots ?? 'null',
    attempt.input.allowPartialCaptainAbilityCoverage ? 'partial-captain' : 'strict-captain',
    attempt.requireLeadersWithoutSuperEffects ? '1' : '0',
  ].join('::');
}

function resolveExactAttemptRequiresNoSuperLeaders(input: AutoBuildInput): boolean {
  return !input.requireAllSlotsInLeaderSuperEffectScope && !hasStrictSuperCriteriaCoverage(input);
}

function hasStrictSuperCriteriaCoverage(input: AutoBuildInput): boolean {
  return Boolean(input.strictSuperSpecialCriteriaCoverage || input.strictSuperTandemCriteriaCoverage);
}

function shouldReportAllowedLeadersWithSuperEffects(
  input: AutoBuildInput,
  requireLeadersWithoutSuperEffects: boolean,
): boolean {
  return Boolean(
    !input.requireAllSlotsInLeaderSuperEffectScope &&
      !requireLeadersWithoutSuperEffects &&
      !hasStrictSuperCriteriaCoverage(input),
  );
}

function inputsMatch(left: AutoBuildInput, right: AutoBuildInput): boolean {
  return (
    sameOrderedValues(left.types, right.types) &&
    sameOrderedValues(left.selectedClasses, right.selectedClasses) &&
    sameOrderedValues(left.selectedCharacterTags ?? [], right.selectedCharacterTags ?? []) &&
    sameOrderedValues(left.selectedCharacterNames ?? [], right.selectedCharacterNames ?? []) &&
    Boolean(left.requireAllSelectedTypesInTeam) === Boolean(right.requireAllSelectedTypesInTeam) &&
    Boolean(left.requireAllSelectedClassesPerCharacter) ===
      Boolean(right.requireAllSelectedClassesPerCharacter) &&
    Boolean(left.requireAllSelectedCharacterTagsInTeam) ===
      Boolean(right.requireAllSelectedCharacterTagsInTeam) &&
    Boolean(left.requireAllSelectedCharacterNamesInTeam) ===
      Boolean(right.requireAllSelectedCharacterNamesInTeam) &&
    left.requireAllSlotsInLeaderSuperEffectScope ===
      right.requireAllSlotsInLeaderSuperEffectScope &&
    left.requireFullCaptainAbilityCoverage === right.requireFullCaptainAbilityCoverage &&
    left.requireBothLeadersFullCaptainAbilityCoverage ===
      right.requireBothLeadersFullCaptainAbilityCoverage &&
    Boolean(left.allowPartialCaptainAbilityCoverage) ===
      Boolean(right.allowPartialCaptainAbilityCoverage) &&
    left.minimumLeaderSuperEffectMatchingSlots === right.minimumLeaderSuperEffectMatchingSlots &&
    left.requireLeaderSuperSpecialCriteria === right.requireLeaderSuperSpecialCriteria &&
    left.strictSuperSpecialCriteriaCoverage === right.strictSuperSpecialCriteriaCoverage &&
    left.requireSuperTandemCriteria === right.requireSuperTandemCriteria &&
    left.strictSuperTandemCriteriaCoverage === right.strictSuperTandemCriteriaCoverage &&
    left.leaderCostRange.min === right.leaderCostRange.min &&
    left.leaderCostRange.max === right.leaderCostRange.max &&
    left.subCostRange.min === right.subCostRange.min &&
    left.subCostRange.max === right.subCostRange.max &&
    left.maxTotalCost === right.maxTotalCost
  );
}

function resolveRequestedLeaderSuperEffectMatchingSlots(input: AutoBuildInput): number | null {
  if (!input.requireAllSlotsInLeaderSuperEffectScope) {
    return null;
  }

  const requestedSlots = input.minimumLeaderSuperEffectMatchingSlots ?? AUTO_BUILD_TOTAL_SLOT_COUNT;
  return Math.max(2, Math.min(AUTO_BUILD_TOTAL_SLOT_COUNT, requestedSlots));
}

function sameOrderedValues<T>(left: T[], right: T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function satisfiesRequestedAutoTeamBuildCoverage(
  result: AutoBuildResult | null,
): result is AutoBuildResult {
  return Boolean(
    result &&
    (shouldTreatSelectedClassesAsNeutral(result.input) ||
      result.coverage.coversAllSelectedClasses) &&
    (shouldTreatSelectedTypesAsNeutral(result.input) ||
      result.coverage.coversAllSelectedTypes) &&
    (shouldTreatSelectedCharacterTagsAsNeutral(result.input) ||
      result.coverage.coversAllSelectedCharacterTags) &&
    (shouldTreatSelectedCharacterNamesAsNeutral(result.input) ||
      result.coverage.coversAllSelectedCharacterNames) &&
    result.coverage.abilityRequirements.matchesAll &&
    result.coverage.requiredCharacterGroups.matchesAll &&
    ((result.requestedInput.battleRequirements?.length ?? 0) === 0 ||
      result.coverage.battleRequirements?.matchesAll === true),
  );
}

function shouldTreatSelectedCharacterTagsAsNeutral(input: AutoBuildInput): boolean {
  return (input.selectedCharacterTags ?? []).length === 0;
}

function shouldTreatSelectedCharacterNamesAsNeutral(input: AutoBuildInput): boolean {
  return (input.selectedCharacterNames ?? []).length === 0;
}

function shouldTreatSelectedTypesAsNeutral(input: AutoBuildInput): boolean {
  return (
    !input.requireAllSelectedTypesInTeam &&
    sameUnorderedValues(input.types, AUTO_TEAM_BUILDER_TYPES)
  );
}

function shouldTreatSelectedClassesAsNeutral(input: AutoBuildInput): boolean {
  return (
    !input.requireAllSelectedClassesPerCharacter &&
    sameUnorderedValues(input.selectedClasses, AUTO_TEAM_BUILDER_CLASSES)
  );
}

function sameUnorderedValues<T>(left: readonly T[], right: readonly T[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const rightValues = new Set(right);
  return left.every((value) => rightValues.has(value));
}

function resolveClassSupport(records: CharacterDetailRecord[], selectedClass: string): number {
  const normalizedSelectedClass = selectedClass.toLowerCase();

  return records.filter((record) =>
    record.classes.some((recordClass) => recordClass.toLowerCase() === normalizedSelectedClass),
  ).length;
}

function resolveCharacterTagSupport(records: CharacterDetailRecord[], selectedTag: string): number {
  const normalizedSelectedTag = normalizeAutoBuildCharacterMatchKey(selectedTag);

  return records.filter((record) =>
    (record.detail.characterTags ?? []).some(
      (tag) => normalizeAutoBuildCharacterMatchKey(tag) === normalizedSelectedTag,
    ),
  ).length;
}

function resolveCharacterNameSupport(records: CharacterDetailRecord[], selectedName: string): number {
  const normalizedSelectedName = normalizeAutoBuildCharacterMatchKey(selectedName);

  return records.filter((record) =>
    resolveCharacterNameMatchKeys(record).some(
      (key) => key === normalizedSelectedName || key.includes(normalizedSelectedName),
    ),
  ).length;
}

function resolveCharacterNameMatchKeys(record: CharacterDetailRecord): string[] {
  return [
    ...new Set(
      [
        record.name,
        record.searchText ?? '',
        record.primaryClass,
        record.secondaryClass ?? '',
        record.type,
        ...record.classes,
        ...(record.detail.characterTags ?? []),
        ...resolveCharacterPartyConflictKeys(record),
      ]
        .flatMap((value) =>
          String(value ?? '')
            .split(',')
            .map((entry) => normalizeAutoBuildCharacterMatchKey(entry)),
        )
        .filter((value) => value.length > 0),
    ),
  ];
}

function resolveTypeSupport(
  records: CharacterDetailRecord[],
  selectedType: AutoTeamBuilderType,
): number {
  return records.filter((record) => resolveCharacterTypeTokens(record.type).includes(selectedType))
    .length;
}

export function normalizeSelectedTypes(
  selectedTypes: AutoTeamBuilderType[],
): AutoTeamBuilderType[] {
  return [...new Set(selectedTypes)].filter((type): type is AutoTeamBuilderType =>
    AUTO_TEAM_BUILDER_TYPES.includes(type),
  );
}
