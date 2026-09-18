import '@angular/compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type AutoBuildConstraints,
  type AutoBuildManualSlotSelection,
  type AutoBuildResult,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import { runAutoTeamBuildAttempt } from './auto-team-builder.engine';
import { type AutoBuildInfeasibilityDiagnosis } from './auto-team-builder-infeasibility.utils';
import { AutoTeamBuilderService } from './auto-team-builder.service';
import { matchesCharacterFacet } from './character-facet-filter.utils';
import { type AutoTeamBuilderWorkerRequest } from './auto-team-builder.worker.models';

/**
 * 869f333ey - issue #523. A pinned Captain that provably cannot lead the crew is replaced by one
 * from the same pool that can, before anything is relaxed, and the replacement is reported as the
 * relaxation it is. Each decision the owner took (D1-D9) has a test here; the real-dataset run -
 * Loki replaced by Ripley for the report's exact request - is recorded in the brain audit.
 *
 * The pool: QCK_CAPTAIN boosts [QCK] only, and the reader asks for a DEX and STR crew with both
 * leaders covering it, so it can boost nobody - the report's shape. DEX_CAPTAIN and ALL_CAPTAIN can.
 */

const QCK_CAPTAIN = 100;
const DEX_CAPTAIN = 101;
const ALL_CAPTAIN = 102;
const OUTSIDE_FAVORITES_CAPTAIN = 103;
const SUBS = [110, 111, 112, 113, 114, 115];

function character(
  id: number,
  type: string,
  options: { name?: string; captainAbility?: string | null; cost?: number; specialText?: string } = {},
): CharacterDetailRecord {
  return {
    id,
    name: options.name ?? `Unit ${id}`,
    isIncomplete: false,
    type,
    classes: ['Striker'],
    primaryClass: 'Striker',
    secondaryClass: null,
    stars: 6,
    cost: options.cost ?? 55,
    combo: 4,
    captainHpBoost: 1.2,
    captainAtkBoost: 3,
    captainAverageBoost: 2.1,
    stats: { min: { hp: 1000, atk: 400, rcv: 120 }, max: { hp: 3900, atk: 1900, rcv: 340 }, growth: 3 },
    regionArtwork: { exactLocal: true, thumbnailGlobal: true, thumbnailJapan: false },
    regionRelease: { availableOnGlobal: null },
    assets: { exactLocal: null, thumbnailGlobal: null, thumbnailJapan: null },
    imageUrl: 'assets/placeholders/character-card.svg',
    detailImageUrl: 'assets/placeholders/character-card.svg',
    detail: {
      characterId: id,
      captainAbility: options.captainAbility ?? null,
      captainAbilityVariants: [],
      captainNotes: null,
      specialName: null,
      specialText: options.specialText ?? null,
      specialNotes: null,
      superSpecialText: null,
      superSpecialCriteriaText: null,
      superSpecialNotes: null,
      superSpecialCriteria: null,
      partyConflictKeys: [],
      characterTags: [],
      builderAbilities: [],
      sailorAbilities: [],
      sailorNotes: null,
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: null,
      superTandemData: null,
      superClass: null,
      rumbleData: null,
    },
  } as unknown as CharacterDetailRecord;
}

function pool(): CharacterDetailRecord[] {
  return [
    character(QCK_CAPTAIN, 'QCK', {
      name: 'Pinned QCK Captain',
      captainAbility: 'Boosts ATK of [QCK] characters by 3x and their HP by 1.2x.',
    }),
    character(DEX_CAPTAIN, 'DEX', {
      name: 'DEX and STR Captain',
      captainAbility: 'Boosts ATK of [DEX] and [STR] characters by 3x and their HP by 1.2x.',
    }),
    character(ALL_CAPTAIN, 'STR', {
      name: 'Universal Captain',
      captainAbility: 'Boosts ATK of all characters by 3x and their HP by 1.2x.',
    }),
    character(OUTSIDE_FAVORITES_CAPTAIN, 'DEX', {
      name: 'Captain Outside The Favourites',
      captainAbility: 'Boosts ATK of all characters by 4x and their HP by 1.3x.',
    }),
    ...SUBS.map((id, index) =>
      character(id, index % 2 === 0 ? 'DEX' : 'STR', {
        // A sub with no special has no role, and the search never picks it.
        specialText: 'Boosts ATK of all characters by 2x for 1 turn.',
      }),
    ),
  ];
}

class Repository {
  public constructor(private readonly records: CharacterDetailRecord[]) {}

