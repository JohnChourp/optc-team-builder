import { type CharacterRecord, type SavedTeam } from '../models/optc.models';

export const CAPTAIN_SLOT_INDICES = [0, 1] as const;
export const SAVED_TEAM_SCORE_WEIGHTS = {
  hp: 0.0001,
  atk: 0.001,
  rcv: 0.001,
  costPenalty: 0.05,
} as const;

export interface SavedTeamScoreSlotBreakdown {
  index: number;
  characterId: number | null;
  hpMax: number;
  atkMax: number;
  rcvMax: number;
  cost: number;
  captainHpBoost: number;
  captainAtkBoost: number;
  captainAverageBoost: number;
  isCaptainSlot: boolean;
  resolved: boolean;
}

export interface SavedTeamScoreBreakdown {
  filledSlotCount: number;
  resolvedSlotCount: number;
  rawHpMax: number;
  rawAtkMax: number;
  rawRcvMax: number;
  totalCost: number;
  combinedCaptainHpBoost: number;
  combinedCaptainAtkBoost: number;
  effectiveHpMax: number;
  effectiveAtkMax: number;
  effectiveRcvMax: number;
  slots: SavedTeamScoreSlotBreakdown[];
}

export interface SavedTeamScore {
  score: number;
  breakdown: SavedTeamScoreBreakdown;
}

export interface SavedTeamScoreOptions {
  characterLookup: (characterId: number) => CharacterRecord | null | undefined;
  captainSlotIndices?: readonly number[];
}

function resolveCharacterMaxStat(character: CharacterRecord | null | undefined, stat: 'hp' | 'atk' | 'rcv'): number {
  if (!character) {
    return 0;
  }

  const value = character.stats?.max?.[stat];

  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function resolveCharacterCost(character: CharacterRecord | null | undefined): number {
  if (!character) {
    return 0;
  }

  return typeof character.cost === 'number' && Number.isFinite(character.cost) && character.cost > 0
    ? character.cost
    : 0;
}

function resolveCaptainBoost(
  character: CharacterRecord | null | undefined,
  stat: 'captainHpBoost' | 'captainAtkBoost' | 'captainAverageBoost',
): number {
  if (!character) {
    return 0;
  }

  const value = character[stat];

  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

export function computeSavedTeamScore(
  team: Pick<SavedTeam, 'slots'>,
  options: SavedTeamScoreOptions,
): SavedTeamScore {
  const captainSlotSet = new Set(options.captainSlotIndices ?? CAPTAIN_SLOT_INDICES);
  const slots: SavedTeamScoreSlotBreakdown[] = [];

  let rawHpMax = 0;
  let rawAtkMax = 0;
  let rawRcvMax = 0;
  let totalCost = 0;
  let combinedCaptainHpBoost = 0;
  let combinedCaptainAtkBoost = 0;
  let filledSlotCount = 0;
  let resolvedSlotCount = 0;

  team.slots.forEach((characterId, index) => {
    const isCaptainSlot = captainSlotSet.has(index);

    if (characterId === null || characterId === undefined) {
      slots.push({
        index,
        characterId: null,
        hpMax: 0,
        atkMax: 0,
        rcvMax: 0,
        cost: 0,
        captainHpBoost: 0,
        captainAtkBoost: 0,
        captainAverageBoost: 0,
        isCaptainSlot,
        resolved: false,
      });
      return;
    }

    filledSlotCount += 1;

    const character = options.characterLookup(characterId) ?? null;
    const resolved = character !== null;

    if (resolved) {
      resolvedSlotCount += 1;
    }

    const hpMax = resolveCharacterMaxStat(character, 'hp');
    const atkMax = resolveCharacterMaxStat(character, 'atk');
    const rcvMax = resolveCharacterMaxStat(character, 'rcv');
    const cost = resolveCharacterCost(character);
    const captainHpBoost = resolveCaptainBoost(character, 'captainHpBoost');
    const captainAtkBoost = resolveCaptainBoost(character, 'captainAtkBoost');
    const captainAverageBoost = resolveCaptainBoost(character, 'captainAverageBoost');

    rawHpMax += hpMax;
    rawAtkMax += atkMax;
    rawRcvMax += rcvMax;
    totalCost += cost;

    if (isCaptainSlot) {
      combinedCaptainHpBoost += captainHpBoost;
      combinedCaptainAtkBoost += captainAtkBoost;
    }

    slots.push({
      index,
      characterId,
      hpMax,
      atkMax,
      rcvMax,
      cost,
      captainHpBoost,
      captainAtkBoost,
      captainAverageBoost,
      isCaptainSlot,
      resolved,
    });
  });

  const effectiveHpMax = Math.round(rawHpMax * (1 + combinedCaptainHpBoost));
  const effectiveAtkMax = Math.round(rawAtkMax * (1 + combinedCaptainAtkBoost));
  const effectiveRcvMax = rawRcvMax;

  const score = Math.max(
    0,
    Math.round(
      effectiveHpMax * SAVED_TEAM_SCORE_WEIGHTS.hp +
        effectiveAtkMax * SAVED_TEAM_SCORE_WEIGHTS.atk +
        effectiveRcvMax * SAVED_TEAM_SCORE_WEIGHTS.rcv -
        totalCost * SAVED_TEAM_SCORE_WEIGHTS.costPenalty,
    ),
  );

  return {
    score,
    breakdown: {
      filledSlotCount,
      resolvedSlotCount,
      rawHpMax,
      rawAtkMax,
      rawRcvMax,
      totalCost,
      combinedCaptainHpBoost,
      combinedCaptainAtkBoost,
      effectiveHpMax,
      effectiveAtkMax,
      effectiveRcvMax,
      slots,
    },
  };
}

export function summarizeSavedTeamScore(score: SavedTeamScore): string {
  const { breakdown } = score;

  return [
    `score=${score.score}`,
    `hp=${breakdown.effectiveHpMax}`,
    `atk=${breakdown.effectiveAtkMax}`,
    `rcv=${breakdown.effectiveRcvMax}`,
    `cost=${breakdown.totalCost}`,
    `filled=${breakdown.filledSlotCount}/${breakdown.slots.length}`,
  ].join(' · ');
}
