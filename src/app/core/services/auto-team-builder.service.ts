import { Injectable } from "@angular/core";

import {
  AUTO_TEAM_CANDIDATE_LIMIT,
  AUTO_TEAM_BUILDER_DEFAULT_TYPE,
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
    selectedType: AutoTeamBuilderType = AUTO_TEAM_BUILDER_DEFAULT_TYPE,
  ): Promise<AutoBuildResult | null> {
    const input: AutoBuildInput = {
      type: selectedType,
      selectedClass,
      candidateLimit: AUTO_TEAM_CANDIDATE_LIMIT,
    };
    const records = await this.repository.getAutoBuilderCandidates(input.type, input.candidateLimit);

    return buildAutoTeamResult(records, input);
  }
}
