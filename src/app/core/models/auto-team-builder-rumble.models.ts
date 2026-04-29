import { type CharacterDetailRecord } from './optc.models';
import { type AutoTeamBuilderType } from './auto-team-builder.models';

export const RUMBLE_ACTIVE_SLOT_COUNT = 5;
export const RUMBLE_BENCH_SLOT_COUNT = 3;
export const RUMBLE_TOTAL_SLOT_COUNT = RUMBLE_ACTIVE_SLOT_COUNT + RUMBLE_BENCH_SLOT_COUNT;

export type NormalizedRumbleRoleTag =
  | 'attacker'
  | 'booster'
  | 'defender'
  | 'disruptor'
  | 'healer'
  | 'speed';

export interface NormalizedRumbleEffect {
  source: 'ability' | 'special';
  effect: string;
  attributes: string[];
  level: number | null;
  amount: number | null;
  chance: number | null;
  duration: number | null;
  target: string | null;
}

export interface NormalizedRumbleData {
  raw: Record<string, unknown>;
  basedOnId: number | null;
  rumbleType: string | null;
  def: number | null;
  spd: number | null;
  cost: number | null;
  cooldown: number | null;
  targetLabel: string | null;
  patternCount: number;
  maxPassiveLevel: number | null;
  maxSpecialLevel: number | null;
  maxPassiveEffects: string[];
  maxSpecialEffects: string[];
  maxSpecialCooldown: number | null;
  baseResistances: string[];
  llbResistances: string[];
  passiveEffects: NormalizedRumbleEffect[];
  specialEffects: NormalizedRumbleEffect[];
  roleTags: NormalizedRumbleRoleTag[];
}

export interface RumbleScoreBreakdown {
  statScore: number;
  passiveScore: number;
  specialScore: number;
  synergyScore: number;
  recencyScore: number;
  total: number;
}

export interface RumbleUnitScore {
  character: CharacterDetailRecord;
  normalized: NormalizedRumbleData;
  baseScore: number;
  breakdown: RumbleScoreBreakdown;
  reasonChips: string[];
  conflictKeys: string[];
}

export type RumbleTeamSlotRole = 'active' | 'bench';

export interface RumbleTeamSlot {
  role: RumbleTeamSlotRole;
  index: number;
  unit: RumbleUnitScore;
  score: number;
  reasonChips: string[];
}

export interface RumbleTeamResult {
  activeSlots: RumbleTeamSlot[];
  benchSlots: RumbleTeamSlot[];
  candidateCount: number;
  selectedCount: number;
  totalScore: number;
  roleCoverage: NormalizedRumbleRoleTag[];
  typeCoverage: string[];
  classCoverage: string[];
  topFactors: string[];
  input: RumbleBuildInput;
  requestedTypes: AutoTeamBuilderType[];
  requestedClasses: string[];
  resolvedTypes: AutoTeamBuilderType[];
  resolvedClasses: string[];
  droppedTypes: AutoTeamBuilderType[];
  droppedClasses: string[];
}

export interface RumbleBuildInput {
  types: AutoTeamBuilderType[];
  selectedClasses: string[];
  onlySelectedTypes: boolean;
  onlySelectedClasses: boolean;
  favoritesOnly: boolean;
  favoriteCharacterIds: number[];
  candidateCharacterIds?: number[];
}

export type RumbleBuildProgressStage =
  | 'loadingCandidates'
  | 'preparingSearch'
  | 'attempt'
  | 'completed';

export interface RumbleBuildProgressSnapshot {
  stage: RumbleBuildProgressStage;
  candidateCount: number;
  completedAttempts: number;
  totalAttempts: number;
  attemptCountFinal: boolean;
  currentDroppedTypes: AutoTeamBuilderType[];
  currentDroppedClasses: string[];
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  messageKey: string;
  messageParams?: Record<string, string | number>;
}
