import {
  AUTO_BUILD_TOTAL_SLOT_COUNT,
  AUTO_TEAM_BUILDER_CLASSES,
  AUTO_TEAM_BUILDER_TYPES,
  type AutoBuildInput,
  type AutoBuildProgressSnapshot,
  type AutoBuildResult,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import {
  buildAutoTeamResultFromPreparedContext,
  prepareAutoTeamBuildContext,
  resolveCharacterTypeTokens,
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

export interface AutoTeamBuildPlannedAttempt {
  input: AutoBuildInput;
  requireLeadersWithoutSuperEffects: boolean;
  allowedLeadersWithSuperEffects: boolean;
  droppedTypes: AutoTeamBuilderType[];
  droppedClasses: string[];
  ignoredLeaderSuperEffectScope: boolean;
  ignoredLeaderSuperSpecialCriteria: boolean;
}

type AutoTeamBuildDroppedFilterKind = 'type' | 'class';
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
  remainingTypeCount: number;
  remainingClassCount: number;
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
  const preparedContext = options.preparedContext ?? prepareAutoTeamBuildContext(records);
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
  emitProgress(options, timingState, {
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
  });

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
    const remainingCategories: AutoTeamBuildFallbackAttemptCategory[] = [
      plannedAttempt.category,
      ...planner.getPendingScheduledFallbackAttemptCategories(),
    ];
    emitProgress(options, timingState, {
      stage: 'fallbackAttempt',
      candidateCount: records.length,
      completedAttempts,
      totalAttempts: planner.getTotalAttempts(),
      attemptCountFinal: planner.isAttemptCountFinal(),
      remainingFallbackCategories: remainingCategories,
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
    });

    const fallbackStartedAt = timingState.now();
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

  options.onProgress?.({
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
  });
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
): AutoBuildResult | null {
  const attempt = buildAutoTeamResultFromPreparedContext(preparedContext, input, {
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
  });

  if (!attempt) {
    return null;
  }

  const allowedLeadersWithSuperEffects = Boolean(
    !requestedInput.requireAllSlotsInLeaderSuperEffectScope && !requireLeadersWithoutSuperEffects,
  );

  return {
    ...attempt,
    requestedInput,
    relaxation: {
      usedFallback: !inputsMatch(requestedInput, input) || allowedLeadersWithSuperEffects,
      droppedTypes: requestedInput.types.filter((type) => !input.types.includes(type)),
      droppedClasses: requestedInput.selectedClasses.filter(
        (selectedClass) => !input.selectedClasses.includes(selectedClass),
      ),
      minimumLeaderSuperEffectMatchingSlots: input.minimumLeaderSuperEffectMatchingSlots,
      allowedLeadersWithSuperEffects,
      ...(requestedInput.requireFullCaptainAbilityCoverage &&
      input.allowPartialCaptainAbilityCoverage &&
      !requestedInput.requireBothLeadersFullCaptainAbilityCoverage
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
      ignoredLeaderSuperSpecialCriteria: Boolean(
        requestedInput.requireLeaderSuperSpecialCriteria &&
        !input.requireLeaderSuperSpecialCriteria,
      ),
    },
    shipSelection: null,
  };
}

export class AutoTeamBuildFallbackPlanner {
  private readonly zeroDropAttempts: AutoTeamBuildPlannedAttempt[];
  private readonly subsetCandidates: AutoTeamBuildSubsetCandidate[];
  private readonly relaxedAttempts: AutoTeamBuildPlannedAttempt[];
  private readonly projectedScheduledFallbackAttemptCount: number;
  private readonly scheduledAttempts: AutoTeamBuildScheduledAttempt[] = [];
  private readonly scheduledAttemptKeys = new Set<string>();
  private nextDispatchIndex = 0;
  private initialFallbacksScheduled = false;
  private attemptCountFinal = false;
  private readonly maxScheduledFallbackAttempts: number;
  private readonly baseSubsetInput: AutoBuildInput;
  private readonly hasStrictConstraints: boolean;

  public constructor(
    private readonly requestedInput: AutoBuildInput,
    records: CharacterDetailRecord[],
    options: AutoTeamBuildFallbackPlannerOptions = {},
  ) {
    const exactLeaderSuperEffectSlots =
      resolveRequestedLeaderSuperEffectMatchingSlots(requestedInput);
    const exactAttemptRequiresNoSuperLeaders =
      resolveExactAttemptRequiresNoSuperLeaders(requestedInput);
    const canRelaxLeaderSuperSpecialCriteria =
      requestedInput.requireLeaderSuperSpecialCriteria && exactLeaderSuperEffectSlots === null;

    this.zeroDropAttempts = buildZeroDropFallbackAttempts(
      requestedInput,
      exactLeaderSuperEffectSlots,
      exactAttemptRequiresNoSuperLeaders,
      canRelaxLeaderSuperSpecialCriteria,
    );
    this.hasStrictConstraints = hasStrictAutoTeamBuildConstraints(requestedInput);
    this.baseSubsetInput = canRelaxLeaderSuperSpecialCriteria
      ? {
          ...requestedInput,
          requireLeaderSuperSpecialCriteria: false,
        }
      : requestedInput;
    this.subsetCandidates = this.hasStrictConstraints
      ? []
      : buildSubsetCandidates(requestedInput, this.baseSubsetInput, records);
    this.relaxedAttempts =
      requestedInput.requireFullCaptainAbilityCoverage &&
      !requestedInput.requireBothLeadersFullCaptainAbilityCoverage
        ? buildSimpleCaptainCoverageFallbackAttempts(
            requestedInput,
            exactAttemptRequiresNoSuperLeaders,
            this.zeroDropAttempts,
            this.subsetCandidates,
          )
        : [];
    this.maxScheduledFallbackAttempts = resolveMaxScheduledFallbackAttemptCount(
      requestedInput,
      this.zeroDropAttempts.length + this.relaxedAttempts.length,
      options.maxScheduledFallbackAttempts,
    );
    this.projectedScheduledFallbackAttemptCount = resolveProjectedScheduledFallbackAttemptCount(
      this.zeroDropAttempts,
      this.subsetCandidates,
      this.relaxedAttempts,
      this.maxScheduledFallbackAttempts,
    );
    this.attemptCountFinal = !this.hasPotentialFallbackAttempts();
  }

  public hasPotentialFallbackAttempts(): boolean {
    return (
      this.zeroDropAttempts.length > 0 ||
      this.subsetCandidates.length > 0 ||
      this.relaxedAttempts.length > 0
    );
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
    this.relaxedAttempts.forEach((attempt) => {
      if (this.scheduledAttempts.length < this.maxScheduledFallbackAttempts) {
        this.enqueueScheduledAttempt(attempt, attemptCategoryFromRelaxedAttempt(attempt), []);
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
  relaxedAttempts: AutoTeamBuildPlannedAttempt[],
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
  relaxedAttempts.forEach((attempt) => {
    tryScheduleAttempt(attempt);
  });

  return scheduledAttemptCount;
}

function buildSimpleCaptainCoverageFallbackAttempts(
  requestedInput: AutoBuildInput,
  exactAttemptRequiresNoSuperLeaders: boolean,
  zeroDropAttempts: AutoTeamBuildPlannedAttempt[],
  subsetCandidates: AutoTeamBuildSubsetCandidate[],
): AutoTeamBuildPlannedAttempt[] {
  const exactSimpleAttempt: AutoTeamBuildPlannedAttempt = {
    input: downgradeCaptainCoverageInputToSimple(requestedInput),
    requireLeadersWithoutSuperEffects: exactAttemptRequiresNoSuperLeaders,
    allowedLeadersWithSuperEffects: false,
    droppedTypes: [],
    droppedClasses: [],
    ignoredLeaderSuperEffectScope: false,
    ignoredLeaderSuperSpecialCriteria: false,
  };
  const simpleCopies = [
    exactSimpleAttempt,
    ...zeroDropAttempts.map((attempt) => downgradeCaptainCoverageAttemptToSimple(attempt)),
    ...subsetCandidates.map((candidate) =>
      downgradeCaptainCoverageAttemptToSimple(candidate.attempt),
    ),
  ];

  return dedupeFallbackAttempts(simpleCopies);
}

function downgradeCaptainCoverageAttemptToSimple(
  attempt: AutoTeamBuildPlannedAttempt,
): AutoTeamBuildPlannedAttempt {
  return {
    ...attempt,
    input: downgradeCaptainCoverageInputToSimple(attempt.input),
  };
}

function downgradeCaptainCoverageInputToSimple(input: AutoBuildInput): AutoBuildInput {
  const { allowPartialCaptainAbilityCoverage, ...strictInput } = input;

  void allowPartialCaptainAbilityCoverage;

  return {
    ...strictInput,
    requireFullCaptainAbilityCoverage: false,
  };
}

function attemptCategoryFromRelaxedAttempt(
  attempt: AutoTeamBuildPlannedAttempt,
): AutoTeamBuildFallbackAttemptCategory {
  const droppedFilterCount = attempt.droppedTypes.length + attempt.droppedClasses.length;

  return droppedFilterCount === 0 ? 'meta' : resolveSubsetAttemptCategory(droppedFilterCount);
}

function buildZeroDropFallbackAttempts(
  requestedInput: AutoBuildInput,
  exactLeaderSuperEffectSlots: number | null,
  exactAttemptRequiresNoSuperLeaders: boolean,
  canRelaxLeaderSuperSpecialCriteria: boolean,
): AutoTeamBuildPlannedAttempt[] {
  const fixedAttempts: AutoTeamBuildPlannedAttempt[] = [];

  if (exactLeaderSuperEffectSlots !== null) {
    return fixedAttempts;
  }

  if (exactLeaderSuperEffectSlots === null && exactAttemptRequiresNoSuperLeaders) {
    fixedAttempts.push({
      input: {
        ...requestedInput,
      },
      requireLeadersWithoutSuperEffects: false,
      allowedLeadersWithSuperEffects: true,
      droppedTypes: [],
      droppedClasses: [],
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: false,
    });
  }

  if (canRelaxLeaderSuperSpecialCriteria) {
    fixedAttempts.push({
      input: {
        ...requestedInput,
        requireLeaderSuperSpecialCriteria: false,
      },
      requireLeadersWithoutSuperEffects: false,
      allowedLeadersWithSuperEffects: true,
      droppedTypes: [],
      droppedClasses: [],
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: true,
    });
  }

  return dedupeFallbackAttempts(fixedAttempts);
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
  const typeSubsets = shouldTreatSelectedTypesAsNeutral(requestedInput)
    ? [baseInput.types]
    : buildSubsets(baseInput.types, 1);
  const classSubsets = shouldTreatSelectedClassesAsNeutral(requestedInput)
    ? [baseInput.selectedClasses]
    : buildSubsets(baseInput.selectedClasses, 0);
  const candidates: AutoTeamBuildSubsetCandidate[] = [];

  for (const types of typeSubsets) {
    for (const selectedClasses of classSubsets) {
      if (
        sameOrderedValues(types, baseInput.types) &&
        sameOrderedValues(selectedClasses, baseInput.selectedClasses)
      ) {
        continue;
      }

      const droppedTypes = requestedInput.types.filter((type) => !types.includes(type));
      const droppedClasses = requestedInput.selectedClasses.filter(
        (selectedClass) => !selectedClasses.includes(selectedClass),
      );
      const droppedFilterIds = [
        ...droppedTypes.map((type) => buildDroppedFilterId('type', type)),
        ...droppedClasses.map((selectedClass) => buildDroppedFilterId('class', selectedClass)),
      ];

      if (droppedFilterIds.length === 0) {
        continue;
      }

      candidates.push({
        attempt: buildSubsetAttempt(requestedInput, baseInput, types, selectedClasses),
        category: resolveSubsetAttemptCategory(droppedFilterIds.length),
        droppedFilterIds,
        droppedCount: droppedFilterIds.length,
        droppedSupport: droppedFilterIds.reduce(
          (sum, filterId) => sum + (supportByFilterId.get(filterId) ?? 0),
          0,
        ),
        remainingTypeCount: types.length,
        remainingClassCount: selectedClasses.length,
      });
    }
  }

  return dedupeSubsetCandidates(
    candidates.sort((left, right) => {
      if (left.droppedCount !== right.droppedCount) {
        return left.droppedCount - right.droppedCount;
      }

      if (left.remainingTypeCount !== right.remainingTypeCount) {
        return right.remainingTypeCount - left.remainingTypeCount;
      }

      if (left.remainingClassCount !== right.remainingClassCount) {
        return right.remainingClassCount - left.remainingClassCount;
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

  return [...typeDescriptors, ...classDescriptors].sort(compareFilterDescriptors);
}

function buildSubsetAttempt(
  requestedInput: AutoBuildInput,
  baseInput: AutoBuildInput,
  nextTypes: AutoTeamBuilderType[],
  nextClasses: string[],
): AutoTeamBuildPlannedAttempt {
  return {
    input: {
      ...requestedInput,
      types: nextTypes,
      selectedClasses: nextClasses,
      requireAllSlotsInLeaderSuperEffectScope: baseInput.requireAllSlotsInLeaderSuperEffectScope,
      minimumLeaderSuperEffectMatchingSlots: baseInput.minimumLeaderSuperEffectMatchingSlots,
      requireLeaderSuperSpecialCriteria: baseInput.requireLeaderSuperSpecialCriteria,
    },
    requireLeadersWithoutSuperEffects: false,
    allowedLeadersWithSuperEffects: !requestedInput.requireAllSlotsInLeaderSuperEffectScope,
    droppedTypes: requestedInput.types.filter((type) => !nextTypes.includes(type)),
    droppedClasses: requestedInput.selectedClasses.filter(
      (selectedClass) => !nextClasses.includes(selectedClass),
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
  const typeSubsetCount = shouldTreatSelectedTypesAsNeutral(input)
    ? 1
    : resolveBoundedSubsetCount(input.types.length, true);
  const classSubsetCount = shouldTreatSelectedClassesAsNeutral(input)
    ? 1
    : resolveBoundedSubsetCount(input.selectedClasses.length, false);

  return multiplyWithCap(typeSubsetCount, classSubsetCount, MAX_DYNAMIC_TOTAL_ATTEMPTS);
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

function multiplyWithCap(left: number, right: number, cap: number): number {
  if (left === 0 || right === 0) {
    return 0;
  }

  if (left > Math.floor(cap / right)) {
    return cap;
  }

  return left * right;
}

function buildSubsets<T>(values: T[], minLength: number): T[][] {
  const subsets: T[][] = [];

  for (let mask = 0; mask < 1 << values.length; mask += 1) {
    const subset = values.filter((_, index) => (mask & (1 << index)) !== 0);

    if (subset.length >= minLength) {
      subsets.push(subset);
    }
  }

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
    return left.kind === 'type' ? -1 : 1;
  }

  return left.value.localeCompare(right.value);
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
    attempt.input.requireLeaderSuperSpecialCriteria ? '1' : '0',
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

export function hasStrictAutoTeamBuildConstraints(input: AutoBuildInput): boolean {
  return Boolean(
    input.requireAllSelectedTypesInTeam || input.requireAllSelectedClassesPerCharacter,
  );
}

function resolveExactAttemptRequiresNoSuperLeaders(input: AutoBuildInput): boolean {
  return !input.requireAllSlotsInLeaderSuperEffectScope;
}

function inputsMatch(left: AutoBuildInput, right: AutoBuildInput): boolean {
  return (
    sameOrderedValues(left.types, right.types) &&
    sameOrderedValues(left.selectedClasses, right.selectedClasses) &&
    left.requireAllSlotsInLeaderSuperEffectScope ===
      right.requireAllSlotsInLeaderSuperEffectScope &&
    left.requireFullCaptainAbilityCoverage === right.requireFullCaptainAbilityCoverage &&
    left.requireBothLeadersFullCaptainAbilityCoverage ===
      right.requireBothLeadersFullCaptainAbilityCoverage &&
    Boolean(left.allowPartialCaptainAbilityCoverage) ===
      Boolean(right.allowPartialCaptainAbilityCoverage) &&
    left.minimumLeaderSuperEffectMatchingSlots === right.minimumLeaderSuperEffectMatchingSlots &&
    left.requireLeaderSuperSpecialCriteria === right.requireLeaderSuperSpecialCriteria &&
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
    (shouldTreatSelectedClassesAsNeutral(result.requestedInput) ||
      result.coverage.coversAllSelectedClasses) &&
    (shouldTreatSelectedTypesAsNeutral(result.requestedInput) ||
      result.coverage.coversAllSelectedTypes) &&
    result.coverage.abilityRequirements.matchesAll &&
    result.coverage.requiredCharacterGroups.matchesAll &&
    ((result.requestedInput.battleRequirements?.length ?? 0) === 0 ||
      result.coverage.battleRequirements?.matchesAll === true),
  );
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
