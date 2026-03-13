import { describe, expect, it, vi } from "vitest";

import {
  AUTO_TEAM_CANDIDATE_LIMIT,
  AUTO_TEAM_BUILDER_DEFAULT_TYPE,
  type AutoBuildInput,
  type AutoTeamBuilderType,
} from "../models/auto-team-builder.models";
import { type CharacterDetailRecord } from "../models/optc.models";
import { AutoTeamBuilderService } from "./auto-team-builder.service";
import { buildAutoBuildCandidate, buildAutoTeamResult, hasReadableEffectText } from "./auto-team-builder.utils";

const INPUT = createInput();

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

  it("parses STR captain scope and dynamic reason chips", () => {
    const candidate = buildAutoBuildCandidate(
      createCharacterRecord({
        id: 5910,
        type: "STR",
        primaryClass: "Fighter",
        detail: {
          captainAbility: "Boosts ATK of STR and Fighter characters by 5x and HP by 1.3x.",
          specialText: "Boosts color affinity of STR characters by 2x for 1 turn.",
        },
      }),
      createInput("STR"),
      0,
      1,
    );

    expect(candidate.tags.captainScope.matchesType).toBe(true);
    expect(candidate.reasonChips).toContain("STR captain");
    expect(candidate.reasonChips).not.toContain("DEX captain");
  });

  it("parses QCK captain scope and dynamic reason chips", () => {
    const candidate = buildAutoBuildCandidate(
      createCharacterRecord({
        id: 5920,
        type: "QCK",
        primaryClass: "Fighter",
        detail: {
          captainAbility: "Boosts ATK of QCK and Fighter characters by 5x and HP by 1.3x.",
          specialText: "Boosts color affinity of QCK characters by 2x for 1 turn.",
        },
      }),
      createInput("QCK"),
      0,
      1,
    );

    expect(candidate.tags.captainScope.matchesType).toBe(true);
    expect(candidate.reasonChips).toContain("QCK captain");
    expect(candidate.reasonChips).not.toContain("STR captain");
  });

  it("parses PSY captain scope and dynamic reason chips", () => {
    const candidate = buildAutoBuildCandidate(
      createCharacterRecord({
        id: 5930,
        type: "PSY",
        primaryClass: "Fighter",
        detail: {
          captainAbility: "Boosts ATK of PSY and Fighter characters by 5x and HP by 1.3x.",
          specialText: "Boosts color affinity of PSY characters by 2x for 1 turn.",
        },
      }),
      createInput("PSY"),
      0,
      1,
    );

    expect(candidate.tags.captainScope.matchesType).toBe(true);
    expect(candidate.reasonChips).toContain("PSY captain");
    expect(candidate.reasonChips).not.toContain("QCK captain");
  });

  it("parses INT captain scope and dynamic reason chips", () => {
    const candidate = buildAutoBuildCandidate(
      createCharacterRecord({
        id: 5940,
        type: "INT",
        primaryClass: "Fighter",
        detail: {
          captainAbility: "Boosts ATK of INT and Fighter characters by 5x and HP by 1.3x.",
          specialText: "Boosts color affinity of INT characters by 2x for 1 turn.",
        },
      }),
      createInput("INT"),
      0,
      1,
    );

    expect(candidate.tags.captainScope.matchesType).toBe(true);
    expect(candidate.reasonChips).toContain("INT captain");
    expect(candidate.reasonChips).not.toContain("PSY captain");
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

  it("requests QCK candidates from the repository service when QCK is selected", async () => {
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

    await service.buildTeam("Fighter", "QCK");

    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      "QCK",
      AUTO_TEAM_CANDIDATE_LIMIT,
    );
  });

  it("requests PSY candidates from the repository service when PSY is selected", async () => {
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

    await service.buildTeam("Fighter", "PSY");

    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      "PSY",
      AUTO_TEAM_CANDIDATE_LIMIT,
    );
  });

  it("requests INT candidates from the repository service when INT is selected", async () => {
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

    await service.buildTeam("Fighter", "INT");

    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      "INT",
      AUTO_TEAM_CANDIDATE_LIMIT,
    );
  });

  it("defaults to DEX when no type is provided", async () => {
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
      AUTO_TEAM_BUILDER_DEFAULT_TYPE,
      AUTO_TEAM_CANDIDATE_LIMIT,
    );
  });
});

function createInput(type: AutoTeamBuilderType = AUTO_TEAM_BUILDER_DEFAULT_TYPE): AutoBuildInput {
  return {
    type,
    selectedClass: "Fighter",
    candidateLimit: AUTO_TEAM_CANDIDATE_LIMIT,
  };
}

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
    type: overrides.type ?? AUTO_TEAM_BUILDER_DEFAULT_TYPE,
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
