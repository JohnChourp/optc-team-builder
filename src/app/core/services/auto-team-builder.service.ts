import { Injectable } from "@angular/core";

import {
  AUTO_TEAM_CANDIDATE_LIMIT,
  AUTO_TEAM_BUILDER_DEFAULT_TYPE,
  AUTO_BUILD_MANUAL_SLOT_ROLES,
  AUTO_BUILD_MANUAL_SUB_SLOT_ROLES,
  type AutoBuildConstraints,
  type AutoBuildInput,
  type AutoBuildManualSlotRole,
  type AutoBuildManualSlotSelection,
  type AutoBuildProgressSnapshot,
  type AutoBuildResult,
  type AutoTeamBuilderType,
  createEmptyAutoBuildManualSlots,
} from "../models/auto-team-builder.models";
import {
  type AutoBuildAbilityRequirement,
} from "../models/auto-team-builder-ability.models";
import { type CharacterDetailRecord } from "../models/optc.models";
import {
  AutoTeamBuildCancelledError,
  isAutoTeamBuildCancelledError,
  normalizeSelectedTypes,
  runAutoTeamBuildSearch,
} from "./auto-team-builder.engine";
import { resolveAutoBuildShipSelection } from "./auto-team-builder-ship.utils";
import { normalizeEnemyMechanicRequirements } from "./enemy-mechanic-draft.utils";
import { OptcRepositoryService } from "./optc-repository.service";
import {
  type AutoTeamBuilderWorkerRequest,
  type AutoTeamBuilderWorkerResponse,
} from "./auto-team-builder.worker.models";

export interface AutoTeamBuildExecutionOptions {
  onProgress?: (snapshot: AutoBuildProgressSnapshot) => void;
  signal?: AbortSignal;
}

const LEGACY_ABILITY_KEY_ALIASES: Record<string, string> = {
  remove_defense_up: "remove_enemy_increased_defense",
};

@Injectable({ providedIn: "root" })
export class AutoTeamBuilderService {
  public constructor(private readonly repository: OptcRepositoryService) {}

