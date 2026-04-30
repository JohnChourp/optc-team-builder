import {
  type RumbleBuildInput,
  type RumbleTeamResult,
  type RumbleTeamSlotRole,
} from './auto-team-builder-rumble.models';

export interface SavedRumbleTeamSlot {
  characterId: number;
  index: number;
  reasonChips: string[];
  role: RumbleTeamSlotRole;
  score: number;
}

export interface SavedRumbleTeamResult {
  activeSlots: SavedRumbleTeamSlot[];
  benchSlots: SavedRumbleTeamSlot[];
  candidateCount: number;
  classCoverage: string[];
  droppedClasses: string[];
  droppedTypes: RumbleTeamResult['droppedTypes'];
  input: RumbleBuildInput;
  requestedClasses: string[];
  requestedTypes: RumbleTeamResult['requestedTypes'];
  resolvedClasses: string[];
  resolvedTypes: RumbleTeamResult['resolvedTypes'];
  roleCoverage: RumbleTeamResult['roleCoverage'];
  selectedCount: number;
  topFactors: string[];
  totalScore: number;
  typeCoverage: string[];
}

export interface SavedRumbleTeam {
  id: string;
  name: string;
  notes: string;
  settings: RumbleBuildInput;
  teams: SavedRumbleTeamResult[];
  selectedTeamIndex: number;
  opponentActiveCharacterIds: Array<number | null>;
  opponentBenchCharacterIds: Array<number | null>;
  opponentAwarenessEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}
