import {
  RUMBLE_ACTIVE_SLOT_COUNT,
  RUMBLE_BENCH_SLOT_COUNT,
  RUMBLE_TOTAL_SLOT_COUNT,
  type NormalizedRumbleData,
  type NormalizedRumbleEffect,
  type NormalizedRumbleRoleTag,
  type RumbleBuildInput,
  type RumbleBuildProgressSnapshot,
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

type UnknownRecord = Record<string, unknown>;

export interface RumbleBuildAttempt {
  resolvedTypes: AutoTeamBuilderType[];
  resolvedClasses: string[];
  droppedTypes: AutoTeamBuilderType[];
  droppedClasses: string[];
}

export interface RumbleBuildSearchOptions {
  onProgress?: (snapshot: RumbleBuildProgressSnapshot) => void;
  now?: () => number;
}

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
  };
}

export function runRumbleTeamBuildSearch(
  candidates: CharacterDetailRecord[],
  requestedInput: Partial<RumbleBuildInput> = {},
  options: RumbleBuildSearchOptions = {},
): RumbleTeamResult {
  const input = normalizeRumbleBuildInput(requestedInput);
  const now = options.now ?? (() => Date.now());
  const searchStartedAt = now();
  const engine = new RumbleTeamBuilderEngine();
  const scopedCandidates = applyCandidateScope(candidates, input);
  const scoredCandidates = engine.scoreCandidates(scopedCandidates);
  const attempts = createRumbleBuildAttempts(input);

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
  });

  if (!scoredCandidates.length) {
    return engine.createEmptyResult(0, input, attempts[0] ?? createExactAttempt(input));
  }

  let bestPartial: RumbleTeamResult | null = null;
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
    });

    const result = engine.buildTeamFromScoredCandidates(scoredCandidates, input, attempt);
    const attemptDuration = Math.max(0, now() - attemptStartedAt);
    totalCompletedMs += attemptDuration;

    if (isBetterRumblePartial(result, bestPartial)) {
      bestPartial = result;
    }

    if (
      result.selectedCount >= RUMBLE_TOTAL_SLOT_COUNT &&
      satisfiesAttemptCoverage(result, attempt)
    ) {
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
      });
      return result;
    }
  }

  const fallbackResult =
    bestPartial ??
    engine.createEmptyResult(scoredCandidates.length, input, {
      ...attempts[0],
      resolvedTypes: [...input.types],
      droppedTypes: [],
    });

  emitProgress(options, {
    stage: 'completed',
    candidateCount: scoredCandidates.length,
    completedAttempts: attempts.length,
    totalAttempts: attempts.length,
    attemptCountFinal: true,
    currentDroppedTypes: fallbackResult.droppedTypes,
    currentDroppedClasses: fallbackResult.droppedClasses,
    elapsedMs: Math.max(0, now() - searchStartedAt),
    estimatedRemainingMs: 0,
    messageKey: 'progress.completed',
  });

  return fallbackResult;
}

export class RumbleTeamBuilderEngine {
  public buildTeamFromCandidates(
    candidates: CharacterDetailRecord[],
    requestedInput: Partial<RumbleBuildInput> = {},
  ): RumbleTeamResult {
    return runRumbleTeamBuildSearch(candidates, requestedInput);
  }

  public buildTeamFromScoredCandidates(
    scoredCandidates: RumbleUnitScore[],
    input: RumbleBuildInput,
    attempt: RumbleBuildAttempt,
  ): RumbleTeamResult {
    if (!scoredCandidates.length) {
      return this.createEmptyResult(0, input, attempt);
    }

    const selectedUnits = this.improveTeam(
      this.pickGreedyTeam(scoredCandidates, attempt),
      scoredCandidates,
      attempt,
    );
    const activeUnits = selectedUnits.slice(0, RUMBLE_ACTIVE_SLOT_COUNT);
    const benchUnits = selectedUnits.slice(RUMBLE_ACTIVE_SLOT_COUNT, RUMBLE_TOTAL_SLOT_COUNT);
    const activeSlots = activeUnits.map((unit, index) => this.createSlot('active', index, unit));
    const benchSlots = benchUnits.map((unit, index) => this.createSlot('bench', index, unit));
    const allUnits = [...activeUnits, ...benchUnits];
    const roleCoverage = this.collectRoleCoverage(allUnits);
    const typeCoverage = this.collectTypeCoverage(allUnits);
    const classCoverage = this.collectClassCoverage(allUnits);
    const totalScore =
      this.scoreTeam(activeUnits, attempt) +
      benchUnits.reduce((total, unit) => total + unit.baseScore * 0.45, 0);

    return {
      activeSlots,
      benchSlots,
      candidateCount: scoredCandidates.length,
      selectedCount: activeSlots.length + benchSlots.length,
      totalScore: Math.round(totalScore),
      roleCoverage,
      typeCoverage,
      classCoverage,
      topFactors: this.buildTopFactors(activeUnits, benchUnits, roleCoverage),
      input,
      requestedTypes: [...input.types],
      requestedClasses: [...input.selectedClasses],
      resolvedTypes: [...attempt.resolvedTypes],
      resolvedClasses: [...attempt.resolvedClasses],
      droppedTypes: [...attempt.droppedTypes],
      droppedClasses: [...attempt.droppedClasses],
    };
  }