  public async getAutoBuilderCandidates(
    types: string[],
    _limit: number | null,
    options: { selectedClasses?: string[]; allowedCharacterIds?: number[]; lockedCharacterIds?: number[]; excludedCharacterIds?: number[] } = {},
  ): Promise<CharacterDetailRecord[]> {
    const locked = new Set(options.lockedCharacterIds ?? []);
    const allowed = options.allowedCharacterIds?.length ? new Set([...options.allowedCharacterIds, ...locked]) : null;

    return this.records.filter((record) => {
      const facet =
        matchesCharacterFacet('type', record, { values: types, matchMode: 'any' }) &&
        matchesCharacterFacet('class', record, { values: options.selectedClasses ?? [], matchMode: 'any' });
      return (facet || locked.has(record.id)) && (!allowed || allowed.has(record.id));
    });
  }

  public async getShips(): Promise<never[]> {
    return [];
  }
}

function captainSlot(characterId: number): AutoBuildManualSlotSelection {
  return { role: 'captain', characterIds: [characterId] };
}

function constraints(overrides: Partial<AutoBuildConstraints> = {}): AutoBuildConstraints {
  return {
    requireAllSelectedTypesInTeam: true,
    requireAllSelectedClassesInTeam: false,
    requireBothLeadersFullCaptainAbilityCoverage: true,
    favoritesOnly: true,
    favoriteCharacterIds: [QCK_CAPTAIN, DEX_CAPTAIN, ALL_CAPTAIN, ...SUBS],
    manualSlots: [captainSlot(QCK_CAPTAIN)],
    ...overrides,
  };
}

async function build(
  overrides: Partial<AutoBuildConstraints> = {},
  onInfeasibility?: (diagnosis: AutoBuildInfeasibilityDiagnosis) => void,
): Promise<AutoBuildResult | null> {
  const service = new AutoTeamBuilderService(new Repository(pool()) as never);

  return service.buildTeam(['Striker'], ['DEX', 'STR'], constraints(overrides), {
    workerCount: 1,
    ...(onInfeasibility ? { onInfeasibility } : {}),
  });
}

const leaderIds = (result: AutoBuildResult | null) => ({
  captain: result?.slots.find((slot) => slot.role === 'captain')?.character.id,
  friendCaptain: result?.slots.find((slot) => slot.role === 'friendCaptain')?.character.id,
});

/**
 * A worker that runs the real engine on the main thread and records every request it was sent, so a
 * test can see exactly what the service asked for.
 */
