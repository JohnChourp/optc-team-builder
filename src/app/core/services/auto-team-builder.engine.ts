import {
  AUTO_BUILD_TOTAL_SLOT_COUNT,
  AUTO_TEAM_BUILDER_TYPES,
  type AutoBuildInput,
  type AutoBuildProgressSnapshot,
  type AutoBuildResult,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import { buildAutoTeamResult, resolveCharacterTypeTokens } from './auto-team-builder.utils';

export interface AutoTeamBuildSearchOptions {
  onProgress?: (snapshot: AutoBuildProgressSnapshot) => void;
  isCancelled?: () => boolean;
  now?: () => number;
}

export interface AutoTeamBuildPlannedAttempt {
  input: AutoBuildInput;
  droppedTypes: AutoTeamBuilderType[];
  droppedClasses: string[];
  ignoredLeaderSuperEffectScope: boolean;
  ignoredLeaderSuperSpecialCriteria: boolean;
}

interface AutoTeamBuildTimingState {
  searchStartedAt: number;
  totalCompletedFallbackMs: number;
  completedFallbackAttempts: number;
  now: () => number;
}

type AutoBuildProgressSnapshotBase = Omit<
  AutoBuildProgressSnapshot,
  'elapsedMs' | 'estimatedRemainingMs' | 'averageFallbackAttemptMs' | 'completedFallbackAttempts'
>;

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

  assertNotCancelled(options);
  emitProgress(options, timingState, {
    stage: 'preparingSearch',
    candidateCount: records.length,
    completedAttempts: 0,
    totalAttempts: 0,
    currentDroppedTypes: [],
    currentDroppedClasses: [],
    currentIgnoredLeaderSuperSpecialCriteria: false,
    messageKey: 'progress.preparingSearch',
  });

  const plannedAttempts = planAutoTeamBuildFallbackAttempts(requestedInput, records);
  const totalAttempts = 1 + plannedAttempts.length;

  assertNotCancelled(options);
  emitProgress(options, timingState, {
    stage: 'exactAttempt',
    candidateCount: records.length,
    completedAttempts: 0,
    totalAttempts,
    currentDroppedTypes: [],
    currentDroppedClasses: [],
    currentIgnoredLeaderSuperSpecialCriteria: false,
    messageKey: 'progress.exactAttempt',
    messageParams: {
      current: 1,
      total: Math.max(totalAttempts, 1),
    },
  });

  const exactResult = runAutoTeamBuildAttempt(records, requestedInput, requestedInput);

  if (hasStrictAutoTeamBuildConstraints(requestedInput) && plannedAttempts.length === 0) {
    emitCompletedProgress(options, timingState, records.length, totalAttempts, totalAttempts);
    return exactResult;
  }

  if (satisfiesRequestedAutoTeamBuildCoverage(exactResult)) {
    emitCompletedProgress(options, timingState, records.length, totalAttempts, 1);
    return exactResult;
  }

  let completedAttempts = 1;

  for (const plannedAttempt of plannedAttempts) {
    assertNotCancelled(options);
    emitProgress(options, timingState, {
      stage: 'fallbackAttempt',
      candidateCount: records.length,
      completedAttempts,
      totalAttempts,
      currentDroppedTypes: plannedAttempt.droppedTypes,
      currentDroppedClasses: plannedAttempt.droppedClasses,
      currentIgnoredLeaderSuperSpecialCriteria: Boolean(
        plannedAttempt.ignoredLeaderSuperSpecialCriteria,
      ),
      messageKey: 'progress.fallbackAttempt',
      messageParams: {
        current: completedAttempts + 1,
        total: totalAttempts,
      },
    });

    const fallbackStartedAt = timingState.now();
    const relaxedResult = runAutoTeamBuildAttempt(records, plannedAttempt.input, requestedInput);
    const fallbackEndedAt = timingState.now();

    timingState.totalCompletedFallbackMs += Math.max(0, fallbackEndedAt - fallbackStartedAt);
    timingState.completedFallbackAttempts += 1;

    if (satisfiesRequestedAutoTeamBuildCoverage(relaxedResult)) {
      emitCompletedProgress(
        options,
        timingState,
        records.length,
        totalAttempts,
        completedAttempts + 1,
      );
      return relaxedResult;
    }

    completedAttempts += 1;
  }

  emitCompletedProgress(options, timingState, records.length, totalAttempts, completedAttempts);
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
    currentDroppedTypes: [],
    currentDroppedClasses: [],
    currentIgnoredLeaderSuperSpecialCriteria: false,
    messageKey: 'progress.completed',
  });
}

function emitProgress(
  options: AutoTeamBuildSearchOptions,
  timingState: AutoTeamBuildTimingState,
  snapshot: AutoBuildProgressSnapshotBase,
): void {
  options.onProgress?.({
    ...buildTimingSnapshot(timingState, snapshot.totalAttempts, snapshot.completedAttempts),
    ...snapshot,
    currentDroppedTypes: [...snapshot.currentDroppedTypes],
    currentDroppedClasses: [...snapshot.currentDroppedClasses],
  });
}

