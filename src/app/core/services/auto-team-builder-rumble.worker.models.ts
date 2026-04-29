import {
  type RumbleBuildInput,
  type RumbleBuildProgressSnapshot,
  type RumbleTeamResult,
} from '../models/auto-team-builder-rumble.models';
import { type CharacterDetailRecord } from '../models/optc.models';

export interface AutoTeamBuilderRumbleWorkerRunRequest {
  type: 'run';
  runId: string;
  records: CharacterDetailRecord[];
  requestedInput: RumbleBuildInput;
  workerCount: number;
}

export interface AutoTeamBuilderRumbleWorkerProgressResponse {
  type: 'progress';
  runId: string;
  snapshot: RumbleBuildProgressSnapshot;
}

export interface AutoTeamBuilderRumbleWorkerResultResponse {
  type: 'result';
  runId: string;
  result: RumbleTeamResult;
}

export interface AutoTeamBuilderRumbleWorkerErrorResponse {
  type: 'error';
  runId: string;
  errorMessage: string;
}

export type AutoTeamBuilderRumbleWorkerRequest = AutoTeamBuilderRumbleWorkerRunRequest;
export type AutoTeamBuilderRumbleWorkerResponse =
  | AutoTeamBuilderRumbleWorkerProgressResponse
  | AutoTeamBuilderRumbleWorkerResultResponse
  | AutoTeamBuilderRumbleWorkerErrorResponse;
