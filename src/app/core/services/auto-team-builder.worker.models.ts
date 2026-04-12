import { type AutoBuildInput, type AutoBuildProgressSnapshot, type AutoBuildResult } from '../models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../models/optc.models';

export interface AutoTeamBuilderWorkerInitRequest {
  type: 'init';
  records: CharacterDetailRecord[];
}

export interface AutoTeamBuilderWorkerRunRequest {
  type: 'run';
  runId: string;
  records: CharacterDetailRecord[];
  requestedInput: AutoBuildInput;
}

export interface AutoTeamBuilderWorkerRunAttemptRequest {
  type: 'runAttempt';
  runId: string;
  input: AutoBuildInput;
  requestedInput: AutoBuildInput;
}

export interface AutoTeamBuilderWorkerReadyResponse {
  type: 'ready';
}

export interface AutoTeamBuilderWorkerProgressResponse {
  type: 'progress';
  runId: string;
  snapshot: AutoBuildProgressSnapshot;
}

export interface AutoTeamBuilderWorkerResultResponse {
  type: 'result';
  runId: string;
  result: AutoBuildResult | null;
}

export interface AutoTeamBuilderWorkerErrorResponse {
  type: 'error';
  runId?: string;
  errorMessage: string;
}

export type AutoTeamBuilderWorkerRequest =
  | AutoTeamBuilderWorkerInitRequest
  | AutoTeamBuilderWorkerRunRequest
  | AutoTeamBuilderWorkerRunAttemptRequest;
export type AutoTeamBuilderWorkerResponse =
  | AutoTeamBuilderWorkerReadyResponse
  | AutoTeamBuilderWorkerProgressResponse
  | AutoTeamBuilderWorkerResultResponse
  | AutoTeamBuilderWorkerErrorResponse;