function stubEngineWorker(): {
  requests: AutoTeamBuilderWorkerRequest[];
  workers: { terminated: boolean }[];
} {
  const requests: AutoTeamBuilderWorkerRequest[] = [];
  const workers: FakeEngineWorker[] = [];

  class FakeEngineWorker extends EventTarget {
    public terminated = false;
    private records: CharacterDetailRecord[] = [];

    public constructor() {
      super();
      workers.push(this);
    }

    public postMessage(request: AutoTeamBuilderWorkerRequest): void {
      requests.push(request);
      queueMicrotask(() => {
        if (request.type === 'init') {
          this.records = request.records;
          this.dispatchEvent(new MessageEvent('message', { data: { type: 'ready' } }));
        } else if (request.type === 'runAttempt') {
          const result = runAutoTeamBuildAttempt(
            this.records,
            request.input,
            request.requestedInput,
            request.requireLeadersWithoutSuperEffects,
            request.friendCaptainRecords,
            request.autoFillCharacterIds,
            request.leaderAutoFillCharacterIds,
            request.subAutoFillCharacterIds,
          );
          this.dispatchEvent(
            new MessageEvent('message', { data: { type: 'result', runId: request.runId, result } }),
          );
        }
      });
    }

    public terminate(): void {
      this.terminated = true;
    }
  }

  vi.stubGlobal('Worker', FakeEngineWorker);

  return { requests, workers };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('alternative Captain (869f333ey, issue #523)', () => {
  /* D1 + D4: the team the report asked for, under a Captain that can boost it. */
  it('replaces a Captain that provably cannot lead the crew, and reports it as a relaxation', async () => {
    const result = await build();

    expect(result).not.toBeNull();
    expect(leaderIds(result).captain).not.toBe(QCK_CAPTAIN);
    expect([DEX_CAPTAIN, ALL_CAPTAIN]).toContain(leaderIds(result).captain);
    expect(result!.relaxation.usedFallback).toBe(true);
    expect(result!.relaxation.replacedCaptain).toEqual({
      fromCharacterId: QCK_CAPTAIN,
      fromName: 'Pinned QCK Captain',
      toCharacterId: leaderIds(result).captain,
      toName: result!.slots.find((slot) => slot.role === 'captain')!.character.name,
    });
  });

  /* D1: every filter and the coverage are kept - nothing else was relaxed to get there. */
  it('keeps every other rule: no dropped filter and no relaxed coverage', async () => {
    const relaxation = (await build())!.relaxation;

    expect(relaxation.droppedTypes).toEqual([]);
    expect(relaxation.droppedClasses).toEqual([]);
    expect(relaxation.ignoredCaptainAbilityCoverage).toBeFalsy();
    expect(relaxation.downgradedCaptainAbilityCoverageToSimple).toBeFalsy();
  });

  /* D4: the reader's own request comes back, and every slot says why its Captain changed. */
  it('keeps the request as the reader sent it and explains the change on every slot', async () => {
    const result = (await build())!;

    expect(result.requestedInput.manualSlots.find((slot) => slot.role === 'captain')?.characterIds).toEqual([
      QCK_CAPTAIN,
    ]);

    for (const slot of result.slots) {
      expect(slot.explanation?.fallbackReasons.map((reason) => reason.code)).toContain('fallbackReplacedCaptain');
    }

    /* The Captain the reader did not pick is not presented as their pick. */
    const captain = result.slots.find((entry) => entry.role === 'captain')!;
    expect(captain.explanation?.reasons.map((reason) => reason.code)).not.toContain('manualPick');
  });

  /* D2: a Captain that can lead the crew is never second-guessed. */
  it('leaves a Captain that can lead the crew exactly as it was', async () => {
    const result = await build({ manualSlots: [captainSlot(DEX_CAPTAIN)] });

    expect(leaderIds(result).captain).toBe(DEX_CAPTAIN);
    expect(result!.relaxation.replacedCaptain).toBeUndefined();
    expect(result!.relaxation.usedFallback).toBe(false);
  });

  /* D8: "from the same candidate pool" - a Captain outside the favourites is not borrowed. */
  it('only uses Captains from the same candidate pool', async () => {
    const result = await build({
      favoriteCharacterIds: [QCK_CAPTAIN, DEX_CAPTAIN, ...SUBS],
    });

    expect(leaderIds(result).captain).toBe(DEX_CAPTAIN);
  });

  /*
   * D9: only the Captain changes; a Friend Captain the reader pinned keeps its seat.
   *
   * The seat alone cannot prove it here: the engine tries a pinned leader before any auto-filled
   * one, and on this small pool that first try always succeeds - the test stayed green with the fix
   * removed. On the real dataset it did not: some alternatives could not finish a team with the
   * reader's Ripley, and the engine moved on to an auto-filled Friend Captain for the same Captain.
   * So the attempt itself is checked too: the pinned Friend Captain goes in as required.
   */
  it('keeps a pinned Friend Captain in its seat, held as required', async () => {
    const { requests } = stubEngineWorker();
    const result = await build({
      manualSlots: [captainSlot(QCK_CAPTAIN), { role: 'friendCaptain', characterIds: [ALL_CAPTAIN] }],
    });
    const attempt = requests.find((request) => request.type === 'runAttempt');
    const friendCaptainSlot =
      attempt?.type === 'runAttempt'
        ? attempt.input.manualSlots.find((slot) => slot.role === 'friendCaptain')
        : undefined;

    expect(leaderIds(result).friendCaptain).toBe(ALL_CAPTAIN);
    expect(leaderIds(result).captain).not.toBe(QCK_CAPTAIN);
    expect(result!.relaxation.replacedCaptain?.fromCharacterId).toBe(QCK_CAPTAIN);
    expect(friendCaptainSlot?.requiredCharacterId).toBe(ALL_CAPTAIN);
  });

  /* D6: when no Captain can, the failure says why - and that the others were tried. */
  it('says why the pinned Captain could not lead the crew when no alternative exists', async () => {
    let diagnosis: AutoBuildInfeasibilityDiagnosis | null = null;
    const result = await build(
      { favoriteCharacterIds: [QCK_CAPTAIN, ...SUBS.slice(0, 2)] },
      (reported) => {
        diagnosis = reported;
      },
    );

    expect(result).toBeNull();
    expect(diagnosis!.pinnedCaptain).toEqual(
      expect.objectContaining({
        characterId: QCK_CAPTAIN,
        name: 'Pinned QCK Captain',
        alternativeCaptainIds: [],
      }),
    );
    expect(diagnosis!.pinnedCaptain!.impossibility.map((reason) => reason.kind)).toContain(
      'selectedTypeOutsideCaptainScope',
    );
  });

  /*
   * The worker path: one worker initialised with the pool, one `runAttempt` carrying the
   * alternatives as its own leader auto-fill, terminated afterwards - and the same team as the main
   * thread finds.
   */
  it('runs the attempt in a worker when there is one, with the same result', async () => {
    const mainThread = await build();
    const { requests, workers } = stubEngineWorker();
    const inWorker = await build();
    const attempt = requests.find((request) => request.type === 'runAttempt');

    expect(leaderIds(inWorker)).toEqual(leaderIds(mainThread));
    expect(inWorker!.relaxation.replacedCaptain).toEqual(mainThread!.relaxation.replacedCaptain);
    expect(attempt).toBeDefined();
    expect(attempt!.type === 'runAttempt' && attempt!.leaderAutoFillCharacterIds).toEqual(
      expect.arrayContaining([DEX_CAPTAIN, ALL_CAPTAIN]),
    );
    expect(workers[0]!.terminated).toBe(true);
  });
});