function assertNotCancelled(options: AutoTeamBuildSearchOptions): void {
  if (options.isCancelled?.()) {
    throw new AutoTeamBuildCancelledError();
  }
}

function createTimingState(options: AutoTeamBuildSearchOptions): AutoTeamBuildTimingState {
  const now = options.now ?? resolveCurrentTimestamp;

  return {
    searchStartedAt: now(),
    totalCompletedFallbackMs: 0,
    completedFallbackAttempts: 0,
    now,
  };
}

function buildTimingSnapshot(
  timingState: AutoTeamBuildTimingState,
  totalAttempts: number,
  completedAttempts: number,
): Pick<
  AutoBuildProgressSnapshot,
  'elapsedMs' | 'estimatedRemainingMs' | 'averageFallbackAttemptMs' | 'completedFallbackAttempts'
> {
  const elapsedMs = Math.max(0, timingState.now() - timingState.searchStartedAt);
  const averageFallbackAttemptMs =
    timingState.completedFallbackAttempts > 0
      ? timingState.totalCompletedFallbackMs / timingState.completedFallbackAttempts
      : null;
  const remainingFallbackAttempts = Math.max(totalAttempts - completedAttempts - 1, 0);
  const estimatedRemainingMs =
    averageFallbackAttemptMs !== null && remainingFallbackAttempts > 0
      ? averageFallbackAttemptMs * remainingFallbackAttempts
      : null;

  return {
    elapsedMs,
    estimatedRemainingMs,
    averageFallbackAttemptMs,
    completedFallbackAttempts: timingState.completedFallbackAttempts,
  };
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
): AutoBuildResult | null {
  const attempt = buildAutoTeamResult(records, input);

  if (!attempt) {
    return null;
  }

  return {
    ...attempt,
    requestedInput,
    relaxation: {
      usedFallback: !inputsMatch(requestedInput, input),
      droppedTypes: requestedInput.types.filter((type) => !input.types.includes(type)),
      droppedClasses: requestedInput.selectedClasses.filter(
        (selectedClass) => !input.selectedClasses.includes(selectedClass),
      ),
      minimumLeaderSuperEffectMatchingSlots: input.minimumLeaderSuperEffectMatchingSlots,
      ignoredLeaderSuperEffectScope: Boolean(
        requestedInput.requireAllSlotsInLeaderSuperEffectScope &&
          !input.requireAllSlotsInLeaderSuperEffectScope,
      ),
      ignoredLeaderSuperSpecialCriteria: Boolean(
        requestedInput.requireLeaderSuperSpecialCriteria && !input.requireLeaderSuperSpecialCriteria,
      ),
    },
    shipSelection: null,
  };
}

