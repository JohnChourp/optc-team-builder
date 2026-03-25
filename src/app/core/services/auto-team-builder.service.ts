import { Injectable } from '@angular/core';

import {
  AUTO_TEAM_CANDIDATE_LIMIT,
  type AutoBuildConstraints,
  AUTO_TEAM_BUILDER_DEFAULT_TYPE,
  AUTO_TEAM_BUILDER_TYPES,
  type AutoBuildInput,
  type AutoBuildResult,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import { OptcRepositoryService } from './optc-repository.service';
import { buildAutoTeamResult, resolveCharacterTypeTokens } from './auto-team-builder.utils';

@Injectable({ providedIn: 'root' })
export class AutoTeamBuilderService {
  public constructor(private readonly repository: OptcRepositoryService) {}

  public async buildTeam(
    selectedClasses: string[] = [],
    selectedTypes: AutoTeamBuilderType[] = [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
    constraints: AutoBuildConstraints = {},
  ): Promise<AutoBuildResult | null> {
    const favoritesOnly = constraints.favoritesOnly ?? false;
    const normalizedTypes = [...new Set(selectedTypes)].filter(
      (type): type is AutoTeamBuilderType => AUTO_TEAM_BUILDER_TYPES.includes(type),
    );
    const normalizedClasses = selectedClasses.reduce<string[]>((classes, currentClass) => {
      const nextClass = currentClass.trim();

      if (
        !nextClass.length ||
        classes.some((entry) => entry.toLowerCase() === nextClass.toLowerCase())
      ) {
        return classes;
      }

      classes.push(nextClass);
      return classes;
    }, []);
    const favoriteCharacterIds = new Set(
      (constraints.favoriteCharacterIds ?? []).filter(
        (characterId) => Number.isInteger(characterId) && characterId > 0,
      ),
    );
    const lockedCharacterIds = [
      ...new Set(
        (constraints.lockedCharacterIds ?? []).filter(
          (characterId) => Number.isInteger(characterId) && characterId > 0,
        ),
      ),
    ];
    const input: AutoBuildInput = {
      types: normalizedTypes.length ? normalizedTypes : [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
      selectedClasses: normalizedClasses,
      requireAllSelectedTypesInTeam: constraints.requireAllSelectedTypesInTeam ?? false,
      requireAllSelectedClassesPerCharacter:
        constraints.requireAllSelectedClassesPerCharacter ?? false,
      favoritesOnly,
      lockedCharacterIds,
      candidateLimit: AUTO_TEAM_CANDIDATE_LIMIT,
    };
    const requestedInput: AutoBuildInput = {
      ...input,
      types: [...input.types],
      selectedClasses: [...input.selectedClasses],
      lockedCharacterIds: [...input.lockedCharacterIds],
    };

    if (favoritesOnly && !favoriteCharacterIds.size) {
      return null;
    }

    if (favoritesOnly && lockedCharacterIds.some((characterId) => !favoriteCharacterIds.has(characterId))) {
      return null;
    }

    const records = await this.repository.getAutoBuilderCandidates(
      requestedInput.types,
      requestedInput.candidateLimit,
      {
        allowedCharacterIds: favoritesOnly ? [...favoriteCharacterIds] : undefined,
        lockedCharacterIds,
      },
    );
    const exactResult = this.buildAttempt(records, requestedInput, requestedInput);

    if (this.hasStrictConstraints(requestedInput)) {
      return exactResult;
    }

    if (this.satisfiesRequestedCoverage(exactResult)) {
      return exactResult;
    }

    for (const relaxedInput of this.buildRelaxedInputs(requestedInput, records)) {
      const relaxedResult = this.buildAttempt(records, relaxedInput, requestedInput);

      if (this.satisfiesRequestedCoverage(relaxedResult)) {
        return relaxedResult;
      }
    }

    return null;
  }

  private buildAttempt(
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
        usedFallback: !this.inputsMatch(requestedInput, input),
        droppedTypes: requestedInput.types.filter((type) => !input.types.includes(type)),
        droppedClasses: requestedInput.selectedClasses.filter(
          (selectedClass) => !input.selectedClasses.includes(selectedClass),
        ),
      },
    };
  }

  private buildRelaxedInputs(
    requestedInput: AutoBuildInput,
    records: CharacterDetailRecord[],
  ): AutoBuildInput[] {
    const classSupport = new Map(
      requestedInput.selectedClasses.map((selectedClass) => [
        selectedClass,
        this.resolveClassSupport(records, selectedClass),
      ]),
    );
    const typeSupport = new Map(
      requestedInput.types.map((type) => [type, this.resolveTypeSupport(records, type)]),
    );
    const typeSubsets = this.buildSubsets(requestedInput.types, 1);
    const classSubsets = this.buildSubsets(requestedInput.selectedClasses, 0);
    const nextInputs = typeSubsets.flatMap((types) =>
      classSubsets
        .filter(
          (selectedClasses) =>
            !this.sameOrderedValues(types, requestedInput.types) ||
            !this.sameOrderedValues(selectedClasses, requestedInput.selectedClasses),
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

  private buildSubsets<T>(values: T[], minLength: number): T[][] {
    const subsets: T[][] = [];

    for (let mask = 0; mask < 1 << values.length; mask += 1) {
      const subset = values.filter((_, index) => (mask & (1 << index)) !== 0);

      if (subset.length >= minLength) {
        subsets.push(subset);
      }
    }

    return subsets;
  }

  private hasStrictConstraints(input: AutoBuildInput): boolean {
    return Boolean(
      input.requireAllSelectedTypesInTeam || input.requireAllSelectedClassesPerCharacter,
    );
  }

  private inputsMatch(left: AutoBuildInput, right: AutoBuildInput): boolean {
    return (
      this.sameOrderedValues(left.types, right.types) &&
      this.sameOrderedValues(left.selectedClasses, right.selectedClasses)
    );
  }

  private sameOrderedValues<T>(left: T[], right: T[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  private satisfiesRequestedCoverage(result: AutoBuildResult | null): result is AutoBuildResult {
    return Boolean(
      result &&
      result.coverage.coversAllSelectedClasses &&
      result.coverage.coversAllSelectedTypes,
    );
  }

  private resolveClassSupport(records: CharacterDetailRecord[], selectedClass: string): number {
    const normalizedSelectedClass = selectedClass.toLowerCase();

    return records.filter((record) =>
      record.classes.some((recordClass) => recordClass.toLowerCase() === normalizedSelectedClass),
    ).length;
  }

  private resolveTypeSupport(
    records: CharacterDetailRecord[],
    selectedType: AutoTeamBuilderType,
  ): number {
    return records.filter((record) => resolveCharacterTypeTokens(record.type).includes(selectedType))
      .length;
  }
}
