import { Injectable } from "@angular/core";

import {
  AUTO_TEAM_CANDIDATE_LIMIT,
  AUTO_TEAM_BUILDER_DEFAULT_TYPE,
  AUTO_TEAM_BUILDER_TYPES,
  type AutoBuildInput,
  type AutoBuildResult,
  type AutoTeamBuilderType,
} from "../models/auto-team-builder.models";
import { OptcRepositoryService } from "./optc-repository.service";
import { buildAutoTeamResult } from "./auto-team-builder.utils";

@Injectable({ providedIn: "root" })
export class AutoTeamBuilderService {
  public constructor(private readonly repository: OptcRepositoryService) {}

  public async buildTeam(
    selectedClass: string,
    selectedTypes: AutoTeamBuilderType[] = [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
  ): Promise<AutoBuildResult | null> {
    const normalizedTypes = [...new Set(selectedTypes)].filter((type): type is AutoTeamBuilderType =>
      AUTO_TEAM_BUILDER_TYPES.includes(type),
    );
    const input: AutoBuildInput = {
      types: normalizedTypes.length ? normalizedTypes : [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
      selectedClass,
      candidateLimit: AUTO_TEAM_CANDIDATE_LIMIT,
    };
    const records = await this.repository.getAutoBuilderCandidates(input.types, input.candidateLimit);

    return buildAutoTeamResult(records, input);
  }
}