export function planAutoTeamBuildFallbackAttempts(
  requestedInput: AutoBuildInput,
  records: CharacterDetailRecord[],
): AutoTeamBuildPlannedAttempt[] {
  const nextInputs: Array<{
    input: AutoBuildInput;
    droppedTypes: AutoTeamBuilderType[];
    droppedClasses: string[];
    droppedCount: number;
    droppedSupport: number;
    ignoredLeaderSuperEffectScope: boolean;
    ignoredLeaderSuperSpecialCriteria: boolean;
  }> = [];
  const exactLeaderSuperEffectSlots = resolveRequestedLeaderSuperEffectMatchingSlots(requestedInput);
  const canRelaxLeaderSuperSpecialCriteria =
    requestedInput.requireLeaderSuperSpecialCriteria && exactLeaderSuperEffectSlots === null;

  if (exactLeaderSuperEffectSlots !== null) {
    for (let matchingSlots = exactLeaderSuperEffectSlots - 1; matchingSlots >= 2; matchingSlots -= 1) {
      nextInputs.push({
        input: {
          ...requestedInput,
          minimumLeaderSuperEffectMatchingSlots: matchingSlots,
        },
        droppedTypes: [],
        droppedClasses: [],
        droppedCount: 0,
        droppedSupport: 0,
        ignoredLeaderSuperEffectScope: false,
        ignoredLeaderSuperSpecialCriteria: false,
      });
    }

    nextInputs.push({
      input: {
        ...requestedInput,
        requireAllSlotsInLeaderSuperEffectScope: false,
        minimumLeaderSuperEffectMatchingSlots: null,
      },
      droppedTypes: [],
      droppedClasses: [],
      droppedCount: 0,
      droppedSupport: 0,
      ignoredLeaderSuperEffectScope: true,
      ignoredLeaderSuperSpecialCriteria: false,
    });
  }

  if (canRelaxLeaderSuperSpecialCriteria) {
    nextInputs.push({
      input: {
        ...requestedInput,
        requireLeaderSuperSpecialCriteria: false,
      },
      droppedTypes: [],
      droppedClasses: [],
      droppedCount: 0,
      droppedSupport: 0,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: true,
    });
  }

  if (hasStrictAutoTeamBuildConstraints(requestedInput)) {
    return nextInputs.map((entry) => ({
      input: entry.input,
      droppedTypes: entry.droppedTypes,
      droppedClasses: entry.droppedClasses,
      ignoredLeaderSuperEffectScope: entry.ignoredLeaderSuperEffectScope,
      ignoredLeaderSuperSpecialCriteria: entry.ignoredLeaderSuperSpecialCriteria,
    }));
  }

  const baseInput = requestedInput.requireAllSlotsInLeaderSuperEffectScope
    ? {
        ...requestedInput,
        requireAllSlotsInLeaderSuperEffectScope: false,
        minimumLeaderSuperEffectMatchingSlots: null,
      }
    : canRelaxLeaderSuperSpecialCriteria
      ? {
          ...requestedInput,
          requireLeaderSuperSpecialCriteria: false,
        }
      : requestedInput;

  const classSupport = new Map(
    requestedInput.selectedClasses.map((selectedClass) => [
      selectedClass,
      resolveClassSupport(records, selectedClass),
    ]),
  );
  const typeSupport = new Map(
    requestedInput.types.map((type) => [type, resolveTypeSupport(records, type)]),
  );
  const typeSubsets = buildSubsets(baseInput.types, 1);
  const classSubsets = buildSubsets(baseInput.selectedClasses, 0);
  nextInputs.push(
    ...typeSubsets.flatMap((types) =>
    classSubsets
      .filter(
        (selectedClasses) =>
          !sameOrderedValues(types, baseInput.types) ||
          !sameOrderedValues(selectedClasses, baseInput.selectedClasses),
      )
      .map((selectedClasses) => {
        const droppedTypes = requestedInput.types.filter((type) => !types.includes(type));
        const droppedClasses = requestedInput.selectedClasses.filter(
          (selectedClass) => !selectedClasses.includes(selectedClass),
        );

        return {
          input: {
            ...requestedInput,
            types,
            selectedClasses,
            requireAllSlotsInLeaderSuperEffectScope: baseInput.requireAllSlotsInLeaderSuperEffectScope,
            minimumLeaderSuperEffectMatchingSlots: baseInput.minimumLeaderSuperEffectMatchingSlots,
          },
          droppedTypes,
          droppedClasses,
          droppedCount: droppedTypes.length + droppedClasses.length,
          droppedSupport:
            droppedTypes.reduce((sum, type) => sum + (typeSupport.get(type) ?? 0), 0) +
            droppedClasses.reduce(
              (sum, selectedClass) => sum + (classSupport.get(selectedClass) ?? 0),
              0,
            ),
          ignoredLeaderSuperSpecialCriteria:
            requestedInput.requireLeaderSuperSpecialCriteria &&
            !baseInput.requireLeaderSuperSpecialCriteria,
          ignoredLeaderSuperEffectScope:
            requestedInput.requireAllSlotsInLeaderSuperEffectScope &&
            !baseInput.requireAllSlotsInLeaderSuperEffectScope,
        };
      }),
  ));

  nextInputs.sort((left, right) => {
    if (left.droppedCount !== right.droppedCount) {
      return left.droppedCount - right.droppedCount;
    }

    if (left.input.types.length !== right.input.types.length) {
      return right.input.types.length - left.input.types.length;
    }

    if (left.input.selectedClasses.length !== right.input.selectedClasses.length) {
      return right.input.selectedClasses.length - left.input.selectedClasses.length;
    }

    if (left.droppedSupport !== right.droppedSupport) {
      return left.droppedSupport - right.droppedSupport;
    }

    const leftDroppedTypes = left.droppedTypes.join('|');
    const rightDroppedTypes = right.droppedTypes.join('|');

    if (leftDroppedTypes !== rightDroppedTypes) {
      return leftDroppedTypes.localeCompare(rightDroppedTypes);
    }

    return left.droppedClasses.join('|').localeCompare(right.droppedClasses.join('|'));
  });

  return nextInputs.map((entry) => ({
    input: entry.input,
    droppedTypes: entry.droppedTypes,
    droppedClasses: entry.droppedClasses,
    ignoredLeaderSuperEffectScope: entry.ignoredLeaderSuperEffectScope,
    ignoredLeaderSuperSpecialCriteria: entry.ignoredLeaderSuperSpecialCriteria,
  }));
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

export function hasStrictAutoTeamBuildConstraints(input: AutoBuildInput): boolean {
  return Boolean(
    input.requireAllSelectedTypesInTeam || input.requireAllSelectedClassesPerCharacter,
  );
}

function inputsMatch(left: AutoBuildInput, right: AutoBuildInput): boolean {
  return (
    sameOrderedValues(left.types, right.types) &&
    sameOrderedValues(left.selectedClasses, right.selectedClasses) &&
    left.requireAllSlotsInLeaderSuperEffectScope === right.requireAllSlotsInLeaderSuperEffectScope &&
    left.minimumLeaderSuperEffectMatchingSlots === right.minimumLeaderSuperEffectMatchingSlots &&
    left.requireLeaderSuperSpecialCriteria === right.requireLeaderSuperSpecialCriteria
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
    result.coverage.coversAllSelectedClasses &&
    result.coverage.coversAllSelectedTypes &&
    result.coverage.abilityRequirements.matchesAll,
  );
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
