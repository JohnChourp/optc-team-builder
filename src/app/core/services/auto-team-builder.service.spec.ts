import { describe, expect, it, vi } from "vitest";

import {
  AUTO_TEAM_BUILDER_TYPE,
  AUTO_TEAM_CANDIDATE_LIMIT,
  type AutoBuildInput,
} from "../models/auto-team-builder.models";
import { type CharacterDetailRecord } from "../models/optc.models";
import { AutoTeamBuilderService } from "./auto-team-builder.service";
import { buildAutoBuildCandidate, buildAutoTeamResult, hasReadableEffectText } from "./auto-team-builder.utils";

const INPUT: AutoBuildInput = {
  type: AUTO_TEAM_BUILDER_TYPE,
  selectedClass: "Fighter",
  candidateLimit: AUTO_TEAM_CANDIDATE_LIMIT,
};

describe("Auto team builder", () => {
  it("parses burst, consistency, and utility tags from effect text", () => {
    const candidate = buildAutoBuildCandidate(
      createCharacterRecord({
        id: 5900,
        primaryClass: "Fighter",
        detail: {
          captainAbility: "Boosts ATK of DEX and Fighter characters by 5.25x and HP by 1.4x.",
          specialText:
            "Boosts orb effects by 2.5x, boosts color affinity by 2x, changes orbs into Matching Orbs, reduces Bind and Despair by 5 turns and reduces Special Cooldown by 1 turn.",
        },
      }),
      INPUT,
      0,
      1,
    );

    expect(candidate.tags.captainScope.matchesType).toBe(true);
    expect(candidate.tags.captainScope.matchesClass).toBe(true);
    expect(candidate.tags.burstRoles).toEqual(
      expect.arrayContaining(["atkBoost", "orbBoost", "colorAffinity"]),
    );
    expect(candidate.tags.consistencyRoles).toEqual(
      expect.arrayContaining(["matchingOrbs", "orbChange", "cooldownReduction"]),
    );
    expect(candidate.tags.utilityRoles).toEqual(expect.arrayContaining(["bind", "despair"]));
  });

  it("ignores recent placeholders with empty effect text", () => {
    const emptyRecent = createCharacterRecord({
      id: 6000,
      primaryClass: "Fighter",
      detail: {},
    });

    expect(hasReadableEffectText(emptyRecent)).toBe(false);

    const result = buildAutoTeamResult(
      [
        emptyRecent,
        createCaptainRecord(),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      INPUT,
    );

    expect(result).not.toBeNull();
    expect(result?.candidateCount).toBe(5);
    expect(result?.slots.some((slot) => slot.character.id === 6000)).toBe(false);
  });

  it("duplicates the best captain and prefers complementary class-matching subs", () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createOffClassRedundantSubRecord(),
      ],
      INPUT,
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.role).toBe("captain");
    expect(result?.slots[1]?.role).toBe("friendCaptain");
    expect(result?.slots[0]?.character.id).toBe(result?.slots[1]?.character.id);

    const teamIds = result?.slots.map((slot) => slot.character.id) ?? [];

    expect(teamIds).toEqual(expect.arrayContaining([5900, 5890, 5880, 5870, 5860]));
    expect(teamIds).not.toContain(5850);
    expect(result?.coverage.utility).toContain("Bind clear");
  });

  it("requests DEX candidates from the repository service", async () => {
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue([
          createCaptainRecord(),
          createAtkSubRecord(),
          createAffinitySubRecord(),
          createUtilitySubRecord(),
          createConsistencySubRecord(),
        ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    await service.buildTeam("Fighter");

    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      AUTO_TEAM_BUILDER_TYPE,
      AUTO_TEAM_CANDIDATE_LIMIT,
    );
  });
});

function createCaptainRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5900,
    primaryClass: "Fighter",
    secondaryClass: "Free Spirit",
    detail: {
      captainAbility:
        "Boosts ATK of DEX and Fighter characters by 5.25x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.",
      specialText:
        "Boosts orb effects of DEX and Fighter characters by 2.25x for 1 turn and changes orbs into Matching Orbs.",
    },
  });
}

function createAtkSubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5890,
    primaryClass: "Fighter",
    detail: {
      specialText: "Boosts ATK of Fighter characters by 2.5x for 1 turn.",
    },
  });
}

function createAffinitySubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5880,
    primaryClass: "Fighter",
    detail: {
      specialText: "Boosts color affinity of DEX characters by 2x for 1 turn.",
    },
  });
}

function createUtilitySubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5870,
    primaryClass: "Fighter",
    detail: {
      specialText:
        "Reduces Bind and Despair duration by 5 turns and reduces Threshold Damage Reduction duration by 5 turns.",
    },
  });
}

function createConsistencySubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5860,
    primaryClass: "Fighter",
    detail: {
      specialText: "Changes crew orbs into Matching Orbs and reduces Special Cooldown by 1 turn.",
    },
  });
}

function createOffClassRedundantSubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5850,
    primaryClass: "Slasher",
    detail: {
      specialText: "Boosts ATK of DEX characters by 2.5x for 1 turn.",
    },
  });
}

function createCharacterRecord(
  overrides: Partial<CharacterDetailRecord> & {
    id: number;
    detail?: Partial<CharacterDetailRecord["detail"]>;
    primaryClass: string;
  },
): CharacterDetailRecord {
  const secondaryClass = overrides.secondaryClass ?? null;
  const classes = [overrides.primaryClass, secondaryClass].filter((value): value is string => Boolean(value));

  return {
    id: overrides.id,
    name: overrides.name ?? `Unit ${overrides.id}`,
    type: overrides.type ?? "DEX",
    classes,
    primaryClass: overrides.primaryClass,
    secondaryClass,
    stars: overrides.stars ?? 6,
    cost: overrides.cost ?? 55,
    combo: overrides.combo ?? 4,
    maxLevel: overrides.maxLevel ?? 99,
    maxExperience: overrides.maxExperience ?? 1_000_000,
    stats: overrides.stats ?? {
      min: { hp: 1000, atk: 400, rcv: 120 },
      max: { hp: 3900, atk: 1900, rcv: 340 },
      growth: 3,
    },
    regionAvailability: overrides.regionAvailability ?? {
      exactLocal: true,
      thumbnailGlobal: true,
      thumbnailJapan: false,
      fullTransparent: false,
    },
    assets: overrides.assets ?? {
      exactLocal: null,
      thumbnailGlobal: null,
      thumbnailJapan: null,
      fullTransparent: null,
    },
    imageUrl: overrides.imageUrl ?? "assets/placeholders/character-card.svg",
    detailImageUrl: overrides.detailImageUrl ?? "assets/placeholders/character-card.svg",
    detail: {
      characterId: overrides.id,
      captainAbility: overrides.detail?.captainAbility ?? null,
      specialName: overrides.detail?.specialName ?? null,
      specialText: overrides.detail?.specialText ?? null,
      specialNotes: overrides.detail?.specialNotes ?? null,
      sailorAbilities: overrides.detail?.sailorAbilities ?? [],
      sailorNotes: overrides.detail?.sailorNotes ?? null,
      limitBreak: overrides.detail?.limitBreak ?? [],
      potentialAbilities: overrides.detail?.potentialAbilities ?? [],
      supportData: overrides.detail?.supportData ?? [],
      swapData: overrides.detail?.swapData ?? null,
      vsSpecial: overrides.detail?.vsSpecial ?? null,
      superType: overrides.detail?.superType ?? null,
      superClass: overrides.detail?.superClass ?? null,
      rumbleData: overrides.detail?.rumbleData ?? null,
    },
  };
}
