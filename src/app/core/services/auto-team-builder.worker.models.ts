import {
  type AutoBuildAttemptProgressSnapshot,
  type AutoBuildInput,
  type AutoBuildProgressSnapshot,
  type AutoBuildResult,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../models/optc.models';

interface AutoTeamBuilderWorkerInitRequest {
  type: 'init';
  records: CharacterDetailRecord[];
  friendCaptainRecords?: CharacterDetailRecord[];
  autoFillCharacterIds?: number[];
  leaderAutoFillCharacterIds?: number[];
  subAutoFillCharacterIds?: number[];
}

interface AutoTeamBuilderWorkerRunRequest {
  type: 'run';
  runId: string;
  records: CharacterDetailRecord[];
  friendCaptainRecords?: CharacterDetailRecord[];
  autoFillCharacterIds?: number[];
  leaderAutoFillCharacterIds?: number[];
  subAutoFillCharacterIds?: number[];
  maxScheduledFallbackAttempts?: number;
  requestedInput: AutoBuildInput;
}

interface AutoTeamBuilderWorkerRunAttemptRequest {
  type: 'runAttempt';
  runId: string;
  input: AutoBuildInput;
  requestedInput: AutoBuildInput;
  requireLeadersWithoutSuperEffects: boolean;
  friendCaptainRecords?: CharacterDetailRecord[];
  autoFillCharacterIds?: number[];
  leaderAutoFillCharacterIds?: number[];
  subAutoFillCharacterIds?: number[];
}

interface AutoTeamBuilderWorkerReadyResponse {
  type: 'ready';
}

interface AutoTeamBuilderWorkerProgressResponse {
  type: 'progress';
  runId: string;
  snapshot: AutoBuildProgressSnapshot;
}

interface AutoTeamBuilderWorkerAttemptProgressResponse {
  type: 'attemptProgress';
  runId: string;
  progress: AutoBuildAttemptProgressSnapshot;
}

interface AutoTeamBuilderWorkerResultResponse {
  type: 'result';
  runId: string;
  result: AutoBuildResult | null;
}

interface AutoTeamBuilderWorkerErrorResponse {
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
  | AutoTeamBuilderWorkerAttemptProgressResponse
  | AutoTeamBuilderWorkerResultResponse
  | AutoTeamBuilderWorkerErrorResponse;
