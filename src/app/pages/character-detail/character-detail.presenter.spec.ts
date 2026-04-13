import { describe, expect, it } from "vitest";

import { buildCharacterDetailViewModel, buildRumbleCardModel } from "./character-detail.presenter";

describe("character-detail presenter", () => {
  it("formats full rumble data into readable rows, pattern, and level entries", () => {
    const rumbleCard = buildRumbleCardModel({
      id: 13,
      stats: {
        def: 164,
        rumbleType: "DBF",
        spd: 124,
      },
      target: {
        comparator: "lowest",
        criteria: "HP",
      },
      pattern: [
        {
          action: "attack",
          type: "Normal",
        },
        {
          action: "heal",
          area: "Self",
          level: 2,
        },
      ],
      ability: [
        {
          effects: [
            {
              attributes: ["SPD"],
              effect: "buff",
              level: 3,
              targeting: {
                targets: ["crew"],
              },
            },
          ],
        },
      ],
      special: [
        {
          cooldown: 23,
          effects: [
            {
              attributes: ["Silence"],
              chance: 80,
              duration: 10,
              effect: "hinderance",
              targeting: {
                count: 1,
                priority: "highest",
                stat: "ATK",
                targets: ["enemies"],
              },
            },
          ],
        },
      ],
    });

    expect(rumbleCard?.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "DEF", value: "164" }),
        expect.objectContaining({ label: "SPD", value: "124" }),
        expect.objectContaining({ labelKey: "fields.target", value: "lowest HP target" }),
      ]),
    );
    expect(rumbleCard?.lists).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labelKey: "fields.pattern",
          items: expect.arrayContaining(["attack • Normal", "heal • Self • Lv 2"]),
        }),
      ]),
    );
    expect(rumbleCard?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Passive Lv 1",
          lists: expect.arrayContaining([
            expect.objectContaining({
              labelKey: "fields.effects",
              items: expect.arrayContaining(["buff • SPD • Lv 3 • crew"]),
            }),
          ]),
        }),
        expect.objectContaining({
          title: "Special Lv 1",
          rows: expect.arrayContaining([
            expect.objectContaining({ labelKey: "fields.cooldown", value: "23" }),
          ]),
        }),
      ]),
    );
  });

  it("formats basedOn-only rumble data with resolved character name", () => {
    const rumbleCard = buildRumbleCardModel(
      {
        id: 16,
        basedOn: 14,
      },
      "Usopp - Tabasco Star",
    );

    expect(rumbleCard?.texts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labelKey: "fields.inheritsFrom",
          value: "Usopp - Tabasco Star",
        }),
      ]),
    );
  });

  it("formats unexpected rumble keys through structured fallback entries", () => {
    const rumbleCard = buildRumbleCardModel({
      id: 99,
      strangePayload: {
        alpha: 1,
        beta: ["x", "y"],
        gamma: {
          delta: "z",
        },
      },
      anotherArray: [
        {
          foo: "bar",
          baz: 3,
        },
      ],
    });

    expect(rumbleCard?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Strange Payload",
          rows: expect.arrayContaining([
            expect.objectContaining({ label: "Alpha", value: "1" }),
            expect.objectContaining({ label: "Gamma Delta", value: "z" }),
          ]),
          lists: expect.arrayContaining([
            expect.objectContaining({ label: "Beta", items: ["x", "y"] }),
          ]),
        }),
        expect.objectContaining({
          title: "Another Array 1",
          rows: expect.arrayContaining([
            expect.objectContaining({ label: "Foo", value: "bar" }),
            expect.objectContaining({ label: "Baz", value: "3" }),
          ]),
        }),
      ]),
    );
  });

  it("builds support, synergy, and battle mode groups from the character detail record", () => {
    const viewModel = buildCharacterDetailViewModel({
      id: 501,
      name: "Test Character",
      type: "STR",
      classes: ["Fighter", "Slasher"],
      primaryClass: "Fighter",
      secondaryClass: "Slasher",
      stars: 6,
      cost: 55,
      combo: 4,
      maxLevel: 99,
      maxExperience: 5000000,
      stats: {
        min: { hp: 1200, atk: 600, rcv: 200 },
        max: { hp: 3500, atk: 1800, rcv: 420 },
        growth: 5,
      },
      regionAvailability: {
        exactLocal: true,
        thumbnailGlobal: true,
        thumbnailJapan: true,
        fullTransparent: true,
      },
      assets: {
        exactLocal: null,
        thumbnailGlobal: null,
        thumbnailJapan: null,
        fullTransparent: null,
      },
      imageUrl: "/assets/test.png",
      detailImageUrl: "/assets/test-detail.png",
      detail: {
        characterId: 501,
        captainAbility: "Boosts ATK.",
        specialName: "Impact Burst",
        specialText: "Deals damage.",
        specialNotes: null,
        superSpecialText: null,
        superSpecialCriteriaText: null,
        superSpecialNotes: null,
        superSpecialCriteria: null,
        partyConflictKeys: ["tony tony chopper"],
        builderAbilities: [
          {
            key: "bind",
            label: "Bind removal",
            minTurns: 5,
            isCompleteRemoval: true,
            slotTokens: ["captain"],
            source: "specialText",
            coverageMode: "explicit",
          },
        ],
        sailorAbilities: [],
        sailorNotes: "Works as sailor.",
        limitBreak: [{ description: "Adds extra damage." }],
        potentialAbilities: [{ Name: "Critical Hit", description: ["Increases crit chance."] }],
        supportData: [
          {
            supportedCharactersText: "Luffy, Zoro",
            levelDescriptions: ["Lv 5: boosts ATK."],
          },
        ],
        swapData: null,
        vsSpecial: null,
        superType: {
          class: "Fighter",
        },
        superClass: null,
        rumbleData: {
          id: 501,
          basedOn: 14,
        },
      },
    }, "Usopp - Tabasco Star");

    expect(viewModel.groups.map((group) => group.titleKey)).toEqual(
      expect.arrayContaining([
        "sections.abilities",
        "sections.enhancements",
        "sections.supportSynergy",
        "sections.battleModes",
      ]),
    );
    expect(viewModel.groups.flatMap((group) => group.cards.map((card) => card.titleKey))).toEqual(
      expect.arrayContaining([
        "sections.teamSynergy",
        "sections.supportData",
        "sections.rumbleData",
        "sections.superType",
      ]),
    );
  });
});