  public scoreCandidates(candidates: CharacterDetailRecord[]): RumbleUnitScore[] {
    const byCharacterId = new Map(candidates.map((candidate) => [candidate.id, candidate]));

    return candidates
      .map((candidate) => {
        const normalized = this.normalizeRumbleData(candidate, byCharacterId);

        return normalized ? this.scoreCandidate(candidate, normalized) : null;
      })
      .filter((candidate): candidate is RumbleUnitScore => Boolean(candidate))
      .sort(compareUnitScores);
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
  ): RumbleUnitScore[] {
    const selected: RumbleUnitScore[] = [];

    while (selected.length < RUMBLE_TOTAL_SLOT_COUNT) {
      const next = scoredCandidates
        .filter(
          (candidate) => !selected.some((unit) => unit.character.id === candidate.character.id),
        )
        .filter((candidate) => !this.hasConflict(candidate, selected))
        .map((candidate) => ({
          candidate,
          score: this.scoreTeam([...selected, candidate], attempt),
        }))
        .sort(
          (left, right) =>
            right.score - left.score || compareUnitScores(left.candidate, right.candidate),
        )[0];

      if (!next) {
        break;
      }

      selected.push(next.candidate);
    }

    return selected;
  }

  private improveTeam(
    units: RumbleUnitScore[],
    scoredCandidates: RumbleUnitScore[],
    attempt: RumbleBuildAttempt,
  ): RumbleUnitScore[] {
    let current = [...units];

    for (let pass = 0; pass < 4; pass += 1) {
      const currentScore = this.scoreTeam(current, attempt);
      let bestTeam = current;
      let bestScore = currentScore;

      current.forEach((_existingUnit, existingIndex) => {
        scoredCandidates.forEach((candidate) => {
          if (current.some((unit) => unit.character.id === candidate.character.id)) {
            return;
          }

          const nextTeam = current.map((unit, index) =>
            index === existingIndex ? candidate : unit,
          );

          if (
            this.hasConflict(
              candidate,
              nextTeam.filter((unit) => unit !== candidate),
            )
          ) {
            return;
          }

          const nextScore = this.scoreTeam(nextTeam, attempt);

          if (nextScore > bestScore + 0.1) {
            bestTeam = nextTeam;
            bestScore = nextScore;
          }
        });
      });

      if (bestTeam === current || bestScore <= currentScore + 0.1) {
        break;
      }

      current = bestTeam;
    }

    return current;
  }

  private scoreTeam(units: RumbleUnitScore[], attempt: RumbleBuildAttempt): number {
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
      units.reduce((total, unit) => total + unit.baseScore, 0) +
      sameTypeSynergy +
      sameClassSynergy +
      roleCoverageSynergy +
      rumbleTypeCoverageSynergy +
      coverageBonus
    );
  }

  private normalizeLevelEffects(
    rawLevels: unknown,
    source: NormalizedRumbleEffect['source'],
  ): NormalizedRumbleEffect[] {
    if (!Array.isArray(rawLevels)) {
      return [];
    }

    return rawLevels.flatMap((levelEntry) => {
      const levelRecord = asRecord(levelEntry);
      const effects = Array.isArray(levelRecord?.['effects']) ? levelRecord['effects'] : [];

      return effects
        .map((effect) => this.normalizeEffect(effect, source))
        .filter((effect): effect is NormalizedRumbleEffect => Boolean(effect));
    });
  }

  private normalizeEffect(
    value: unknown,
    source: NormalizedRumbleEffect['source'],
  ): NormalizedRumbleEffect | null {
    const record = asRecord(value);
    const override = asRecord(record?.['override']);
    const sourceRecord = override ?? record;

    if (!sourceRecord || Object.keys(sourceRecord).length === 0) {
      return null;
    }

    const effect = sanitizeText(sourceRecord['effect']) ?? (override ? 'upgrade' : null);

    return {
      source,
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
      target: this.formatTargeting(sourceRecord['targeting']),
    };
  }

  private scoreEffect(
    effect: NormalizedRumbleEffect,
    source: NormalizedRumbleEffect['source'],
  ): number {
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
      record['type'] !== undefined && record['type'] !== null
        ? sanitizeText(record['type'])
        : null,
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
  ): RumbleTeamSlot {
    const synergyScore = Math.round(unit.baseScore * (role === 'bench' ? 0.45 : 1));

    return {
      role,
      index,
      unit,
      score: synergyScore,
      reasonChips: role === 'bench' ? ['Bench value', ...unit.reasonChips] : unit.reasonChips,
    };
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
    const keys = character.detail.partyConflictKeys
      .map((key) => key.trim().toLowerCase())
      .filter((key) => key.length > 0);

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
}

function applyCandidateScope(
  candidates: CharacterDetailRecord[],
  input: RumbleBuildInput,
): CharacterDetailRecord[] {
  const scopedIds = input.candidateCharacterIds?.length
    ? new Set(input.candidateCharacterIds)
    : null;
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

function isBetterRumblePartial(
  candidate: RumbleTeamResult,
  current: RumbleTeamResult | null,
): boolean {
  if (!current) {
    return true;
  }

  const candidateCoverage = candidate.resolvedTypes.length + candidate.resolvedClasses.length;
  const currentCoverage = current.resolvedTypes.length + current.resolvedClasses.length;

  return (
    candidateCoverage > currentCoverage ||
    (candidateCoverage === currentCoverage && candidate.selectedCount > current.selectedCount) ||
    (candidateCoverage === currentCoverage &&
      candidate.selectedCount === current.selectedCount &&
      candidate.totalScore > current.totalScore)
  );
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
