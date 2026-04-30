import {
  DEFAULT_RUMBLE_BUFF_FOCUS,
  RUMBLE_BUFF_FOCUS_RANKS,
  RUMBLE_BUFF_FOCUS_STATS,
  RUMBLE_ACTIVE_SLOT_COUNT,
  RUMBLE_BENCH_SLOT_COUNT,
  RUMBLE_TOTAL_SLOT_COUNT,
  type NormalizedRumbleData,
  type NormalizedRumbleEffect,
  type NormalizedRumbleRoleTag,
  type RumbleBuffFocusPreference,
  type RumbleBuffFocusRank,
  type RumbleBuffFocusStat,
  type RumbleBuildInput,
  type RumbleBuildProgressSnapshot,
  type RumbleBuildResultMode,
  type RumbleOpponentSlotContext,
  type RumbleScoreBreakdown,
  type RumbleTeamResult,
  type RumbleTeamSlot,
  type RumbleUnitScore,
} from '../models/auto-team-builder-rumble.models';
import {
  AUTO_TEAM_BUILDER_TYPES,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import { resolveCharacterPartyConflictKeys } from './auto-team-builder.utils';

type UnknownRecord = Record<string, unknown>;
type OpponentCounterAttribute = RumbleBuffFocusStat | string;

interface RumbleOpponentUnit {
  unit: RumbleUnitScore;
  slot: RumbleOpponentSlotContext;
  weight: number;
}

interface RumbleOpponentProfile {
  units: RumbleOpponentUnit[];
  totalWeight: number;
  attributeThreatWeights: Map<OpponentCounterAttribute, number>;
  debuffThreatWeights: Map<OpponentCounterAttribute, number>;
  typeWeights: Map<string, number>;
}

export interface RumbleBuildAttempt {
  resolvedTypes: AutoTeamBuilderType[];
  resolvedClasses: string[];
  droppedTypes: AutoTeamBuilderType[];
  droppedClasses: string[];
  buffFocus: RumbleBuffFocusPreference[];
}

export interface RumbleBuildSearchOptions {
  onProgress?: (snapshot: RumbleBuildProgressSnapshot) => void;
  now?: () => number;
  activeWorkerCount?: number;
  resultMode?: RumbleBuildResultMode;
}

interface RumbleCandidateScoringProgress {
  completedWorkUnits: number;
  totalWorkUnits: number;
  checkedCandidates: number;
  totalCandidatesToCheck: number;
}

interface RumbleCandidateScoringOptions {
  onProgress?: (progress: RumbleCandidateScoringProgress) => void;
}

interface RumbleVariantProgressSnapshot {
  stage: 'selectingSlots' | 'improvingTeam';
  completedWorkUnits: number;
  totalWorkUnits: number;
  currentSlot?: number;
  totalSlots?: number;
  checkedCandidates?: number;
  totalCandidatesToCheck?: number;
  retainedVariants?: number;
}

interface RumbleVariantBuildOptions {
  onProgress?: (snapshot: RumbleVariantProgressSnapshot) => void;
  resultMode?: RumbleBuildResultMode;
}

interface RumbleScoredUnitGroup {
  units: RumbleUnitScore[];
  score: number;
  key: string;
}

interface RumbleImprovementProgressState {
  completedWorkUnits: number;
  totalWorkUnits: number;
  retainedVariants: number;
}

type RumbleTeamScoreCache = Map<string, number>;

const ROLE_LABELS: Record<NormalizedRumbleRoleTag, string> = {
  attacker: 'Damage',
  booster: 'Buffs',
  defender: 'Defense',
  disruptor: 'Disruption',
  healer: 'Healing',
  speed: 'Speed',
};

const EMPTY_INPUT: RumbleBuildInput = {
  types: [],
  selectedClasses: [],
  onlySelectedTypes: false,
  onlySelectedClasses: false,
  favoritesOnly: false,
  favoriteCharacterIds: [],
  opponentSlots: [],
  buffFocus: DEFAULT_RUMBLE_BUFF_FOCUS,
  requireFullTeam: true,
};

const RUMBLE_SYNERGY_ATTRIBUTE_WEIGHTS: Record<RumbleBuffFocusStat, number> = {
  HP: 34,
  ATK: 42,
  DEF: 38,
  SPD: 36,
  RCV: 30,
  'Special CT': 46,
};

const RUMBLE_BUFF_FOCUS_RANK_WEIGHTS: Record<RumbleBuffFocusRank, number> = {
  primary: 1.75,
  secondary: 1,
  tertiary: 0.55,
  ignored: 0,
};

const ACTIVE_SLOT_WEIGHT = 1;
const BENCH_SLOT_WEIGHT = 0.45;
const RUMBLE_TEAM_COST_LIMIT = 300;
const RUMBLE_PROGRESS_EMIT_INTERVAL = 250;
const EMPTY_OPPONENT_PROFILE: RumbleOpponentProfile = {
  units: [],
  totalWeight: 0,
  attributeThreatWeights: new Map(),
  debuffThreatWeights: new Map(),
  typeWeights: new Map(),
};

export function normalizeRumbleBuildInput(input: Partial<RumbleBuildInput> = {}): RumbleBuildInput {
  const typeSet = new Set<AutoTeamBuilderType>(AUTO_TEAM_BUILDER_TYPES);
  const types = [...new Set((input.types ?? []).filter((type) => typeSet.has(type)))];
  const selectedClasses: string[] = [];

  for (const currentClass of input.selectedClasses ?? []) {
    const normalizedClass = currentClass.trim();

    if (
      normalizedClass.length > 0 &&
      !selectedClasses.some((entry) => entry.toLowerCase() === normalizedClass.toLowerCase())
    ) {
      selectedClasses.push(normalizedClass);
    }
  }

  return {
    types,
    selectedClasses,
    onlySelectedTypes: input.onlySelectedTypes ?? false,
    onlySelectedClasses: input.onlySelectedClasses ?? false,
    favoritesOnly: input.favoritesOnly ?? false,
    favoriteCharacterIds: normalizePositiveIntegerCollection(input.favoriteCharacterIds),
    candidateCharacterIds: input.candidateCharacterIds
      ? normalizePositiveIntegerCollection(input.candidateCharacterIds)
      : undefined,
    opponentSlots: normalizeRumbleOpponentSlots(input.opponentSlots),
    buffFocus: normalizeRumbleBuffFocus(input.buffFocus),
    requireFullTeam: input.requireFullTeam ?? true,
  };
}

export function runRumbleTeamBuildSearch(
  candidates: CharacterDetailRecord[],
  requestedInput: Partial<RumbleBuildInput> = {},
  options: RumbleBuildSearchOptions = {},
): RumbleTeamResult {
  return runRumbleTeamBuildSearches(candidates, requestedInput, options, 1)[0];
}

export function runRumbleTeamBuildSearches(
  candidates: CharacterDetailRecord[],
  requestedInput: Partial<RumbleBuildInput> = {},
  options: RumbleBuildSearchOptions = {},
  limit = 2,
): RumbleTeamResult[] {
  const input = normalizeRumbleBuildInput(requestedInput);
  const resultLimit = normalizeResultLimit(limit);
  const now = options.now ?? (() => Date.now());
  const searchStartedAt = now();
  const engine = new RumbleTeamBuilderEngine();
  const activeWorkerCount = options.activeWorkerCount ?? 1;
  const resultComparator = resolveRumbleResultComparator(options.resultMode);
  const attempts = createRumbleBuildAttempts(input);
  const scopedCandidates = applyCandidateScope(candidates, input);
  const scoredCandidates = engine.scoreCandidates(scopedCandidates, {
    onProgress: (progress) =>
      emitProgress(options, {
        stage: 'scoringCandidates',
        candidateCount: scopedCandidates.length,
        completedAttempts: 0,
        totalAttempts: attempts.length,
        attemptCountFinal: true,
        currentDroppedTypes: [],
        currentDroppedClasses: [],
        elapsedMs: Math.max(0, now() - searchStartedAt),
        estimatedRemainingMs: null,
        messageKey: 'progress.scoringCandidates',
        messageParams: {
          current: progress.checkedCandidates,
          total: progress.totalCandidatesToCheck,
        },
        completedWorkUnits: progress.completedWorkUnits,
        totalWorkUnits: progress.totalWorkUnits,
        checkedCandidates: progress.checkedCandidates,
        totalCandidatesToCheck: progress.totalCandidatesToCheck,
        activeWorkerCount,
      }),
  });
  const opponentProfile = input.opponentSlots.length
    ? engine.createOpponentProfile(engine.scoreCandidates(candidates), input.opponentSlots)
    : EMPTY_OPPONENT_PROFILE;

  emitProgress(options, {
    stage: 'preparingSearch',
    candidateCount: scoredCandidates.length,
    completedAttempts: 0,
    totalAttempts: attempts.length,
    attemptCountFinal: true,
    currentDroppedTypes: [],
    currentDroppedClasses: [],
    elapsedMs: Math.max(0, now() - searchStartedAt),
    estimatedRemainingMs: null,
    messageKey: 'progress.preparingSearch',
    activeWorkerCount,
  });

  if (!scoredCandidates.length) {
    return [engine.createEmptyResult(0, input, attempts[0] ?? createExactAttempt(input))];
  }

  let bestPartials: RumbleTeamResult[] = [];
  let totalCompletedMs = 0;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    const attemptStartedAt = now();

    emitProgress(options, {
      stage: 'attempt',
      candidateCount: scoredCandidates.length,
      completedAttempts: index,
      totalAttempts: attempts.length,
      attemptCountFinal: true,
      currentDroppedTypes: attempt.droppedTypes,
      currentDroppedClasses: attempt.droppedClasses,
      elapsedMs: Math.max(0, attemptStartedAt - searchStartedAt),
      estimatedRemainingMs: estimateRemainingMs(totalCompletedMs, index, attempts.length),
      messageKey: 'progress.attempt',
      messageParams: {
        current: index + 1,
        total: attempts.length,
      },
      activeWorkerCount,
    });

    const results = engine.buildTeamVariantsFromScoredCandidates(
      scoredCandidates,
      input,
      attempt,
      opponentProfile,
      resultLimit,
      {
        resultMode: options.resultMode,
        onProgress: (progress) =>
          emitProgress(options, {
            stage: progress.stage,
            candidateCount: scoredCandidates.length,
            completedAttempts: index,
            totalAttempts: attempts.length,
            attemptCountFinal: true,
            currentDroppedTypes: attempt.droppedTypes,
            currentDroppedClasses: attempt.droppedClasses,
            elapsedMs: Math.max(0, now() - searchStartedAt),
            estimatedRemainingMs: estimateRemainingMs(totalCompletedMs, index, attempts.length),
            messageKey:
              progress.stage === 'selectingSlots'
                ? 'progress.selectingSlots'
                : 'progress.improvingTeam',
            messageParams: {
              current: progress.completedWorkUnits,
              total: progress.totalWorkUnits,
              slot: progress.currentSlot ?? 0,
              totalSlots: progress.totalSlots ?? 0,
              count: scoredCandidates.length,
            },
            completedWorkUnits: progress.completedWorkUnits,
            totalWorkUnits: progress.totalWorkUnits,
            currentSlot: progress.currentSlot,
            totalSlots: progress.totalSlots,
            checkedCandidates: progress.checkedCandidates,
            totalCandidatesToCheck: progress.totalCandidatesToCheck,
            retainedVariants: progress.retainedVariants,
            activeWorkerCount,
          }),
      },
    );
    const attemptDuration = Math.max(0, now() - attemptStartedAt);
    totalCompletedMs += attemptDuration;
    bestPartials = collectUniqueRumbleResults(
      [...bestPartials, ...results],
      resultLimit,
      compareRumblePartials,
    );

    const validResults = results.filter(
      (result) =>
        result.selectedCount >= resolveRequiredSlotCount(input) &&
        satisfiesAttemptCoverage(result, attempt),
    );

    if (validResults.length) {
      emitProgress(options, {
        stage: 'completed',
        candidateCount: scoredCandidates.length,
        completedAttempts: index + 1,
        totalAttempts: attempts.length,
        attemptCountFinal: true,
        currentDroppedTypes: attempt.droppedTypes,
        currentDroppedClasses: attempt.droppedClasses,
        elapsedMs: Math.max(0, now() - searchStartedAt),
        estimatedRemainingMs: 0,
        messageKey: 'progress.completed',
        activeWorkerCount,
      });
      return collectUniqueRumbleResults(validResults, resultLimit, resultComparator);
    }
  }

  const fallbackResults = bestPartials.length
    ? bestPartials
    : [
        engine.createEmptyResult(scoredCandidates.length, input, {
          ...attempts[0],
          resolvedTypes: [...input.types],
          droppedTypes: [],
        }),
      ];
  const primaryFallbackResult = fallbackResults[0];

  emitProgress(options, {
    stage: 'completed',
    candidateCount: scoredCandidates.length,
    completedAttempts: attempts.length,
    totalAttempts: attempts.length,
    attemptCountFinal: true,
    currentDroppedTypes: primaryFallbackResult.droppedTypes,
    currentDroppedClasses: primaryFallbackResult.droppedClasses,
    elapsedMs: Math.max(0, now() - searchStartedAt),
    estimatedRemainingMs: 0,
    messageKey: 'progress.completed',
    activeWorkerCount,
  });

  return fallbackResults;
}