  public async buildTeam(
    selectedClasses: string[] = [],
    selectedTypes: AutoTeamBuilderType[] = [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
    constraints: AutoBuildConstraints = {},
    executionOptions: AutoTeamBuildExecutionOptions = {},
  ): Promise<AutoBuildResult | null> {
    const favoritesOnly = constraints.favoritesOnly ?? false;
    const favoriteShipsOnly = constraints.favoriteShipsOnly ?? false;
    const normalizedTypes = normalizeSelectedTypes(selectedTypes);
    const normalizedClasses: string[] = [];

    for (const currentClass of selectedClasses) {
      const nextClass = currentClass.trim();

      if (
        nextClass.length === 0 ||
        normalizedClasses.some((entry) => entry.toLowerCase() === nextClass.toLowerCase())
      ) {
        continue;
      }

      normalizedClasses.push(nextClass);
    }
    const favoriteCharacterIds = new Set(
      (constraints.favoriteCharacterIds ?? []).filter(
        (characterId) => Number.isInteger(characterId) && characterId > 0,
      ),
    );
    const favoriteShipIds = this.normalizeCharacterIds(constraints.favoriteShipIds);
    const requiredAbilities = this.normalizeRequiredAbilities(constraints.requiredAbilities ?? []);
    const enemyMechanics = normalizeEnemyMechanicRequirements(constraints.enemyMechanics ?? []);
    const normalizedManualSlots = this.normalizeManualSlots(constraints.manualSlots);
    const hasManualSlots = normalizedManualSlots.some((slot) => slot.characterIds.length > 0);
    const legacyManualSelection = this.normalizeLegacyManualSelection(
      constraints.lockedCharacterIds,
      constraints.captainCharacterId,
      constraints.friendCaptainCharacterId,
    );
    if (!hasManualSlots && legacyManualSelection.hasInvalidLeaderSelection) {
      return null;
    }
    const manualSlots = hasManualSlots
      ? normalizedManualSlots
      : this.createManualSlotsFromLegacySelection(legacyManualSelection);
    const derivedManualSelection = this.deriveLegacyManualSelectionFromManualSlots(manualSlots);
    const lockedCharacterIds = derivedManualSelection.lockedCharacterIds;
    const excludedCharacterIds = this.normalizeCharacterIds(constraints.excludedCharacterIds);
    const captainCharacterId = derivedManualSelection.captainCharacterId;
    const friendCaptainCharacterId = derivedManualSelection.friendCaptainCharacterId;
    const requireSameCaptainAndFriendCaptain =
      constraints.requireSameCaptainAndFriendCaptain ?? false;
    const manualShipId = this.normalizeCharacterId(constraints.manualShipId);
    const excludedShipIds = this.normalizeCharacterIds(constraints.excludedShipIds);

    if (
      requireSameCaptainAndFriendCaptain &&
      this.hasConflictingManualLeaderSelections(manualSlots)
    ) {
      return null;
    }

    const input: AutoBuildInput = {
      types: normalizedTypes.length > 0 ? normalizedTypes : [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
      selectedClasses: normalizedClasses,
      requireAllSelectedTypesInTeam: constraints.requireAllSelectedTypesInTeam ?? false,
      requireAllSelectedClassesPerCharacter:
        constraints.requireAllSelectedClassesPerCharacter ?? false,
      requireAllSpecialsSupportTeam: constraints.requireAllSpecialsSupportTeam ?? false,
      requireUniqueBaseCharacterNames: constraints.requireUniqueBaseCharacterNames ?? false,
      requireSameCaptainAndFriendCaptain,
      requiredAbilities,
      enemyMechanics,
      favoritesOnly,
      favoriteShipsOnly,
      favoriteShipIds,
      manualSlots,
      lockedCharacterIds,
      excludedCharacterIds,
      captainCharacterId,
      friendCaptainCharacterId,
      manualShipId,
      excludedShipIds,
      candidateLimit: AUTO_TEAM_CANDIDATE_LIMIT,
    };
    const requestedInput: AutoBuildInput = {
      ...input,
      types: [...input.types],
      selectedClasses: [...input.selectedClasses],
      requiredAbilities: input.requiredAbilities.map((requirement) => ({
        ...requirement,
        slotTokens: [...requirement.slotTokens],
      })),
      enemyMechanics: input.enemyMechanics.map((mechanic) => ({
        ...mechanic,
        triggerTags: [...mechanic.triggerTags],
        responseTags: [...mechanic.responseTags],
        conditionTags: [...mechanic.conditionTags],
      })),
      favoriteShipIds: [...input.favoriteShipIds],
      manualSlots: input.manualSlots.map((slot) => ({
        role: slot.role,
        characterIds: [...slot.characterIds],
      })),
      lockedCharacterIds: [...input.lockedCharacterIds],
      excludedCharacterIds: [...input.excludedCharacterIds],
      excludedShipIds: [...input.excludedShipIds],
    };

    if (favoritesOnly && favoriteCharacterIds.size === 0) {
      return null;
    }

    const requestedLeaderIds = [captainCharacterId, friendCaptainCharacterId].filter(
      (characterId): characterId is number =>
        characterId !== null && Number.isInteger(characterId) && characterId > 0,
    );

    if (requestedLeaderIds.some((characterId) => !lockedCharacterIds.includes(characterId))) {
      return null;
    }

    this.throwIfCancelled(executionOptions.signal);
    this.emitProgress(executionOptions, {
      stage: "loadingCandidates",
      candidateCount: 0,
      completedAttempts: 0,
      totalAttempts: 0,
      elapsedMs: 0,
      estimatedRemainingMs: null,
      averageFallbackAttemptMs: null,
      completedFallbackAttempts: 0,
      currentDroppedTypes: [],
      currentDroppedClasses: [],
      messageKey: "progress.loadingCandidates",
    });

    const records = await this.repository.getAutoBuilderCandidates(
      requestedInput.types,
      requestedInput.candidateLimit,
      {
        allowedCharacterIds: favoritesOnly ? [...favoriteCharacterIds] : undefined,
        lockedCharacterIds,
        excludedCharacterIds,
      },
    );

    this.throwIfCancelled(executionOptions.signal);

    const shipsPromise =
      typeof this.repository.getShips === "function"
        ? this.repository.getShips()
        : Promise.resolve([]);
    const [result, ships] = await Promise.all([
      this.executeSearch(records, requestedInput, executionOptions),
      shipsPromise,
    ]);

    if (!result) {
      return null;
    }

    return {
      ...result,
      shipSelection: resolveAutoBuildShipSelection(result, ships),
    };
  }

  private async executeSearch(
    records: CharacterDetailRecord[],
    requestedInput: AutoBuildInput,
    executionOptions: AutoTeamBuildExecutionOptions,
  ): Promise<AutoBuildResult | null> {
    const worker = this.createWorker();

    if (!worker) {
      return runAutoTeamBuildSearch(records, requestedInput, {
        onProgress: executionOptions.onProgress,
        isCancelled: () => executionOptions.signal?.aborted ?? false,
      });
    }

    try {
      return await this.runSearchInWorker(worker, records, requestedInput, executionOptions);
    } catch (error) {
      worker.terminate();

      if (isAutoTeamBuildCancelledError(error)) {
        throw error;
      }

      return runAutoTeamBuildSearch(records, requestedInput, {
        onProgress: executionOptions.onProgress,
        isCancelled: () => executionOptions.signal?.aborted ?? false,
      });
    }
  }

  private runSearchInWorker(
    worker: Worker,
    records: CharacterDetailRecord[],
    requestedInput: AutoBuildInput,
    executionOptions: AutoTeamBuildExecutionOptions,
  ): Promise<AutoBuildResult | null> {
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return new Promise<AutoBuildResult | null>((resolve, reject) => {
      let settled = false;
      const cleanup = (): void => {
        executionOptions.signal?.removeEventListener("abort", handleAbort);
        worker.removeEventListener("message", handleMessage);
        worker.removeEventListener("error", handleError);
      };
      const resolveOnce = (result: AutoBuildResult | null): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        worker.terminate();
        resolve(result);
      };
      const rejectOnce = (error: unknown): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        worker.terminate();
        reject(error);
      };
      const handleAbort = (): void => {
        rejectOnce(new AutoTeamBuildCancelledError());
      };
      const handleError = (event: ErrorEvent): void => {
        rejectOnce(new Error(event.message || "Auto team builder worker failed."));
      };
      const handleMessage = ({ data }: MessageEvent<AutoTeamBuilderWorkerResponse>): void => {
        if (!data || data.runId !== runId) {
          return;
        }

        if (data.type === "progress") {
          executionOptions.onProgress?.(data.snapshot);
          return;
        }

        if (data.type === "result") {
          resolveOnce(data.result);
          return;
        }

        rejectOnce(new Error(data.errorMessage));
      };

      if (executionOptions.signal?.aborted) {
        handleAbort();
        return;
      }

      executionOptions.signal?.addEventListener("abort", handleAbort, { once: true });
      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", handleError);

      const request: AutoTeamBuilderWorkerRequest = {
        type: "run",
        runId,
        records,
        requestedInput,
      };

      worker.postMessage(request);
    });
  }

