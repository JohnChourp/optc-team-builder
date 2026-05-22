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

export const RUMBLE_BUFF_FOCUS_STATS = ['ATK', 'HP', 'DEF', 'SPD', 'RCV', 'Special CT'] as const;

export const RUMBLE_BUFF_FOCUS_RANKS = ['primary', 'secondary', 'tertiary', 'ignored'] as const;

export type RumbleBuffFocusStat = (typeof RUMBLE_BUFF_FOCUS_STATS)[number];
export type RumbleBuffFocusRank = (typeof RUMBLE_BUFF_FOCUS_RANKS)[number];

export interface RumbleBuffFocusPreference {
  stat: RumbleBuffFocusStat;
  rank: RumbleBuffFocusRank;
}

export const DEFAULT_RUMBLE_BUFF_FOCUS: RumbleBuffFocusPreference[] = [
  { stat: 'ATK', rank: 'primary' },
  { stat: 'HP', rank: 'primary' },
  { stat: 'DEF', rank: 'primary' },
  { stat: 'SPD', rank: 'secondary' },
  { stat: 'RCV', rank: 'secondary' },
  { stat: 'Special CT', rank: 'secondary' },
];

export interface NormalizedRumbleEffect {
  source: 'ability' | 'special';
  sourceLevel: number | null;
  maxSourceLevel: number | null;
  effect: string;
  attributes: string[];
  level: number | null;
  amount: number | null;
  chance: number | null;
  duration: number | null;
  type: string | null;
  target: string | null;
  targetTokens: string[];
  targetCount: number | null;
  targetPriority: string | null;
  targetStat: string | null;
  targetScope: 'crew' | 'self' | 'enemies' | 'subset' | 'unknown';
  isConditional: boolean;
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

export interface RumbleOpponentSlotContext {
  characterId: number;
  role: RumbleTeamSlotRole;
  index: number;
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

export type RumbleBuildResultMode = 'score' | 'closestCost';

export interface RumbleBuildInput {
  types: AutoTeamBuilderType[];
  selectedClasses: string[];
  onlySelectedTypes: boolean;
  onlySelectedClasses: boolean;
  favoritesOnly: boolean;
  favoriteCharacterIds: number[];
  characterBoxId?: string | null;
  candidateCharacterIds?: number[];
  opponentSlots: RumbleOpponentSlotContext[];
  buffFocus: RumbleBuffFocusPreference[];
  requireFullTeam: boolean;
}

type RumbleBuildProgressStage =
  | 'loadingCandidates'
  | 'scoringCandidates'
  | 'preparingSearch'
  | 'attempt'
  | 'selectingSlots'
  | 'improvingTeam'
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
  completedWorkUnits?: number;
  totalWorkUnits?: number;
  currentSlot?: number;
  totalSlots?: number;
  checkedCandidates?: number;
  totalCandidatesToCheck?: number;
  retainedVariants?: number;
  activeWorkerCount?: number;
}