export class RumbleTeamBuilderEngine {
  public buildTeamFromCandidates(
    candidates: CharacterDetailRecord[],
    requestedInput: Partial<RumbleBuildInput> = {},
    options: RumbleBuildSearchOptions = {},
  ): RumbleTeamResult {
    return runRumbleTeamBuildSearch(candidates, requestedInput, options);
  }

  public buildTeamsFromCandidates(
    candidates: CharacterDetailRecord[],
    requestedInput: Partial<RumbleBuildInput> = {},
    limit = 2,
    options: RumbleBuildSearchOptions = {},
  ): RumbleTeamResult[] {
    return runRumbleTeamBuildSearches(candidates, requestedInput, options, limit);
  }

  public buildTeamFromScoredCandidates(
    scoredCandidates: RumbleUnitScore[],
    input: RumbleBuildInput,
    attempt: RumbleBuildAttempt,
    opponentProfile: RumbleOpponentProfile = EMPTY_OPPONENT_PROFILE,
  ): RumbleTeamResult {
    return this.buildTeamVariantsFromScoredCandidates(
      scoredCandidates,
      input,
      attempt,
      opponentProfile,
      1,
    )[0];
  }

  public buildTeamVariantsFromScoredCandidates(
    scoredCandidates: RumbleUnitScore[],
    input: RumbleBuildInput,
    attempt: RumbleBuildAttempt,
    opponentProfile: RumbleOpponentProfile = EMPTY_OPPONENT_PROFILE,
    limit = 2,
    options: RumbleVariantBuildOptions = {},
  ): RumbleTeamResult[] {
    if (!scoredCandidates.length) {
      return [this.createEmptyResult(0, input, attempt)];
    }

    const resultMode = options.resultMode ?? 'score';
    const resultComparator = resolveRumbleResultComparator(resultMode);
    const targetCount = input.requireFullTeam ? RUMBLE_TOTAL_SLOT_COUNT : RUMBLE_ACTIVE_SLOT_COUNT;
    const scoreCache: RumbleTeamScoreCache = new Map();
    const greedyUnitGroups = this.pickGreedyTeamVariants(
      scoredCandidates,
      attempt,
      opponentProfile,
      targetCount,
      limit,
      scoreCache,
      options,
    );
    const selectedUnitGroups: RumbleUnitScore[][] = [];
    const plannedImprovementGroups = greedyUnitGroups.length + (greedyUnitGroups[0]?.length ?? 0);
    const improvementProgress: RumbleImprovementProgressState = {
      completedWorkUnits: 0,
      totalWorkUnits: Math.max(
        1,
        plannedImprovementGroups * 4 * targetCount * scoredCandidates.length,
      ),
      retainedVariants: plannedImprovementGroups,
    };

    greedyUnitGroups.forEach((units) => {
      selectedUnitGroups.push(
        this.improveTeam(
          units,
          scoredCandidates,
          attempt,
          opponentProfile,
          scoreCache,
          options,
          improvementProgress,
        ),
      );
    });
    selectedUnitGroups.push(...greedyUnitGroups);

    const primaryUnits = selectedUnitGroups[0] ?? [];

    primaryUnits.forEach((unitToAvoid) => {
      const alternateCandidates = scoredCandidates.filter(
        (candidate) => candidate.character.id !== unitToAvoid.character.id,
      );

      if (!alternateCandidates.length) {
        return;
      }

      const alternateUnits = this.pickGreedyTeam(
        alternateCandidates,
        attempt,
        opponentProfile,
        targetCount,
        scoreCache,
        resultMode,
      );

      selectedUnitGroups.push(
        this.improveTeam(
          alternateUnits,
          alternateCandidates,
          attempt,
          opponentProfile,
          scoreCache,
          options,
          improvementProgress,
        ),
        alternateUnits,
      );
    });

    return collectUniqueRumbleResults(
      selectedUnitGroups.map((selectedUnits) =>
        this.createResultFromSelectedUnits(
          selectedUnits,
          scoredCandidates.length,
          input,
          attempt,
          opponentProfile,
          scoreCache,
        ),
      ),
      normalizeResultLimit(limit),
      resultComparator,
    );
  }

  private createResultFromSelectedUnits(
    selectedUnits: RumbleUnitScore[],
    candidateCount: number,
    input: RumbleBuildInput,
    attempt: RumbleBuildAttempt,
    opponentProfile: RumbleOpponentProfile,
    scoreCache: RumbleTeamScoreCache = new Map(),
  ): RumbleTeamResult {
    const activeUnits = selectedUnits.slice(0, RUMBLE_ACTIVE_SLOT_COUNT);
    const benchUnits = input.requireFullTeam
      ? selectedUnits.slice(RUMBLE_ACTIVE_SLOT_COUNT, RUMBLE_TOTAL_SLOT_COUNT)
      : [];
    const activeSlots = activeUnits.map((unit, index) =>
      this.createSlot('active', index, unit, opponentProfile),
    );
    const benchSlots = benchUnits.map((unit, index) =>
      this.createSlot('bench', index, unit, opponentProfile),
    );
    const allUnits = [...activeUnits, ...benchUnits];
    const roleCoverage = this.collectRoleCoverage(allUnits);
    const typeCoverage = this.collectTypeCoverage(allUnits);
    const classCoverage = this.collectClassCoverage(allUnits);
    const totalScore = this.scoreTeamCached(allUnits, attempt, opponentProfile, scoreCache);

    return {
      activeSlots,
      benchSlots,
      candidateCount,
      selectedCount: activeSlots.length + benchSlots.length,
      totalScore: Math.round(totalScore),
      roleCoverage,
      typeCoverage,
      classCoverage,
      topFactors: this.buildTopFactors(activeUnits, benchUnits, roleCoverage, opponentProfile),
      input,
      requestedTypes: [...input.types],
      requestedClasses: [...input.selectedClasses],
      resolvedTypes: [...attempt.resolvedTypes],
      resolvedClasses: [...attempt.resolvedClasses],
      droppedTypes: [...attempt.droppedTypes],
      droppedClasses: [...attempt.droppedClasses],
    };
  }

  public scoreCandidates(
    candidates: CharacterDetailRecord[],
    options: RumbleCandidateScoringOptions = {},
  ): RumbleUnitScore[] {
    const byCharacterId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const scoredCandidates: RumbleUnitScore[] = [];

    this.emitCandidateScoringProgress(options, 0, candidates.length);

    candidates.forEach((candidate, index) => {
      const normalized = this.normalizeRumbleData(candidate, byCharacterId);

      if (normalized) {
        scoredCandidates.push(this.scoreCandidate(candidate, normalized));
      }

      const checkedCandidates = index + 1;

      if (
        checkedCandidates % RUMBLE_PROGRESS_EMIT_INTERVAL === 0 ||
        checkedCandidates === candidates.length
      ) {
        this.emitCandidateScoringProgress(options, checkedCandidates, candidates.length);
      }
    });

    return scoredCandidates.sort(compareUnitScores);
  }