  private createWorker(): Worker | null {
    if (typeof Worker === "undefined") {
      return null;
    }

    try {
      return new Worker(new URL("auto-team-builder.worker", import.meta.url), {
        type: "module",
      });
    } catch {
      return null;
    }
  }

  private emitProgress(
    executionOptions: AutoTeamBuildExecutionOptions,
    snapshot: AutoBuildProgressSnapshot,
  ): void {
    executionOptions.onProgress?.(snapshot);
  }

  private throwIfCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new AutoTeamBuildCancelledError();
    }
  }

  private normalizeCharacterId(characterId: number | null | undefined): number | null {
    return Number.isInteger(characterId) && Number(characterId) > 0 ? Number(characterId) : null;
  }

  private normalizeCharacterIds(characterIds: number[] | undefined): number[] {
    return [
      ...new Set(
        (characterIds ?? [])
          .map((characterId) => this.normalizeCharacterId(characterId))
          .filter((characterId): characterId is number => characterId !== null),
      ),
    ];
  }

  private normalizeManualSlots(
    manualSlots: AutoBuildManualSlotSelection[] | undefined,
  ): AutoBuildManualSlotSelection[] {
    const roleMap = new Map<AutoBuildManualSlotRole, number[]>();

    for (const slot of (manualSlots ?? [])) {
      if (!slot || typeof slot !== "object" || !AUTO_BUILD_MANUAL_SLOT_ROLES.includes(slot.role)) {
        continue;
      }

      const normalizedCharacterIds = [
        ...new Set(
          (Array.isArray(slot.characterIds) ? slot.characterIds : [])
            .map((characterId) => this.normalizeCharacterId(characterId))
            .filter((characterId): characterId is number => characterId !== null),
        ),
      ];

      roleMap.set(slot.role, normalizedCharacterIds);
    }

    const normalizedSlots = createEmptyAutoBuildManualSlots();
    const usedLeaderIds = new Set<number>();
    const usedSubIds = new Set<number>();

    for (const slot of normalizedSlots) {
      const nextIds: number[] = [];

      for (const characterId of (roleMap.get(slot.role) ?? [])) {
        if (
          AUTO_BUILD_MANUAL_SUB_SLOT_ROLES.includes(
            slot.role as (typeof AUTO_BUILD_MANUAL_SUB_SLOT_ROLES)[number],
          )
        ) {
          if (usedLeaderIds.has(characterId) || usedSubIds.has(characterId)) {
            continue;
          }

          usedSubIds.add(characterId);
          nextIds.push(characterId);
          continue;
        }

        if (usedSubIds.has(characterId) || nextIds.includes(characterId)) {
          continue;
        }

        usedLeaderIds.add(characterId);
        nextIds.push(characterId);
      }

      slot.characterIds = nextIds;
    }

    return normalizedSlots;
  }

  private normalizeLegacyManualSelection(
    rawLockedCharacterIds: number[] | undefined,
    rawCaptainCharacterId: number | null | undefined,
    rawFriendCaptainCharacterId: number | null | undefined,
  ): {
    lockedCharacterIds: number[];
    captainCharacterId: number | null;
    friendCaptainCharacterId: number | null;
    hasInvalidLeaderSelection: boolean;
  } {
    const lockedCharacterIds = this.normalizeCharacterIds(rawLockedCharacterIds);
    const lockedCharacterIdSet = new Set(lockedCharacterIds);
    let hasInvalidLeaderSelection = false;
    let captainCharacterId = this.normalizeCharacterId(rawCaptainCharacterId);
    let friendCaptainCharacterId = this.normalizeCharacterId(rawFriendCaptainCharacterId);

    if (captainCharacterId && !lockedCharacterIdSet.has(captainCharacterId)) {
      captainCharacterId = null;
      hasInvalidLeaderSelection = true;
    }

    if (friendCaptainCharacterId && !lockedCharacterIdSet.has(friendCaptainCharacterId)) {
      friendCaptainCharacterId = null;
      hasInvalidLeaderSelection = true;
    }

    if (!captainCharacterId && friendCaptainCharacterId) {
      captainCharacterId = friendCaptainCharacterId;
    }

    if (captainCharacterId && !friendCaptainCharacterId) {
      friendCaptainCharacterId = captainCharacterId;
    }

    return {
      lockedCharacterIds,
      captainCharacterId,
      friendCaptainCharacterId,
      hasInvalidLeaderSelection,
    };
  }

  private createManualSlotsFromLegacySelection(selection: {
    lockedCharacterIds: number[];
    captainCharacterId: number | null;
    friendCaptainCharacterId: number | null;
  }): AutoBuildManualSlotSelection[] {
    const manualSlots = createEmptyAutoBuildManualSlots();
    const captainSlot = manualSlots.find((slot) => slot.role === "captain");
    const friendCaptainSlot = manualSlots.find((slot) => slot.role === "friendCaptain");
    const leaderIds = new Set([
      selection.captainCharacterId,
      selection.friendCaptainCharacterId,
    ].filter((characterId): characterId is number => characterId !== null));

    if (captainSlot && selection.captainCharacterId) {
      captainSlot.characterIds = [selection.captainCharacterId];
    }

    if (friendCaptainSlot && selection.friendCaptainCharacterId) {
      friendCaptainSlot.characterIds = [selection.friendCaptainCharacterId];
    }

    const remainingSubIds = selection.lockedCharacterIds.filter(
      (characterId) => !leaderIds.has(characterId),
    );

    for (const [index, role] of AUTO_BUILD_MANUAL_SUB_SLOT_ROLES.entries()) {
      const slot = manualSlots.find((entry) => entry.role === role);
      const characterId = remainingSubIds[index];

      if (slot && characterId) {
        slot.characterIds = [characterId];
      }
    }

    return manualSlots;
  }

  private deriveLegacyManualSelectionFromManualSlots(manualSlots: AutoBuildManualSlotSelection[]): {
    lockedCharacterIds: number[];
    captainCharacterId: number | null;
    friendCaptainCharacterId: number | null;
  } {
    const captainCharacterId =
      manualSlots.find((slot) => slot.role === "captain")?.characterIds[0] ?? null;
    const friendCaptainCharacterId =
      manualSlots.find((slot) => slot.role === "friendCaptain")?.characterIds[0] ??
      captainCharacterId;
    const lockedCharacterIds = [
      ...new Set(manualSlots.flatMap((slot) => slot.characterIds)),
    ];

    return {
      lockedCharacterIds,
      captainCharacterId,
      friendCaptainCharacterId,
    };
  }

  private hasConflictingManualLeaderSelections(
    manualSlots: AutoBuildManualSlotSelection[],
  ): boolean {
    const captainIds = manualSlots.find((slot) => slot.role === "captain")?.characterIds ?? [];
    const friendCaptainIds =
      manualSlots.find((slot) => slot.role === "friendCaptain")?.characterIds ?? [];

    if (captainIds.length === 0 || friendCaptainIds.length === 0) {
      return false;
    }

    const captainIdSet = new Set(captainIds);

    return !friendCaptainIds.some((characterId) => captainIdSet.has(characterId));
  }

  private normalizeRequiredAbilities(
    requirements: AutoBuildAbilityRequirement[],
  ): AutoBuildAbilityRequirement[] {
    const normalizedRequirements = new Map<string, AutoBuildAbilityRequirement>();

    for (const requirement of requirements) {
      const abilityKey = requirement.abilityKey.trim();
      const normalizedAbilityKey = LEGACY_ABILITY_KEY_ALIASES[abilityKey] ?? abilityKey;
      const minTurns =
        requirement.minTurns !== null &&
        Number.isFinite(requirement.minTurns) &&
        requirement.minTurns > 0
          ? Math.floor(requirement.minTurns)
          : null;
      const slotTokens = [
        ...new Set(requirement.slotTokens.map((token) => token.trim().toUpperCase())),
      ]
        .filter((token) => token.length)
        .sort((left, right) => left.localeCompare(right));
      const requiredCharacterCount =
        Number.isFinite(requirement.requiredCharacterCount) &&
        requirement.requiredCharacterCount > 0
          ? Math.floor(requirement.requiredCharacterCount)
          : 1;

      if (normalizedAbilityKey.length === 0) {
        continue;
      }

      const identity = `${normalizedAbilityKey}|${minTurns ?? "none"}|${slotTokens.join(",")}`;
      const existingRequirement = normalizedRequirements.get(identity);

      if (existingRequirement) {
        existingRequirement.requiredCharacterCount = Math.max(
          existingRequirement.requiredCharacterCount,
          requiredCharacterCount,
        );
        continue;
      }

      normalizedRequirements.set(identity, {
        abilityKey: normalizedAbilityKey,
        minTurns,
        slotTokens,
        requiredCharacterCount,
      });
    }

    return [...normalizedRequirements.values()];
  }
}
