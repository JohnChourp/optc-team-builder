import {
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
}

export class AutoTeamBuildCancelledError extends Error {
  public constructor(message = 'Auto team build cancelled.') {
    super(message);
    this.name = 'AutoTeamBuildCancelledError';
  }
}

export function isAutoTeamBuildCancelledError(error: unknown): error is AutoTeamBuildCancelledError {
  return error instanceof AutoTeamBuildCancelledError;
}

export function runAutoTeamBuildSearch(
  records: CharacterDetailRecord[],
  requestedInput: AutoBuildInput,
  options: AutoTeamBuildSearchOptions = {},
): AutoBuildResult | null {
  assertNotCancelled(options);
  emitProgress(options, {
    stage: 'preparingSearch',
    candidateCount: records.length,
    completedAttempts: 0,
    totalAttempts: 0,
    currentDroppedTypes: [],
    currentDroppedClasses: [],
    message: 'Προετοιμασία exact και relaxed search...',
  });

  const relaxedInputs = hasStrictConstraints(requestedInput)
    ? []
    : buildRelaxedInputs(requestedInput, records);
  const totalAttempts = 1 + relaxedInputs.length;

  assertNotCancelled(options);
  emitProgress(options, {
    stage: 'exactAttempt',
    candidateCount: records.length,
    completedAttempts: 0,
    totalAttempts,
    currentDroppedTypes: [],
    currentDroppedClasses: [],
    message: `Exact attempt 1 / ${Math.max(totalAttempts, 1)}`,
  });

  const exactResult = buildAttempt(records, requestedInput, requestedInput);

  if (hasStrictConstraints(requestedInput)) {
    emitCompletedProgress(options, records.length, totalAttempts, totalAttempts);
    return exactResult;
  }

  if (satisfiesRequestedCoverage(exactResult)) {
    emitCompletedProgress(options, records.length, totalAttempts, 1);
    return exactResult;
  }

  let completedAttempts = 1;

  for (const relaxedInput of relaxedInputs) {
    assertNotCancelled(options);
    emitProgress(options, {
      stage: 'fallbackAttempt',
      candidateCount: records.length,
      completedAttempts,
      totalAttempts,
      currentDroppedTypes: requestedInput.types.filter((type) => !relaxedInput.types.includes(type)),
      currentDroppedClasses: requestedInput.selectedClasses.filter(
        (selectedClass) => !relaxedInput.selectedClasses.includes(selectedClass),
      ),
      message: `Fallback attempt ${completedAttempts + 1} / ${totalAttempts}`,
    });

    const relaxedResult = buildAttempt(records, relaxedInput, requestedInput);

    if (satisfiesRequestedCoverage(relaxedResult)) {
      emitCompletedProgress(options, records.length, totalAttempts, completedAttempts + 1);
      return relaxedResult;
    }

    completedAttempts += 1;
  }

  emitCompletedProgress(options, records.length, totalAttempts, completedAttempts);
  return null;
}

function emitCompletedProgress(
  options: AutoTeamBuildSearchOptions,
  candidateCount: number,
  totalAttempts: number,
  completedAttempts: number,
): void {
  emitProgress(options, {
    stage: 'completed',
    candidateCount,
    completedAttempts,
    totalAttempts,
    currentDroppedTypes: [],
    currentDroppedClasses: [],
    message: 'Το auto-build ολοκλήρωσε όλα τα attempts.',
  });
}

function emitProgress(
  options: AutoTeamBuildSearchOptions,
  snapshot: AutoBuildProgressSnapshot,
): void {
  options.onProgress?.({
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

function buildAttempt(
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
    },
  };
}

function buildRelaxedInputs(
  requestedInput: AutoBuildInput,
  records: CharacterDetailRecord[],
): AutoBuildInput[] {
  const classSupport = new Map(
    requestedInput.selectedClasses.map((selectedClass) => [
      selectedClass,
      resolveClassSupport(records, selectedClass),
    ]),
  );
  const typeSupport = new Map(
    requestedInput.types.map((type) => [type, resolveTypeSupport(records, type)]),
  );
  const typeSubsets = buildSubsets(requestedInput.types, 1);
  const classSubsets = buildSubsets(requestedInput.selectedClasses, 0);
  const nextInputs = typeSubsets.flatMap((types) =>
    classSubsets
      .filter(
        (selectedClasses) =>
          !sameOrderedValues(types, requestedInput.types) ||
          !sameOrderedValues(selectedClasses, requestedInput.selectedClasses),
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
        };
      }),
  );

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

  return nextInputs.map((entry) => entry.input);
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

function hasStrictConstraints(input: AutoBuildInput): boolean {
  return Boolean(
    input.requireAllSelectedTypesInTeam || input.requireAllSelectedClassesPerCharacter,
  );
}

function inputsMatch(left: AutoBuildInput, right: AutoBuildInput): boolean {
  return (
    sameOrderedValues(left.types, right.types) &&
    sameOrderedValues(left.selectedClasses, right.selectedClasses)
  );
}

function sameOrderedValues<T>(left: T[], right: T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function satisfiesRequestedCoverage(result: AutoBuildResult | null): result is AutoBuildResult {
  return Boolean(
    result &&
      result.coverage.coversAllSelectedClasses &&
      result.coverage.coversAllSelectedTypes,
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

export function normalizeSelectedTypes(selectedTypes: AutoTeamBuilderType[]): AutoTeamBuilderType[] {
  return [...new Set(selectedTypes)].filter(
    (type): type is AutoTeamBuilderType => AUTO_TEAM_BUILDER_TYPES.includes(type),
  );
}