  public createOpponentProfile(
    scoredCandidates: RumbleUnitScore[],
    opponentSlots: RumbleOpponentSlotContext[],
  ): RumbleOpponentProfile {
    if (!opponentSlots.length) {
      return EMPTY_OPPONENT_PROFILE;
    }

    const candidatesById = new Map(
      scoredCandidates.map((candidate) => [candidate.character.id, candidate]),
    );
    const seenSlotKeys = new Set<string>();
    const units: RumbleOpponentUnit[] = [];
    const attributeThreatWeights = new Map<OpponentCounterAttribute, number>();
    const debuffThreatWeights = new Map<OpponentCounterAttribute, number>();
    const typeWeights = new Map<string, number>();

    opponentSlots.forEach((slot) => {
      const unit = candidatesById.get(slot.characterId);
      const slotKey = `${slot.role}:${slot.index}`;

      if (!unit || seenSlotKeys.has(slotKey)) {
        return;
      }

      seenSlotKeys.add(slotKey);
      const weight = slot.role === 'bench' ? BENCH_SLOT_WEIGHT : ACTIVE_SLOT_WEIGHT;
      units.push({ unit, slot, weight });

      this.addOpponentThreatWeight(
        attributeThreatWeights,
        'HP',
        ((unit.character.stats.max.hp ?? 0) / 900) * weight,
      );
      this.addOpponentThreatWeight(
        attributeThreatWeights,
        'ATK',
        ((unit.character.stats.max.atk ?? 0) / 260) * weight,
      );
      this.addOpponentThreatWeight(
        attributeThreatWeights,
        'RCV',
        ((unit.character.stats.max.rcv ?? 0) / 110) * weight,
      );
      this.addOpponentThreatWeight(
        attributeThreatWeights,
        'DEF',
        ((unit.normalized.def ?? 0) / 24) * weight,
      );
      this.addOpponentThreatWeight(
        attributeThreatWeights,
        'SPD',
        ((unit.normalized.spd ?? 0) / 24) * weight,
      );

      if (unit.normalized.cooldown !== null) {
        this.addOpponentThreatWeight(
          attributeThreatWeights,
          'Special CT',
          (Math.max(0, 45 - unit.normalized.cooldown) / 4) * weight,
        );
      }

      this.resolveCharacterTypes(unit.character).forEach((type) =>
        this.addOpponentThreatWeight(typeWeights, type, weight),
      );

      this.resolveMaxLevelEffects(unit.normalized)
        .filter((effect) => this.isEnemyDebuffEffect(effect))
        .forEach((effect) => {
          const attributes = this.resolveOpponentCounterAttributes(effect);
          const effectWeight =
            this.resolveEffectStrength(effect) *
            this.resolveEnemyCoverageWeight(effect) *
            this.resolveEffectSourceWeight(effect) *
            this.resolveConditionalWeight(effect) *
            weight;

          attributes.forEach((attribute) =>
            this.addOpponentThreatWeight(debuffThreatWeights, attribute, effectWeight),
          );
        });
    });

    if (!units.length) {
      return EMPTY_OPPONENT_PROFILE;
    }

    return {
      units,
      totalWeight: units.reduce((total, unit) => total + unit.weight, 0),
      attributeThreatWeights,
      debuffThreatWeights,
      typeWeights,
    };
  }

  public normalizeRumbleData(
    character: CharacterDetailRecord,
    charactersById: ReadonlyMap<number, CharacterDetailRecord>,
  ): NormalizedRumbleData | null {
    return this.normalizeRumbleDataWithVisited(character, charactersById, new Set<number>());
  }

  public createEmptyResult(
    candidateCount: number,
    input: RumbleBuildInput = EMPTY_INPUT,
    attempt: RumbleBuildAttempt = createExactAttempt(input),
  ): RumbleTeamResult {
    return {
      activeSlots: [],
      benchSlots: [],
      candidateCount,
      selectedCount: 0,
      totalScore: 0,
      roleCoverage: [],
      typeCoverage: [],
      classCoverage: [],
      topFactors: [],
      input,
      requestedTypes: [...input.types],
      requestedClasses: [...input.selectedClasses],
      resolvedTypes: [...attempt.resolvedTypes],
      resolvedClasses: [...attempt.resolvedClasses],
      droppedTypes: [...attempt.droppedTypes],
      droppedClasses: [...attempt.droppedClasses],
    };
  }

  private normalizeRumbleDataWithVisited(
    character: CharacterDetailRecord,
    charactersById: ReadonlyMap<number, CharacterDetailRecord>,
    visitedCharacterIds: Set<number>,
  ): NormalizedRumbleData | null {
    const raw = asRecord(character.detail.rumbleData);

    if (!raw || Object.keys(raw).length === 0) {
      return null;
    }

    const basedOnId = toPositiveInteger(raw['basedOn']);
    const inherited =
      basedOnId && !visitedCharacterIds.has(basedOnId)
        ? (() => {
            const basedOnCharacter = charactersById.get(basedOnId);

            if (!basedOnCharacter) {
              return null;
            }

            return this.normalizeRumbleDataWithVisited(
              basedOnCharacter,
              charactersById,
              new Set([...visitedCharacterIds, character.id]),
            );
          })()
        : null;
    const stats = asRecord(raw['stats']) ?? inherited?.raw['stats'];
    const rawAbility = Array.isArray(raw['ability']) ? raw['ability'] : inherited?.raw['ability'];
    const rawSpecial = Array.isArray(raw['special']) ? raw['special'] : inherited?.raw['special'];
    const rawResilience = Array.isArray(raw['resilience'])
      ? raw['resilience']
      : inherited?.raw['resilience'];
    const rawLlbResilience = Array.isArray(raw['llbresilience'])
      ? raw['llbresilience']
      : inherited?.raw['llbresilience'];
    const passiveEffects = this.normalizeLevelEffects(rawAbility, 'ability');
    const specialEffects = this.normalizeLevelEffects(rawSpecial, 'special');
    const maxPassiveSummary = this.resolveMaxLevelSummary(rawAbility);
    const maxSpecialSummary = this.resolveMaxLevelSummary(rawSpecial);
    const roleTags = this.resolveRoleTags(passiveEffects, specialEffects, stats);
    const normalized: NormalizedRumbleData = {
      raw: {
        ...(inherited?.raw ?? {}),
        ...raw,
      },
      basedOnId,
      rumbleType: sanitizeText(asRecord(stats)?.['rumbleType']) ?? inherited?.rumbleType ?? null,
      def: toFiniteNumber(asRecord(stats)?.['def']) ?? inherited?.def ?? null,
      spd: toFiniteNumber(asRecord(stats)?.['spd']) ?? inherited?.spd ?? null,
      cost: toFiniteNumber(raw['cost']) ?? inherited?.cost ?? character.cost,
      cooldown: this.resolveBestCooldown(rawSpecial) ?? inherited?.cooldown ?? null,
      targetLabel: this.formatTarget(raw['target']) ?? inherited?.targetLabel ?? null,
      patternCount: Array.isArray(raw['pattern'])
        ? raw['pattern'].length
        : (inherited?.patternCount ?? 0),
      maxPassiveLevel: this.resolveLevelCount(rawAbility) ?? inherited?.maxPassiveLevel ?? null,
      maxSpecialLevel: this.resolveLevelCount(rawSpecial) ?? inherited?.maxSpecialLevel ?? null,
      maxPassiveEffects: maxPassiveSummary?.effects.length
        ? maxPassiveSummary.effects
        : (inherited?.maxPassiveEffects ?? []),
      maxSpecialEffects: maxSpecialSummary?.effects.length
        ? maxSpecialSummary.effects
        : (inherited?.maxSpecialEffects ?? []),
      maxSpecialCooldown: maxSpecialSummary?.cooldown ?? inherited?.maxSpecialCooldown ?? null,
      baseResistances: this.formatResistances(rawResilience),
      llbResistances: this.formatResistances(rawLlbResilience),
      passiveEffects: passiveEffects.length ? passiveEffects : (inherited?.passiveEffects ?? []),
      specialEffects: specialEffects.length ? specialEffects : (inherited?.specialEffects ?? []),
      roleTags: roleTags.length ? roleTags : (inherited?.roleTags ?? []),
    };

    return this.hasUsableRumblePayload(normalized) ? normalized : null;
  }

  private scoreCandidate(
    character: CharacterDetailRecord,
    normalized: NormalizedRumbleData,
  ): RumbleUnitScore {
    const statScore =
      (character.stats.max.hp ?? 0) / 120 +
      (character.stats.max.atk ?? 0) / 18 +
      (character.stats.max.rcv ?? 0) / 45 +
      (normalized.def ?? 0) * 1.4 +
      (normalized.spd ?? 0) * 0.9;
    const passiveScore = normalized.passiveEffects.reduce(
      (total, effect) => total + this.scoreEffect(effect, 'ability'),
      0,
    );
    const specialScore =
      normalized.specialEffects.reduce(
        (total, effect) => total + this.scoreEffect(effect, 'special'),
        0,
      ) + (normalized.cooldown ? Math.max(0, 40 - normalized.cooldown) * 3.5 : 0);
    const recencyScore = character.id / 10000;
    const roleScore = normalized.roleTags.length * 12;
    const total = statScore + passiveScore + specialScore + recencyScore + roleScore;
    const breakdown: RumbleScoreBreakdown = {
      statScore: Math.round(statScore),
      passiveScore: Math.round(passiveScore + roleScore),
      specialScore: Math.round(specialScore),
      synergyScore: 0,
      recencyScore: Math.round(recencyScore),
      total: Math.round(total),
    };

    return {
      character,
      normalized,
      baseScore: total,
      breakdown,
      reasonChips: this.buildUnitReasonChips(normalized, breakdown),
      conflictKeys: this.resolveConflictKeys(character),
    };
  }

  private pickGreedyTeam(
    scoredCandidates: RumbleUnitScore[],
    attempt: RumbleBuildAttempt,
    opponentProfile: RumbleOpponentProfile,
    targetCount: number,
    scoreCache: RumbleTeamScoreCache = new Map(),
    resultMode: RumbleBuildResultMode = 'score',
  ): RumbleUnitScore[] {
    const selected: RumbleUnitScore[] = [];

    while (selected.length < targetCount) {
      const next = scoredCandidates
        .filter(
          (candidate) => !selected.some((unit) => unit.character.id === candidate.character.id),
        )
        .filter((candidate) => !this.hasConflict(candidate, selected))
        .filter((candidate) => this.isWithinRumbleCostLimit([...selected, candidate]))
        .map((candidate) => ({
          candidate,
          units: [...selected, candidate],
          score: this.scoreTeamCached(
            [...selected, candidate],
            attempt,
            opponentProfile,
            scoreCache,
          ),
        }))
        .sort(
          (left, right) =>
            compareRumbleScoredUnitGroups(
              {
                units: left.units,
                score: left.score,
                key: buildUnitGroupKey(left.units),
              },
              {
                units: right.units,
                score: right.score,
                key: buildUnitGroupKey(right.units),
              },
              resultMode,
              targetCount,
            ) || compareUnitScores(left.candidate, right.candidate),
        )[0];

      if (!next) {
        break;
      }

      selected.push(next.candidate);
    }

    return selected;
  }

