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
import { OptcRepositoryService } from './optc-repository.service';
import { buildAutoTeamResult } from './auto-team-builder.utils';

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
    const input: AutoBuildInput = {
      types: normalizedTypes.length ? normalizedTypes : [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
      selectedClasses: normalizedClasses,
      requireAllSelectedTypesInTeam: constraints.requireAllSelectedTypesInTeam ?? false,
      requireAllSelectedClassesPerCharacter:
        constraints.requireAllSelectedClassesPerCharacter ?? false,
      favoritesOnly,
      candidateLimit: AUTO_TEAM_CANDIDATE_LIMIT,
    };
    const records = await this.repository.getAutoBuilderCandidates(
      input.types,
      input.candidateLimit,
    );
    const candidatePool = favoritesOnly
      ? records.filter((record) => favoriteCharacterIds.has(record.id))
      : records;

    return buildAutoTeamResult(candidatePool, input);
  }
}
