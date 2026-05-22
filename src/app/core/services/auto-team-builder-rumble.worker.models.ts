import {
  type RumbleBuildInput,
  type RumbleBuildProgressSnapshot,
  type RumbleBuildResultMode,
  type RumbleTeamResult,
} from '../models/auto-team-builder-rumble.models';
import { type CharacterDetailRecord } from '../models/optc.models';

interface AutoTeamBuilderRumbleWorkerRunRequest {
  type: 'run';
  runId: string;
  records: CharacterDetailRecord[];
  requestedInput: RumbleBuildInput;
  workerCount: number;
  limit: number;
  resultMode?: RumbleBuildResultMode;
}

interface AutoTeamBuilderRumbleWorkerProgressResponse {
  type: 'progress';
  runId: string;
  snapshot: RumbleBuildProgressSnapshot;
}

interface AutoTeamBuilderRumbleWorkerResultResponse {
  type: 'result';
  runId: string;
  results: RumbleTeamResult[];
}

interface AutoTeamBuilderRumbleWorkerErrorResponse {
  type: 'error';
  runId: string;
  errorMessage: string;
}

export type AutoTeamBuilderRumbleWorkerRequest = AutoTeamBuilderRumbleWorkerRunRequest;
export type AutoTeamBuilderRumbleWorkerResponse =
  | AutoTeamBuilderRumbleWorkerProgressResponse
  | AutoTeamBuilderRumbleWorkerResultResponse
  | AutoTeamBuilderRumbleWorkerErrorResponse;