  private pickGreedyTeamVariants(
    scoredCandidates: RumbleUnitScore[],
    attempt: RumbleBuildAttempt,
    opponentProfile: RumbleOpponentProfile,
    targetCount: number,
    limit: number,
    scoreCache: RumbleTeamScoreCache,
    options: RumbleVariantBuildOptions = {},
  ): RumbleUnitScore[][] {
    const resultMode = options.resultMode ?? 'score';
    const resultLimit = normalizeResultLimit(limit);
    const beamWidth =
      resultMode === 'closestCost' ? Math.max(resultLimit * 8, 48) : Math.max(resultLimit * 4, 8);
    let variants: RumbleUnitScore[][] = [[]];
    let completedWorkUnits = 0;
    const totalWorkUnits = Math.max(
      scoredCandidates.length,
      scoredCandidates.length * (1 + Math.max(0, targetCount - 1) * beamWidth),
    );

    for (let slotIndex = 0; slotIndex < targetCount; slotIndex += 1) {
      const nextVariants: RumbleScoredUnitGroup[] = [];
      const totalCandidatesToCheck = variants.length * scoredCandidates.length;
      let checkedCandidates = 0;

      variants.forEach((selected) => {
        const selectedIds = new Set(selected.map((unit) => unit.character.id));

        scoredCandidates.forEach((candidate) => {
          checkedCandidates += 1;
          completedWorkUnits += 1;

          if (
            completedWorkUnits % RUMBLE_PROGRESS_EMIT_INTERVAL === 0 ||
            checkedCandidates === totalCandidatesToCheck
          ) {
            options.onProgress?.({
              stage: 'selectingSlots',
              completedWorkUnits: Math.min(completedWorkUnits, totalWorkUnits),
              totalWorkUnits,
              currentSlot: slotIndex + 1,
              totalSlots: targetCount,
              checkedCandidates,
              totalCandidatesToCheck,
              retainedVariants: variants.length,
            });
          }

          if (selectedIds.has(candidate.character.id)) {
            return;
          }

          if (this.hasConflict(candidate, selected)) {
            return;
          }

          const nextUnits = [...selected, candidate];

          if (!this.isWithinRumbleCostLimit(nextUnits)) {
            return;
          }

          nextVariants.push({
            units: nextUnits,
            score: this.scoreTeamCached(nextUnits, attempt, opponentProfile, scoreCache),
            key: buildUnitGroupKey(nextUnits),
          });
        });
      });

      if (!nextVariants.length) {
        break;
      }

      variants = dedupeScoredUnitGroups(nextVariants)
        .sort((left, right) =>
          compareRumbleScoredUnitGroups(left, right, resultMode, targetCount),
        )
        .slice(0, beamWidth)
        .map((variant) => variant.units);

      options.onProgress?.({
        stage: 'selectingSlots',
        completedWorkUnits: Math.min(completedWorkUnits, totalWorkUnits),
        totalWorkUnits,
        currentSlot: slotIndex + 1,
        totalSlots: targetCount,
        checkedCandidates,
        totalCandidatesToCheck,
        retainedVariants: variants.length,
      });
    }

    if (!variants.length || variants.every((variant) => variant.length === 0)) {
      return [
        this.pickGreedyTeam(
          scoredCandidates,
          attempt,
          opponentProfile,
          targetCount,
          scoreCache,
          resultMode,
        ),
      ];
    }

    return variants;
  }

  private improveTeam(
    units: RumbleUnitScore[],
    scoredCandidates: RumbleUnitScore[],
    attempt: RumbleBuildAttempt,
    opponentProfile: RumbleOpponentProfile,
    scoreCache: RumbleTeamScoreCache,
    options: RumbleVariantBuildOptions = {},
    progressState: RumbleImprovementProgressState = {
      completedWorkUnits: 0,
      totalWorkUnits: Math.max(1, 4 * Math.max(1, units.length) * scoredCandidates.length),
      retainedVariants: 1,
    },
  ): RumbleUnitScore[] {
    const resultMode = options.resultMode ?? 'score';
    const targetCount = Math.max(1, units.length);
    let current = [...units];

    for (let pass = 0; pass < 4; pass += 1) {
      const currentScore = this.scoreTeamCached(current, attempt, opponentProfile, scoreCache);
      let bestTeam = current;
      let bestScore = currentScore;
      let checkedCandidates = 0;
      const totalCandidatesToCheck = current.length * scoredCandidates.length;

      current.forEach((_existingUnit, existingIndex) => {
        scoredCandidates.forEach((candidate) => {
          checkedCandidates += 1;
          progressState.completedWorkUnits += 1;

          if (
            progressState.completedWorkUnits % RUMBLE_PROGRESS_EMIT_INTERVAL === 0 ||
            checkedCandidates === totalCandidatesToCheck
          ) {
            options.onProgress?.({
              stage: 'improvingTeam',
              completedWorkUnits: Math.min(
                progressState.completedWorkUnits,
                progressState.totalWorkUnits,
              ),
              totalWorkUnits: progressState.totalWorkUnits,
              checkedCandidates,
              totalCandidatesToCheck,
              retainedVariants: progressState.retainedVariants,
            });
          }

          if (current.some((unit) => unit.character.id === candidate.character.id)) {
            return;
          }

          const nextTeam = current.map((unit, index) =>
            index === existingIndex ? candidate : unit,
          );

          if (!this.isWithinRumbleCostLimit(nextTeam)) {
            return;
          }

          if (
            this.hasConflict(
              candidate,
              nextTeam.filter((unit) => unit !== candidate),
            )
          ) {
            return;
          }

          const nextScore = this.scoreTeamCached(nextTeam, attempt, opponentProfile, scoreCache);

          const nextGroup: RumbleScoredUnitGroup = {
            units: nextTeam,
            score: nextScore,
            key: buildUnitGroupKey(nextTeam),
          };
          const bestGroup: RumbleScoredUnitGroup = {
            units: bestTeam,
            score: bestScore,
            key: buildUnitGroupKey(bestTeam),
          };

          if (compareRumbleScoredUnitGroups(nextGroup, bestGroup, resultMode, targetCount) < 0) {
            bestTeam = nextTeam;
            bestScore = nextScore;
          }
        });
      });

      if (
        bestTeam === current ||
        compareRumbleScoredUnitGroups(
          {
            units: bestTeam,
            score: bestScore,
            key: buildUnitGroupKey(bestTeam),
          },
          {
            units: current,
            score: currentScore,
            key: buildUnitGroupKey(current),
          },
          resultMode,
          targetCount,
        ) >= 0
      ) {
        break;
      }

      current = bestTeam;
    }

    return current;
  }

  private scoreTeam(
    units: RumbleUnitScore[],
    attempt: RumbleBuildAttempt,
    opponentProfile: RumbleOpponentProfile,
  ): number {
    const typeCounts = new Map<string, number>();
    const classCounts = new Map<string, number>();
    const roleSet = new Set<NormalizedRumbleRoleTag>();
    const rumbleTypes = new Set<string>();

    units.forEach((unit) => {
      this.resolveCharacterTypes(unit.character).forEach((type) =>
        typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1),
      );
      unit.character.classes.forEach((characterClass) =>
        classCounts.set(characterClass, (classCounts.get(characterClass) ?? 0) + 1),
      );
      unit.normalized.roleTags.forEach((role) => roleSet.add(role));

      if (unit.normalized.rumbleType) {
        rumbleTypes.add(unit.normalized.rumbleType);
      }
    });

    const sameTypeSynergy = [...typeCounts.values()].reduce(
      (total, count) => total + Math.max(0, count - 1) * 18,
      0,
    );
    const sameClassSynergy = [...classCounts.values()].reduce(
      (total, count) => total + Math.max(0, count - 1) * 12,
      0,
    );
    const roleCoverageSynergy = roleSet.size * 22;
    const rumbleTypeCoverageSynergy = rumbleTypes.size * 8;
    const coveredRequestedTypes = attempt.resolvedTypes.filter((type) =>
      typeCounts.has(type),
    ).length;
    const coveredRequestedClasses = attempt.resolvedClasses.filter((characterClass) =>
      classCounts.has(characterClass),
    ).length;
    const coverageBonus =
      coveredRequestedTypes * 650 +
      coveredRequestedClasses * 520 +
      (coveredRequestedTypes === attempt.resolvedTypes.length ? 1200 : 0) +
      (coveredRequestedClasses === attempt.resolvedClasses.length ? 1000 : 0);

    return (
      units.reduce(
        (total, unit, index) => total + unit.baseScore * this.resolveSlotWeight(index),
        0,
      ) +
      sameTypeSynergy +
      sameClassSynergy +
      roleCoverageSynergy +
      rumbleTypeCoverageSynergy +
      this.scoreRumbleEffectSynergy(units, attempt.buffFocus) +
      this.scoreOpponentCounterSynergy(units, opponentProfile) +
      coverageBonus
    );
  }

  private scoreTeamCached(
    units: RumbleUnitScore[],
    attempt: RumbleBuildAttempt,
    opponentProfile: RumbleOpponentProfile,
    scoreCache: RumbleTeamScoreCache,
  ): number {
    const key = buildUnitGroupKey(units);
    const cachedScore = scoreCache.get(key);

    if (cachedScore !== undefined) {
      return cachedScore;
    }

    const score = this.scoreTeam(units, attempt, opponentProfile);

    scoreCache.set(key, score);

    return score;
  }

  private emitCandidateScoringProgress(
    options: RumbleCandidateScoringOptions,
    checkedCandidates: number,
    totalCandidatesToCheck: number,
  ): void {
    options.onProgress?.({
      completedWorkUnits: checkedCandidates,
      totalWorkUnits: totalCandidatesToCheck,
      checkedCandidates,
      totalCandidatesToCheck,
    });
  }

  private scoreRumbleEffectSynergy(
    units: RumbleUnitScore[],
    buffFocus: RumbleBuffFocusPreference[],
  ): number {
    const activeUnits = units.slice(0, RUMBLE_ACTIVE_SLOT_COUNT);

    return activeUnits.reduce((total, unit, sourceIndex) => {
      const sourceWeight = ACTIVE_SLOT_WEIGHT;
      const maxEffects = this.resolveMaxLevelEffects(unit.normalized);
      const buffScore = maxEffects.reduce(
        (effectTotal, effect) =>
          effectTotal +
          this.scoreTeamBuffEffect(effect, unit, sourceIndex, activeUnits, buffFocus) *
            sourceWeight,
        0,
      );

      return total + buffScore;
    }, 0);
  }

  private scoreOpponentCounterSynergy(
    units: RumbleUnitScore[],
    opponentProfile: RumbleOpponentProfile,
  ): number {
    if (!opponentProfile.units.length) {
      return 0;
    }

    return units
      .slice(0, RUMBLE_ACTIVE_SLOT_COUNT)
      .reduce(
        (total, unit) =>
          total + this.scoreUnitOpponentCounters(unit, opponentProfile) * ACTIVE_SLOT_WEIGHT,
        0,
      );
  }

  private scoreUnitOpponentCounters(
    unit: RumbleUnitScore,
    opponentProfile: RumbleOpponentProfile,
  ): number {
    if (!opponentProfile.units.length) {
      return 0;
    }

    const debuffScore = this.resolveMaxLevelEffects(unit.normalized)
      .filter((effect) => this.isEnemyDebuffEffect(effect))
      .reduce(
        (total, effect) => total + this.scoreOpponentDebuffCounter(effect, opponentProfile),
        0,
      );
    const resistanceScore = this.scoreOpponentResistanceCounters(unit, opponentProfile);

    return debuffScore + resistanceScore;
  }

  private scoreOpponentDebuffCounter(
    effect: NormalizedRumbleEffect,
    opponentProfile: RumbleOpponentProfile,
  ): number {
    const attributes = this.resolveOpponentCounterAttributes(effect);

    if (!attributes.length) {
      return 0;
    }

    const threatWeight = attributes.reduce(
      (total, attribute) => total + (opponentProfile.attributeThreatWeights.get(attribute) ?? 0),
      0,
    );

    if (threatWeight <= 0) {
      return 0;
    }

    const broadTargetWeight =
      effect.targetCount === null || effect.targetCount <= 0
        ? Math.max(1, opponentProfile.totalWeight)
        : Math.min(Math.max(1, opponentProfile.totalWeight), effect.targetCount);

    return (
      (this.scoreSynergyAttributes(
        attributes.filter((attribute): attribute is RumbleBuffFocusStat =>
          this.isRumbleSynergyAttribute(attribute),
        ),
      ) *
        0.45 +
        18) *
      this.resolveEffectStrength(effect) *
      this.resolveEffectSourceWeight(effect) *
      this.resolveConditionalWeight(effect) *
      Math.min(2.5, Math.max(0.7, broadTargetWeight)) *
      Math.min(2.4, Math.max(0.8, threatWeight / 9))
    );
  }

  private scoreOpponentResistanceCounters(
    unit: RumbleUnitScore,
    opponentProfile: RumbleOpponentProfile,
  ): number {
    const resistanceTexts = [...unit.normalized.baseResistances, ...unit.normalized.llbResistances];

    return resistanceTexts.reduce((total, resistanceText) => {
      const debuffResistance = this.parseDebuffResistance(resistanceText);

      if (debuffResistance) {
        const threatWeight =
          opponentProfile.debuffThreatWeights.get(debuffResistance.attribute) ?? 0;

        if (threatWeight > 0) {
          return total + Math.min(170, (debuffResistance.chance / 100) * threatWeight * 18);
        }
      }

      const damageResistance = this.parseTypeDamageResistance(resistanceText);

      if (damageResistance) {
        const typeWeight = opponentProfile.typeWeights.get(damageResistance.type) ?? 0;

        if (typeWeight > 0) {
          return total + Math.min(130, (damageResistance.percentage / 100) * typeWeight * 135);
        }
      }

      return total;
    }, 0);
  }

  private resolveMaxLevelEffects(normalized: NormalizedRumbleData): NormalizedRumbleEffect[] {
    return [...normalized.passiveEffects, ...normalized.specialEffects].filter(
      (effect) => effect.sourceLevel !== null && effect.sourceLevel === effect.maxSourceLevel,
    );
  }

  private scoreTeamBuffEffect(
    effect: NormalizedRumbleEffect,
    sourceUnit: RumbleUnitScore,
    sourceIndex: number,
    units: RumbleUnitScore[],
    buffFocus: RumbleBuffFocusPreference[],
  ): number {
    if (!this.isTeamBuffEffect(effect)) {
      return 0;
    }

    const attributes = this.resolveSynergyAttributes(effect);

    if (!attributes.length) {
      return 0;
    }

    const recipientWeight = this.resolveBuffRecipientWeight(effect, sourceUnit, sourceIndex, units);

    if (recipientWeight <= 0) {
      return 0;
    }

    return (
      this.scoreSynergyAttributes(attributes, buffFocus) *
      this.resolveEffectStrength(effect) *
      recipientWeight *
      this.resolveEffectSourceWeight(effect) *
      this.resolveConditionalWeight(effect)
    );
  }

  private isTeamBuffEffect(effect: NormalizedRumbleEffect): boolean {
    const normalizedEffect = effect.effect.toLowerCase();

    return (
      normalizedEffect.includes('buff') ||
      normalizedEffect.includes('boost') ||
      normalizedEffect.includes('recharge')
    );
  }

  private isEnemyDebuffEffect(effect: NormalizedRumbleEffect): boolean {
    const normalizedEffect = effect.effect.toLowerCase();

    return (
      effect.targetScope === 'enemies' &&
      (normalizedEffect.includes('debuff') || normalizedEffect.includes('hinderance'))
    );
  }

  private resolveBuffRecipientWeight(
    effect: NormalizedRumbleEffect,
    sourceUnit: RumbleUnitScore,
    sourceIndex: number,
    units: RumbleUnitScore[],
  ): number {
    if (effect.targetScope === 'self') {
      return 0;
    }

    const matchedWeights = units
      .map((unit, index) => ({ unit, index }))
      .filter(({ index }) => index !== sourceIndex)
      .filter(({ unit }) =>
        this.effectTargetsCharacter(effect, sourceUnit.character, unit.character),
      )
      .map(({ index }) => this.resolveSlotWeight(index));
    const totalWeight = matchedWeights.reduce((total, weight) => total + weight, 0);

    if (effect.targetCount === null || effect.targetCount <= 0) {
      return totalWeight;
    }

    return Math.min(totalWeight, effect.targetCount);
  }

  private effectTargetsCharacter(
    effect: NormalizedRumbleEffect,
    sourceCharacter: CharacterDetailRecord,
    targetCharacter: CharacterDetailRecord,
  ): boolean {
    if (effect.targetScope === 'crew') {
      return true;
    }

    if (effect.targetScope === 'self') {
      return sourceCharacter.id === targetCharacter.id;
    }

    if (effect.targetScope === 'unknown') {
      return true;
    }

    if (effect.targetScope !== 'subset') {
      return false;
    }

    const characterTokens = this.resolveCharacterMatchTokens(targetCharacter);

    return effect.targetTokens.some((token) =>
      characterTokens.has(this.normalizeMatchToken(token)),
    );
  }

  private resolveCharacterMatchTokens(character: CharacterDetailRecord): Set<string> {
    const tokens = new Set<string>();

    this.resolveCharacterTypes(character).forEach((type) => {
      tokens.add(this.normalizeMatchToken(type));
      tokens.add(this.normalizeMatchToken(`[${type}]`));
    });
    character.classes.forEach((characterClass) =>
      tokens.add(this.normalizeMatchToken(characterClass)),
    );
    character.detail.characterTags?.forEach((tag) => tokens.add(this.normalizeMatchToken(tag)));

    return tokens;
  }

  private resolveSynergyAttributes(effect: NormalizedRumbleEffect): RumbleBuffFocusStat[] {
    const rawAttributes =
      effect.attributes.length > 0 ? effect.attributes : effect.type ? [effect.type] : [];
    const attributes = rawAttributes
      .map((attribute) => this.normalizeSynergyAttribute(attribute))
      .filter((attribute): attribute is RumbleBuffFocusStat => Boolean(attribute));

    return [...new Set(attributes)];
  }

  private resolveOpponentCounterAttributes(
    effect: NormalizedRumbleEffect,
  ): OpponentCounterAttribute[] {
    const rawAttributes = [
      ...effect.attributes,
      effect.type,
      effect.targetStat,
      effect.effect,
    ].filter((attribute): attribute is string => Boolean(attribute));
    const attributes = rawAttributes
      .map((attribute) => this.normalizeOpponentCounterAttribute(attribute))
      .filter((attribute): attribute is OpponentCounterAttribute => Boolean(attribute));

    return [...new Set(attributes)];
  }

  private normalizeOpponentCounterAttribute(value: string): OpponentCounterAttribute | null {
    const normalized = this.normalizeMatchToken(value);

    if (!normalized || normalized === 'debuff' || normalized === 'hinderance') {
      return null;
    }

    if (normalized === 'special cooldown' || normalized === 'ct') {
      return 'Special CT';
    }

    const synergyAttribute = RUMBLE_BUFF_FOCUS_STATS.find(
      (attribute) => attribute.toLowerCase() === normalized,
    );

    return synergyAttribute ?? normalized.replace(/\b\w/g, (character) => character.toUpperCase());
  }

  private isRumbleSynergyAttribute(
    value: OpponentCounterAttribute,
  ): value is RumbleBuffFocusStat {
    return RUMBLE_BUFF_FOCUS_STATS.includes(value as RumbleBuffFocusStat);
  }

  private normalizeSynergyAttribute(value: string): RumbleBuffFocusStat | null {
    const normalized = value
      .replace(/^\[([^\]]+)\]$/, '$1')
      .trim()
      .toLowerCase();

    if (normalized === 'special ct' || normalized === 'ct' || normalized === 'special cooldown') {
      return 'Special CT';
    }

    return (
      RUMBLE_BUFF_FOCUS_STATS.find((attribute) => attribute.toLowerCase() === normalized) ?? null
    );
  }

  private scoreSynergyAttributes(
    attributes: RumbleBuffFocusStat[],
    buffFocus: RumbleBuffFocusPreference[] = DEFAULT_RUMBLE_BUFF_FOCUS,
  ): number {
    const focusWeights = buildRumbleBuffFocusWeightMap(buffFocus);

    return attributes.reduce(
      (total, attribute) =>
        total + RUMBLE_SYNERGY_ATTRIBUTE_WEIGHTS[attribute] * focusWeights[attribute],
      0,
    );
  }

  private addOpponentThreatWeight<T extends string>(
    map: Map<T, number>,
    key: T,
    weight: number,
  ): void {
    if (weight <= 0) {
      return;
    }

    map.set(key, (map.get(key) ?? 0) + weight);
  }

  private parseDebuffResistance(
    value: string,
  ): { attribute: OpponentCounterAttribute; chance: number } | null {
    const match = value.match(/^(\d+(?:\.\d+)?)%\s+chance to resist\s+(.+)$/i);

    if (!match) {
      return null;
    }

    const attribute = this.normalizeOpponentCounterAttribute(match[2]);
    const chance = toFiniteNumber(match[1]);

    return attribute && chance !== null ? { attribute, chance } : null;
  }

  private parseTypeDamageResistance(value: string): { type: string; percentage: number } | null {
    const match = value.match(/^(\d+(?:\.\d+)?)%\s+damage reduction from\s+([A-Z]+)\s+enemies$/i);

    if (!match) {
      return null;
    }

    const percentage = toFiniteNumber(match[1]);
    const type = match[2].toUpperCase();

    return percentage !== null ? { type, percentage } : null;
  }

  private resolveEffectStrength(effect: NormalizedRumbleEffect): number {
    if (effect.level !== null) {
      return Math.max(1, effect.level);
    }

    if (effect.amount !== null) {
      return Math.max(1, Math.min(10, Math.abs(effect.amount)));
    }

    if (effect.chance !== null) {
      return Math.max(1, Math.min(10, effect.chance / 10));
    }

    return 1;
  }

  private resolveEnemyCoverageWeight(effect: NormalizedRumbleEffect): number {
    if (effect.targetCount !== null && effect.targetCount > 0) {
      return Math.min(2, Math.max(0.75, effect.targetCount * 0.75));
    }

    return 5;
  }

  private resolveEffectSourceWeight(effect: NormalizedRumbleEffect): number {
    return effect.source === 'special' ? 1.15 : 1;
  }

  private resolveConditionalWeight(effect: NormalizedRumbleEffect): number {
    return effect.isConditional ? 0.7 : 1;
  }

  private resolveSlotWeight(index: number): number {
    return index < RUMBLE_ACTIVE_SLOT_COUNT ? ACTIVE_SLOT_WEIGHT : BENCH_SLOT_WEIGHT;
  }

  private isWithinRumbleCostLimit(units: RumbleUnitScore[]): boolean {
    return this.resolveTotalRumbleCost(units) <= RUMBLE_TEAM_COST_LIMIT;
  }

  private resolveTotalRumbleCost(units: RumbleUnitScore[]): number {
    return resolveRumbleUnitGroupCost(units);
  }

  private resolveRumbleCost(unit: RumbleUnitScore): number {
    return resolveRumbleUnitCost(unit);
  }

  private normalizeLevelEffects(
    rawLevels: unknown,
    source: NormalizedRumbleEffect['source'],
  ): NormalizedRumbleEffect[] {
    if (!Array.isArray(rawLevels)) {
      return [];
    }

    const maxSourceLevel = rawLevels.length;

    return rawLevels.flatMap((levelEntry, index) => {
      const levelRecord = asRecord(levelEntry);
      const effects = Array.isArray(levelRecord?.['effects']) ? levelRecord['effects'] : [];
      const sourceLevel = index + 1;

      return effects
        .map((effect) => this.normalizeEffect(effect, source, sourceLevel, maxSourceLevel))
        .filter((effect): effect is NormalizedRumbleEffect => Boolean(effect));
    });
  }

  private normalizeEffect(
    value: unknown,
    source: NormalizedRumbleEffect['source'],
    sourceLevel: number | null = null,
    maxSourceLevel: number | null = null,
  ): NormalizedRumbleEffect | null {
    const record = asRecord(value);
    const override = asRecord(record?.['override']);
    const sourceRecord = override && record ? { ...record, ...override } : (override ?? record);

    if (!sourceRecord || Object.keys(sourceRecord).length === 0) {
      return null;
    }

    const effect = sanitizeText(sourceRecord['effect']) ?? (override ? 'upgrade' : null);
    const targeting = this.normalizeTargeting(sourceRecord['targeting']);

    return {
      source,
      sourceLevel,
      maxSourceLevel,
      effect: effect ?? 'effect',
      attributes: Array.isArray(sourceRecord['attributes'])
        ? sourceRecord['attributes']
            .map((attribute) => sanitizeText(attribute))
            .filter((attribute): attribute is string => Boolean(attribute))
        : [],
      level: toFiniteNumber(sourceRecord['level']),
      amount: toFiniteNumber(sourceRecord['amount']),
      chance: toFiniteNumber(sourceRecord['chance']),
      duration: toFiniteNumber(sourceRecord['duration']),
      type: sanitizeText(sourceRecord['type']),
      target: this.formatTargeting(sourceRecord['targeting']),
      targetTokens: targeting.targetTokens,
      targetCount: targeting.targetCount,
      targetPriority: targeting.targetPriority,
      targetStat: targeting.targetStat,
      targetScope: targeting.targetScope,
      isConditional: Boolean(asRecord(sourceRecord['condition'])),
    };
  }

  private scoreEffect(
    effect: NormalizedRumbleEffect,
    source: NormalizedRumbleEffect['source'],
  ): number {
    if (this.isEnemyDebuffEffect(effect)) {
      return 0;
    }

    const normalizedEffect = effect.effect.toLowerCase();
    const attributes = effect.attributes.join(' ').toLowerCase();
    const sourceWeight = source === 'special' ? 1.25 : 1;
    const base =
      normalizedEffect.includes('damage') || normalizedEffect.includes('attack')
        ? 42
        : normalizedEffect.includes('buff')
          ? 34
          : normalizedEffect.includes('debuff') || normalizedEffect.includes('hinderance')
            ? 32
            : normalizedEffect.includes('heal')
              ? 28
              : normalizedEffect.includes('guard') || attributes.includes('def')
                ? 24
                : normalizedEffect.includes('upgrade')
                  ? 8
                  : 18;
    const levelScore = (effect.level ?? 0) * 5;
    const amountScore = Math.min(40, Math.max(0, effect.amount ?? 0) * 3);
    const chanceScore = Math.min(16, Math.max(0, effect.chance ?? 0) / 8);
    const durationScore = Math.min(24, Math.max(0, effect.duration ?? 0) * 1.6);

    return (base + levelScore + amountScore + chanceScore + durationScore) * sourceWeight;
  }

  private resolveBestCooldown(rawLevels: unknown): number | null {
    if (!Array.isArray(rawLevels)) {
      return null;
    }

    const cooldowns = rawLevels
      .map((levelEntry) => toFiniteNumber(asRecord(levelEntry)?.['cooldown']))
      .filter((cooldown): cooldown is number => cooldown !== null && cooldown > 0);

    return cooldowns.length ? Math.min(...cooldowns) : null;
  }

  private resolveLevelCount(rawLevels: unknown): number | null {
    return Array.isArray(rawLevels) && rawLevels.length > 0 ? rawLevels.length : null;
  }

  private resolveMaxLevelSummary(
    rawLevels: unknown,
  ): { effects: string[]; cooldown: number | null } | null {
    if (!Array.isArray(rawLevels) || rawLevels.length === 0) {
      return null;
    }

    const maxLevelRecord = asRecord(rawLevels[rawLevels.length - 1]);

    if (!maxLevelRecord) {
      return null;
    }

    const effects = Array.isArray(maxLevelRecord['effects'])
      ? maxLevelRecord['effects']
          .map((effect) => this.formatRumbleEffectDescription(effect))
          .filter((effect): effect is string => Boolean(effect))
      : [];

    return {
      effects,
      cooldown: toFiniteNumber(maxLevelRecord['cooldown']),
    };
  }

  private formatRumbleEffectDescription(value: unknown): string | null {
    const record = asRecord(value);

    if (!record) {
      return sanitizeText(value);
    }

    const parts = [
      this.formatDisplayEffectName(record['effect']),
      this.formatStringList(record['attributes']),
      record['level'] !== undefined && record['level'] !== null
        ? `Lv ${this.formatNumber(record['level'])}`
        : null,
      record['amount'] !== undefined && record['amount'] !== null
        ? `Amount ${this.formatNumber(record['amount'])}`
        : null,
      record['chance'] !== undefined && record['chance'] !== null
        ? `${this.formatNumber(record['chance'])}% chance`
        : null,
      record['duration'] !== undefined && record['duration'] !== null
        ? `${this.formatNumber(record['duration'])} duration`
        : null,
      record['type'] !== undefined && record['type'] !== null ? sanitizeText(record['type']) : null,
      record['repeat'] !== undefined && record['repeat'] !== null
        ? `Repeat ${this.formatNumber(record['repeat'])}`
        : null,
      this.formatTargeting(record['targeting']),
    ].filter((part): part is string => Boolean(part));

    return parts.length ? parts.join(' • ') : this.summarizeStructuredRecord(record);
  }

  private formatDisplayEffectName(value: unknown): string | null {
    const effectName = sanitizeText(value);
    const normalizedEffectName = effectName?.toLowerCase();

    return normalizedEffectName === 'buff' || normalizedEffectName === 'debuff'
      ? null
      : (effectName ?? null);
  }

  private formatStringList(value: unknown): string | null {
    if (!Array.isArray(value)) {
      return null;
    }

    const values = value
      .map((entry) => sanitizeText(entry))
      .filter((entry): entry is string => Boolean(entry));

    return values.length ? values.join(', ') : null;
  }

  private summarizeStructuredRecord(record: UnknownRecord): string | null {
    const parts = Object.entries(record)
      .map(([key, value]) => {
        const formattedValue = this.summarizeStructuredValue(value);

        return formattedValue ? `${key}: ${formattedValue}` : null;
      })
      .filter((part): part is string => Boolean(part));

    return parts.length ? parts.join(', ') : null;
  }

  private summarizeStructuredValue(value: unknown): string | null {
    if (Array.isArray(value)) {
      const values = value
        .map((entry) => this.summarizeStructuredValue(entry))
        .filter((entry): entry is string => Boolean(entry));

      return values.length ? values.join(', ') : null;
    }

    if (asRecord(value)) {
      return this.summarizeStructuredRecord(asRecord(value) as UnknownRecord);
    }

    return sanitizeText(value);
  }

  private formatResistances(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => this.formatResistance(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  private formatResistance(value: unknown): string | null {
    const record = asRecord(value);

    if (!record) {
      return sanitizeText(value);
    }

    const type = sanitizeText(record['type'])?.toLowerCase() ?? null;
    const attribute = this.formatResistanceAttribute(record['attribute']);
    const chance = toFiniteNumber(record['chance']);
    const percentage = toFiniteNumber(record['percentage']);

    if (type === 'debuff' && attribute && chance !== null) {
      return `${this.formatPercent(chance)} chance to resist ${attribute}`;
    }

    if (type === 'damage' && attribute && percentage !== null) {
      return `${this.formatPercent(percentage)} damage reduction from ${attribute} enemies`;
    }

    return this.summarizeResistanceRecord(record);
  }

  private formatResistanceAttribute(value: unknown): string | null {
    const attribute = sanitizeText(value);

    return attribute?.replace(/^\[([^\]]+)\]$/, '$1') ?? null;
  }

  private formatPercent(value: number): string {
    return `${this.formatNumber(value)}%`;
  }

  private formatNumber(value: unknown): string {
    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue.toLocaleString('en-US') : String(value);
  }

  private summarizeResistanceRecord(record: UnknownRecord): string | null {
    const parts = Object.entries(record)
      .map(([key, value]) => {
        const formattedValue = sanitizeText(value);

        return formattedValue ? `${key}: ${formattedValue}` : null;
      })
      .filter((part): part is string => Boolean(part));

    return parts.length ? parts.join(', ') : null;
  }

  private resolveRoleTags(
    passiveEffects: NormalizedRumbleEffect[],
    specialEffects: NormalizedRumbleEffect[],
    stats: unknown,
  ): NormalizedRumbleRoleTag[] {
    const roles = new Set<NormalizedRumbleRoleTag>();
    const effects = [...passiveEffects, ...specialEffects];

    effects.forEach((effect) => {
      const text = `${effect.effect} ${effect.attributes.join(' ')}`.toLowerCase();

      if (text.includes('damage') || text.includes('atk') || text.includes('attack')) {
        roles.add('attacker');
      }

      if (text.includes('buff') || text.includes('boost')) {
        roles.add('booster');
      }

      if (text.includes('debuff') || text.includes('hinderance') || text.includes('silence')) {
        roles.add('disruptor');
      }

      if (text.includes('heal') || text.includes('rcv')) {
        roles.add('healer');
      }

      if (text.includes('def') || text.includes('guard')) {
        roles.add('defender');
      }

      if (text.includes('spd') || text.includes('speed')) {
        roles.add('speed');
      }
    });

    const statsRecord = asRecord(stats);

    if ((toFiniteNumber(statsRecord?.['def']) ?? 0) >= 150) {
      roles.add('defender');
    }

    if ((toFiniteNumber(statsRecord?.['spd']) ?? 0) >= 150) {
      roles.add('speed');
    }

    return [...roles].sort();
  }

  private buildUnitReasonChips(
    normalized: NormalizedRumbleData,
    breakdown: RumbleScoreBreakdown,
  ): string[] {
    return [
      this.hasUsableRumblePayload(normalized) ? 'Rumble Data' : null,
      normalized.rumbleType ? `Rumble ${normalized.rumbleType}` : null,
      normalized.cooldown ? `CT ${normalized.cooldown}` : null,
      normalized.def ? `DEF ${normalized.def}` : null,
      normalized.spd ? `SPD ${normalized.spd}` : null,
      ...normalized.roleTags.map((role) => ROLE_LABELS[role]),
      `Stats ${breakdown.statScore}`,
    ].filter((chip): chip is string => Boolean(chip));
  }

  private buildTopFactors(
    activeUnits: RumbleUnitScore[],
    benchUnits: RumbleUnitScore[],
    roleCoverage: NormalizedRumbleRoleTag[],
    opponentProfile: RumbleOpponentProfile,
  ): string[] {
    const bestUnits = [...activeUnits, ...benchUnits]
      .slice(0, 3)
      .map((unit) => unit.character.name);
    const cooldowns = [...activeUnits, ...benchUnits]
      .map((unit) => unit.normalized.cooldown)
      .filter((cooldown): cooldown is number => cooldown !== null);
    const bestCooldown = cooldowns.length ? Math.min(...cooldowns) : null;

    return [
      bestUnits.length ? `Core power: ${bestUnits.join(', ')}` : null,
      roleCoverage.length
        ? `Roles: ${roleCoverage.map((role) => ROLE_LABELS[role]).join(', ')}`
        : null,
      bestCooldown ? `Fastest CT: ${bestCooldown}` : null,
      this.hasOpponentCounterCoverage([...activeUnits, ...benchUnits], opponentProfile)
        ? `Opponent counters: ${this.countOpponentCounterUnits(
            [...activeUnits, ...benchUnits],
            opponentProfile,
          )} matched`
        : null,
    ].filter((factor): factor is string => Boolean(factor));
  }

  private collectRoleCoverage(units: RumbleUnitScore[]): NormalizedRumbleRoleTag[] {
    return [...new Set(units.flatMap((unit) => unit.normalized.roleTags))].sort();
  }

  private collectTypeCoverage(units: RumbleUnitScore[]): string[] {
    return [...new Set(units.flatMap((unit) => this.resolveCharacterTypes(unit.character)))].sort();
  }

  private collectClassCoverage(units: RumbleUnitScore[]): string[] {
    return [...new Set(units.flatMap((unit) => unit.character.classes))].sort();
  }

  private createSlot(
    role: RumbleTeamSlot['role'],
    index: number,
    unit: RumbleUnitScore,
    opponentProfile: RumbleOpponentProfile = EMPTY_OPPONENT_PROFILE,
  ): RumbleTeamSlot {
    const synergyScore = Math.round(unit.baseScore * (role === 'bench' ? 0.45 : 1));
    const opponentReasonChips = this.buildOpponentCounterReasonChips(unit, opponentProfile);

    return {
      role,
      index,
      unit,
      score: synergyScore,
      reasonChips:
        role === 'bench'
          ? ['Bench value', ...unit.reasonChips, ...opponentReasonChips]
          : [...unit.reasonChips, ...opponentReasonChips],
    };
  }

  private hasOpponentCounterCoverage(
    units: RumbleUnitScore[],
    opponentProfile: RumbleOpponentProfile,
  ): boolean {
    return this.countOpponentCounterUnits(units, opponentProfile) > 0;
  }

  private countOpponentCounterUnits(
    units: RumbleUnitScore[],
    opponentProfile: RumbleOpponentProfile,
  ): number {
    if (!opponentProfile.units.length) {
      return 0;
    }

    return units.filter((unit) => this.scoreUnitOpponentCounters(unit, opponentProfile) > 0).length;
  }

  private buildOpponentCounterReasonChips(
    unit: RumbleUnitScore,
    opponentProfile: RumbleOpponentProfile,
  ): string[] {
    if (!opponentProfile.units.length) {
      return [];
    }

    const hasMatchedDebuff = this.resolveMaxLevelEffects(unit.normalized)
      .filter((effect) => this.isEnemyDebuffEffect(effect))
      .some((effect) =>
        this.resolveOpponentCounterAttributes(effect).some((attribute) =>
          opponentProfile.attributeThreatWeights.has(attribute),
        ),
      );
    const hasMatchedResistance = [
      ...unit.normalized.baseResistances,
      ...unit.normalized.llbResistances,
    ].some((resistanceText) => {
      const debuffResistance = this.parseDebuffResistance(resistanceText);

      if (debuffResistance && opponentProfile.debuffThreatWeights.has(debuffResistance.attribute)) {
        return true;
      }

      const damageResistance = this.parseTypeDamageResistance(resistanceText);

      return Boolean(damageResistance && opponentProfile.typeWeights.has(damageResistance.type));
    });

    return [
      hasMatchedDebuff || hasMatchedResistance ? 'Opponent counter' : null,
      hasMatchedDebuff ? 'Matched debuff' : null,
      hasMatchedResistance ? 'Matched resistance' : null,
    ].filter((chip): chip is string => Boolean(chip));
  }

  private hasUsableRumblePayload(normalized: NormalizedRumbleData): boolean {
    return Boolean(
      normalized.rumbleType ||
      normalized.def !== null ||
      normalized.spd !== null ||
      normalized.cooldown !== null ||
      normalized.maxPassiveLevel !== null ||
      normalized.maxSpecialLevel !== null ||
      normalized.baseResistances.length ||
      normalized.llbResistances.length ||
      normalized.passiveEffects.length ||
      normalized.specialEffects.length ||
      normalized.basedOnId,
    );
  }

  private hasConflict(candidate: RumbleUnitScore, selected: RumbleUnitScore[]): boolean {
    const candidateKeys = new Set(candidate.conflictKeys);

    return selected.some((unit) => unit.conflictKeys.some((key) => candidateKeys.has(key)));
  }

  private resolveConflictKeys(character: CharacterDetailRecord): string[] {
    const keys = resolveCharacterPartyConflictKeys(character);

    return keys.length ? [...new Set(keys)] : [`character:${character.id}`];
  }

  private resolveCharacterTypes(character: CharacterDetailRecord): string[] {
    return character.type
      .split(/[,/]+/)
      .map((type) => type.trim().toUpperCase())
      .filter((type) => type.length > 0);
  }

  private formatTarget(value: unknown): string | null {
    const record = asRecord(value);

    if (!record) {
      return sanitizeText(value);
    }

    return (
      [sanitizeText(record['comparator']), sanitizeText(record['criteria'])]
        .filter((part): part is string => Boolean(part))
        .join(' ')
        .trim() || null
    );
  }

  private formatTargeting(value: unknown): string | null {
    const record = asRecord(value);

    if (!record) {
      return sanitizeText(value);
    }

    const targets = Array.isArray(record['targets'])
      ? record['targets']
          .map((target) => sanitizeText(target))
          .filter((target): target is string => Boolean(target))
      : [];
    const count = sanitizeText(record['count']);
    const normalizedTargets = targets.map((target) =>
      count === '1' ? this.singularizeTarget(target) : target,
    );

    return (
      [
        count,
        sanitizeText(record['priority']),
        sanitizeText(record['stat']),
        normalizedTargets.length ? normalizedTargets.join(', ') : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(' ')
        .trim() || null
    );
  }

  private normalizeTargeting(
    value: unknown,
  ): Pick<
    NormalizedRumbleEffect,
    'targetTokens' | 'targetCount' | 'targetPriority' | 'targetStat' | 'targetScope'
  > {
    const record = asRecord(value);

    if (!record) {
      return {
        targetTokens: [],
        targetCount: null,
        targetPriority: null,
        targetStat: null,
        targetScope: 'unknown',
      };
    }

    const targetTokens = Array.isArray(record['targets'])
      ? record['targets']
          .map((target) => sanitizeText(target))
          .filter((target): target is string => Boolean(target))
      : [];
    const normalizedTokens = targetTokens.map((target) => this.normalizeMatchToken(target));
    const hasCrewTarget = normalizedTokens.some(
      (target) => target === 'crew' || target === 'allies',
    );
    const hasSelfTarget = normalizedTokens.some((target) => target === 'self');
    const hasEnemyTarget = normalizedTokens.some(
      (target) => target === 'enemies' || target === 'enemy',
    );
    const targetScope: NormalizedRumbleEffect['targetScope'] = hasEnemyTarget
      ? 'enemies'
      : hasSelfTarget
        ? 'self'
        : hasCrewTarget
          ? 'crew'
          : targetTokens.length
            ? 'subset'
            : 'unknown';

    return {
      targetTokens,
      targetCount: toFiniteNumber(record['count']),
      targetPriority: sanitizeText(record['priority']),
      targetStat: sanitizeText(record['stat']),
      targetScope,
    };
  }

  private singularizeTarget(value: string): string {
    const normalized = value.toLowerCase();

    if (normalized === 'enemies') {
      return 'enemy';
    }

    if (normalized === 'allies') {
      return 'ally';
    }

    return value;
  }

  private normalizeMatchToken(value: string): string {
    return value
      .replace(/^\[([^\]]+)\]$/, '$1')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
}

function applyCandidateScope(
  candidates: CharacterDetailRecord[],
  input: RumbleBuildInput,
): CharacterDetailRecord[] {
  const scopedIds =
    input.candidateCharacterIds !== undefined ? new Set(input.candidateCharacterIds) : null;
  const favoriteIds = input.favoritesOnly ? new Set(input.favoriteCharacterIds) : null;
  const onlyTypeSet = input.onlySelectedTypes ? new Set(input.types) : null;
  const onlyClassSet = input.onlySelectedClasses ? new Set(input.selectedClasses) : null;

  if (
    (input.onlySelectedTypes && input.types.length === 0) ||
    (input.onlySelectedClasses && input.selectedClasses.length === 0)
  ) {
    return [];
  }

  return candidates.filter((candidate) => {
    if (scopedIds && !scopedIds.has(candidate.id)) {
      return false;
    }

    if (favoriteIds && !favoriteIds.has(candidate.id)) {
      return false;
    }

    if (onlyTypeSet) {
      const characterTypes = resolveCharacterTypes(candidate);

      if (
        !characterTypes.length ||
        characterTypes.some((type) => !onlyTypeSet.has(type as AutoTeamBuilderType))
      ) {
        return false;
      }
    }

    if (
      onlyClassSet &&
      !candidate.classes.some((characterClass) => onlyClassSet.has(characterClass))
    ) {
      return false;
    }

    return true;
  });
}

function createRumbleBuildAttempts(input: RumbleBuildInput): RumbleBuildAttempt[] {
  const typeSubsets = createOrderedSubsets(input.types);
  const classSubsets = createOrderedSubsets(input.selectedClasses);
  const attempts: RumbleBuildAttempt[] = [];

  for (const resolvedTypes of typeSubsets) {
    for (const resolvedClasses of classSubsets) {
      attempts.push({
        resolvedTypes,
        resolvedClasses,
        droppedTypes: input.types.filter((type) => !resolvedTypes.includes(type)),
        droppedClasses: input.selectedClasses.filter(
          (characterClass) => !resolvedClasses.includes(characterClass),
        ),
        buffFocus: [...input.buffFocus],
      });
    }
  }

  return attempts.sort(
    (left, right) =>
      right.resolvedTypes.length +
        right.resolvedClasses.length -
        (left.resolvedTypes.length + left.resolvedClasses.length) ||
      right.resolvedTypes.length - left.resolvedTypes.length ||
      right.resolvedClasses.length - left.resolvedClasses.length,
  );
}

function createExactAttempt(input: RumbleBuildInput): RumbleBuildAttempt {
  return {
    resolvedTypes: [...input.types],
    resolvedClasses: [...input.selectedClasses],
    droppedTypes: [],
    droppedClasses: [],
    buffFocus: [...input.buffFocus],
  };
}

function createOrderedSubsets<T>(values: T[]): T[][] {
  if (!values.length) {
    return [[]];
  }

  const subsets: T[][] = [];
  const total = 2 ** values.length;

  for (let mask = total - 1; mask >= 0; mask -= 1) {
    const subset = values.filter((_value, index) => (mask & (1 << index)) !== 0);
    subsets.push(subset);
  }

  return subsets;
}

function satisfiesAttemptCoverage(result: RumbleTeamResult, attempt: RumbleBuildAttempt): boolean {
  return (
    attempt.resolvedTypes.every((type) => result.typeCoverage.includes(type)) &&
    attempt.resolvedClasses.every((characterClass) => result.classCoverage.includes(characterClass))
  );
}

function resolveRequiredSlotCount(input: RumbleBuildInput): number {
  return input.requireFullTeam ? RUMBLE_TOTAL_SLOT_COUNT : RUMBLE_ACTIVE_SLOT_COUNT;
}

function normalizeResultLimit(limit: number): number {
  return Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 1;
}

function collectUniqueRumbleResults(
  results: RumbleTeamResult[],
  limit: number,
  comparator: (left: RumbleTeamResult, right: RumbleTeamResult) => number,
): RumbleTeamResult[] {
  const uniqueResults: RumbleTeamResult[] = [];
  const seenKeys = new Set<string>();

  [...results].sort(comparator).forEach((result) => {
    const key = buildRumbleResultKey(result);

    if (seenKeys.has(key) || uniqueResults.length >= limit) {
      return;
    }

    seenKeys.add(key);
    uniqueResults.push(result);
  });

  return uniqueResults;
}

function compareRumbleResults(left: RumbleTeamResult, right: RumbleTeamResult): number {
  return (
    right.totalScore - left.totalScore ||
    right.selectedCount - left.selectedCount ||
    buildRumbleResultKey(left).localeCompare(buildRumbleResultKey(right))
  );
}

function compareClosestCostRumbleResults(
  left: RumbleTeamResult,
  right: RumbleTeamResult,
): number {
  const leftCostGap = Math.abs(RUMBLE_TEAM_COST_LIMIT - resolveRumbleResultCost(left));
  const rightCostGap = Math.abs(RUMBLE_TEAM_COST_LIMIT - resolveRumbleResultCost(right));

  return (
    leftCostGap - rightCostGap ||
    right.totalScore - left.totalScore ||
    right.selectedCount - left.selectedCount ||
    buildRumbleResultKey(left).localeCompare(buildRumbleResultKey(right))
  );
}

function resolveRumbleResultComparator(
  resultMode: RumbleBuildResultMode = 'score',
): (left: RumbleTeamResult, right: RumbleTeamResult) => number {
  return resultMode === 'closestCost' ? compareClosestCostRumbleResults : compareRumbleResults;
}

function compareRumblePartials(left: RumbleTeamResult, right: RumbleTeamResult): number {
  const leftCoverage = left.resolvedTypes.length + left.resolvedClasses.length;
  const rightCoverage = right.resolvedTypes.length + right.resolvedClasses.length;

  return (
    rightCoverage - leftCoverage ||
    right.selectedCount - left.selectedCount ||
    right.totalScore - left.totalScore ||
    buildRumbleResultKey(left).localeCompare(buildRumbleResultKey(right))
  );
}

function buildRumbleResultKey(result: RumbleTeamResult): string {
  return [...result.activeSlots, ...result.benchSlots]
    .map((slot) => slot.unit.character.id)
    .sort((left, right) => left - right)
    .join(':');
}

function resolveRumbleResultCost(result: RumbleTeamResult): number {
  return [...result.activeSlots, ...result.benchSlots].reduce(
    (total, slot) => total + resolveRumbleUnitCost(slot.unit),
    0,
  );
}

function compareRumbleScoredUnitGroups(
  left: RumbleScoredUnitGroup,
  right: RumbleScoredUnitGroup,
  resultMode: RumbleBuildResultMode,
  targetCount = RUMBLE_ACTIVE_SLOT_COUNT,
): number {
  if (resultMode === 'closestCost') {
    const leftTargetCost = resolveRumbleUnitGroupTargetCost(left.units, targetCount);
    const rightTargetCost = resolveRumbleUnitGroupTargetCost(right.units, targetCount);
    const leftCostGap = Math.abs(leftTargetCost - resolveRumbleUnitGroupCost(left.units));
    const rightCostGap = Math.abs(rightTargetCost - resolveRumbleUnitGroupCost(right.units));

    return (
      leftCostGap - rightCostGap || right.score - left.score || left.key.localeCompare(right.key)
    );
  }

  return right.score - left.score || left.key.localeCompare(right.key);
}

function resolveRumbleUnitGroupCost(units: RumbleUnitScore[]): number {
  return units.reduce((total, unit) => total + resolveRumbleUnitCost(unit), 0);
}

function resolveRumbleUnitGroupTargetCost(units: RumbleUnitScore[], targetCount: number): number {
  return RUMBLE_TEAM_COST_LIMIT * (Math.min(units.length, targetCount) / Math.max(1, targetCount));
}

function resolveRumbleUnitCost(unit: RumbleUnitScore): number {
  const cost = unit.normalized.cost;

  return typeof cost === 'number' && Number.isFinite(cost) && cost > 0
    ? cost
    : RUMBLE_TEAM_COST_LIMIT + 1;
}

function dedupeScoredUnitGroups(unitGroups: RumbleScoredUnitGroup[]): RumbleScoredUnitGroup[] {
  const seenKeys = new Set<string>();
  const uniqueGroups: RumbleScoredUnitGroup[] = [];

  unitGroups.forEach((unitGroup) => {
    if (seenKeys.has(unitGroup.key)) {
      return;
    }

    seenKeys.add(unitGroup.key);
    uniqueGroups.push(unitGroup);
  });

  return uniqueGroups;
}

function buildUnitGroupKey(unitGroup: RumbleUnitScore[]): string {
  return unitGroup.map((unit) => unit.character.id).join(':');
}

function estimateRemainingMs(
  completedMs: number,
  completedAttempts: number,
  totalAttempts: number,
): number | null {
  if (completedAttempts <= 0) {
    return null;
  }

  return Math.max(
    0,
    Math.round((completedMs / completedAttempts) * (totalAttempts - completedAttempts)),
  );
}

function emitProgress(
  options: RumbleBuildSearchOptions,
  snapshot: RumbleBuildProgressSnapshot,
): void {
  options.onProgress?.(snapshot);
}

function compareUnitScores(left: RumbleUnitScore, right: RumbleUnitScore): number {
  return (
    right.baseScore - left.baseScore ||
    right.character.id - left.character.id ||
    left.character.name.localeCompare(right.character.name)
  );
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function resolveCharacterTypes(character: CharacterDetailRecord): string[] {
  return character.type
    .split(/[,/]+/)
    .map((type) => type.trim().toUpperCase())
    .filter((type) => type.length > 0);
}

function toFiniteNumber(value: unknown): number | null {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : null;
}

function toPositiveInteger(value: unknown): number | null {
  const numericValue = Number(value);

  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
}

function normalizePositiveIntegerCollection(values: number[] | undefined): number[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}

function normalizeRumbleOpponentSlots(
  values: RumbleOpponentSlotContext[] | undefined,
): RumbleOpponentSlotContext[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalizedSlots: RumbleOpponentSlotContext[] = [];
  const seenKeys = new Set<string>();

  values.forEach((value) => {
    if (!value || typeof value !== 'object') {
      return;
    }

    const characterId = Number(value.characterId);
    const index = Number(value.index);
    const role = value.role;
    const maxIndex = role === 'active' ? RUMBLE_ACTIVE_SLOT_COUNT : RUMBLE_BENCH_SLOT_COUNT;

    if (
      (role !== 'active' && role !== 'bench') ||
      !Number.isInteger(characterId) ||
      characterId <= 0 ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= maxIndex
    ) {
      return;
    }

    const key = `${role}:${index}`;

    if (seenKeys.has(key)) {
      return;
    }

    seenKeys.add(key);
    normalizedSlots.push({ characterId, role, index });
  });

  return normalizedSlots;
}

function normalizeRumbleBuffFocus(
  values: RumbleBuffFocusPreference[] | undefined,
): RumbleBuffFocusPreference[] {
  const statSet = new Set<RumbleBuffFocusStat>(RUMBLE_BUFF_FOCUS_STATS);
  const rankSet = new Set<RumbleBuffFocusRank>(RUMBLE_BUFF_FOCUS_RANKS);
  const byStat = new Map<RumbleBuffFocusStat, RumbleBuffFocusRank>();

  if (Array.isArray(values)) {
    values.forEach((value) => {
      if (!value || typeof value !== 'object') {
        return;
      }

      const stat = value.stat;
      const rank = value.rank;

      if (!statSet.has(stat) || !rankSet.has(rank) || byStat.has(stat)) {
        return;
      }

      byStat.set(stat, rank);
    });
  }

  DEFAULT_RUMBLE_BUFF_FOCUS.forEach((preference) => {
    if (!byStat.has(preference.stat)) {
      byStat.set(preference.stat, preference.rank);
    }
  });

  return RUMBLE_BUFF_FOCUS_STATS.map((stat) => ({
    stat,
    rank: byStat.get(stat) ?? 'ignored',
  }));
}

function buildRumbleBuffFocusWeightMap(
  buffFocus: RumbleBuffFocusPreference[],
): Record<RumbleBuffFocusStat, number> {
  const normalizedFocus = normalizeRumbleBuffFocus(buffFocus);

  return normalizedFocus.reduce(
    (weights, preference) => ({
      ...weights,
      [preference.stat]: RUMBLE_BUFF_FOCUS_RANK_WEIGHTS[preference.rank],
    }),
    {} as Record<RumbleBuffFocusStat, number>,
  );
}

function sanitizeText(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, ' ').trim();

    return normalized.length ? normalized : null;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return null;
}
