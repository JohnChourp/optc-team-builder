import { type CharacterDetailRecord } from "../../core/models/optc.models";

type DisplayLabel = {
  label?: string;
  labelKey?: string;
};

export interface DetailDisplayRow extends DisplayLabel {
  value: string;
}

export interface DetailDisplayText extends DisplayLabel {
  value: string;
  tone?: "default" | "muted";
}

export interface DetailDisplayList extends DisplayLabel {
  items: string[];
}

export interface DetailDisplayEntry {
  title?: string;
  titleKey?: string;
  rows: DetailDisplayRow[];
  texts: DetailDisplayText[];
  lists: DetailDisplayList[];
  chips: string[];
}

export interface DetailDisplayCard extends DetailDisplayEntry {
  entries: DetailDisplayEntry[];
}

export interface DetailDisplayGroup {
  titleKey: string;
  cards: DetailDisplayCard[];
}

export interface CharacterDetailViewModel {
  heroMeta: DetailDisplayRow[];
  heroStats: DetailDisplayRow[];
  groups: DetailDisplayGroup[];
}

type UnknownRecord = Record<string, unknown>;

const RUMBLE_KNOWN_KEYS = new Set(["ability", "basedOn", "id", "pattern", "special", "stats", "target"]);

export function buildCharacterDetailViewModel(
  character: CharacterDetailRecord,
  basedOnCharacterName: string | null = null,
): CharacterDetailViewModel {
  const groups: DetailDisplayGroup[] = [
    buildOverviewGroup(character),
    buildAbilitiesGroup(character),
    buildEnhancementsGroup(character),
    buildSupportSynergyGroup(character),
    buildBattleModesGroup(character, basedOnCharacterName),
  ].filter((group): group is DetailDisplayGroup => group !== null);

  return {
    heroMeta: [
      createRow("fields.type", character.type),
      createRow("fields.primaryClass", character.primaryClass),
      ...(character.secondaryClass
        ? [createRow("fields.secondaryClass", character.secondaryClass)]
        : []),
      createRow("fields.stars", formatNumber(character.stars)),
      createRow("fields.cost", formatNumber(character.cost)),
      createRow("fields.maxLevel", formatNumber(character.maxLevel)),
    ],
    heroStats: [
      createRow("stats.maxHp", formatNumber(character.stats.max.hp)),
      createRow("stats.maxAtk", formatNumber(character.stats.max.atk)),
      createRow("stats.maxRcv", formatNumber(character.stats.max.rcv)),
    ],
    groups,
  };
}

export function buildRumbleCardModel(
  rumbleData: Record<string, unknown> | null,
  basedOnCharacterName: string | null = null,
): DetailDisplayCard | null {
  if (!rumbleData || typeof rumbleData !== "object" || Array.isArray(rumbleData)) {
    return null;
  }

  const rows: DetailDisplayRow[] = [];
  const texts: DetailDisplayText[] = [];
  const lists: DetailDisplayList[] = [];
  const entries: DetailDisplayEntry[] = [];

  const basedOnId = resolveRumbleBasedOnId(rumbleData);

  if (basedOnId) {
    texts.push(
      createText(
        "fields.inheritsFrom",
        basedOnCharacterName?.trim().length
          ? basedOnCharacterName.trim()
          : `Character #${basedOnId}`,
      ),
    );
  }

  const stats = asRecord(rumbleData["stats"]);

  if (stats) {
    Object.entries(stats).forEach(([key, value]) => {
      const formattedValue = formatScalar(value);

      if (formattedValue) {
        rows.push(createRow(undefined, formattedValue, formatRumbleStatLabel(key)));
      }
    });
  }

  const targetSummary = formatRumbleTarget(rumbleData["target"]);

  if (targetSummary) {
    rows.push(createRow("fields.target", targetSummary));
  }

  const pattern = Array.isArray(rumbleData["pattern"])
    ? rumbleData["pattern"]
        .map((step) => formatRumblePatternStep(step))
        .filter((step): step is string => Boolean(step))
    : [];

  if (pattern.length) {
    lists.push(createList("fields.pattern", pattern));
  }

  const abilityEntries = Array.isArray(rumbleData["ability"])
    ? rumbleData["ability"]
        .map((entry, index) => buildRumbleLevelEntry("fields.passiveLevel", index + 1, entry))
        .filter((entry): entry is DetailDisplayEntry => entry !== null)
    : [];

  const specialEntries = Array.isArray(rumbleData["special"])
    ? rumbleData["special"]
        .map((entry, index) => buildRumbleLevelEntry("fields.specialLevel", index + 1, entry))
        .filter((entry): entry is DetailDisplayEntry => entry !== null)
    : [];

  const extraEntries = Object.entries(rumbleData)
    .filter(([key]) => !RUMBLE_KNOWN_KEYS.has(key))
    .flatMap(([key, value]) => buildStructuredEntries(humanizeKey(key), value));

  entries.push(...abilityEntries, ...specialEntries, ...extraEntries);

  if (!rows.length && !texts.length && !lists.length && !entries.length) {
    return null;
  }

  return {
    titleKey: "sections.rumbleData",
    rows,
    texts,
    lists,
    entries,
    chips: [],
  };
}

export function resolveRumbleBasedOnId(rumbleData: Record<string, unknown> | null): number | null {
  if (!rumbleData || typeof rumbleData !== "object" || Array.isArray(rumbleData)) {
    return null;
  }

  const basedOnValue = rumbleData["basedOn"];
  const basedOnId = Number(basedOnValue);

  return Number.isInteger(basedOnId) && basedOnId > 0 ? basedOnId : null;
}

function buildOverviewGroup(character: CharacterDetailRecord): DetailDisplayGroup {
  return {
    titleKey: "sections.overview",
    cards: [
      {
        titleKey: "sections.profile",
        rows: [
          createRow("fields.type", character.type),
          createRow("fields.primaryClass", character.primaryClass),
          ...(character.secondaryClass
            ? [createRow("fields.secondaryClass", character.secondaryClass)]
            : []),
          createRow("fields.stars", formatNumber(character.stars)),
          createRow("fields.cost", formatNumber(character.cost)),
          createRow("fields.maxLevel", formatNumber(character.maxLevel)),
          createRow("fields.combo", formatNumber(character.combo)),
          createRow("fields.maxExperience", formatNumber(character.maxExperience)),
        ],
        texts: [],
        lists: [],
        entries: [],
        chips: [],
      },
      {
        titleKey: "sections.maxStats",
        rows: [
          createRow("stats.maxHp", formatNumber(character.stats.max.hp)),
          createRow("stats.maxAtk", formatNumber(character.stats.max.atk)),
          createRow("stats.maxRcv", formatNumber(character.stats.max.rcv)),
          createRow("fields.minHp", formatNumber(character.stats.min.hp)),
          createRow("fields.minAtk", formatNumber(character.stats.min.atk)),
          createRow("fields.minRcv", formatNumber(character.stats.min.rcv)),
          createRow("fields.growth", formatNumber(character.stats.growth)),
        ],
        texts: [],
        lists: [],
        entries: [],
        chips: [],
      },
    ],
  };
}

function buildAbilitiesGroup(character: CharacterDetailRecord): DetailDisplayGroup | null {
  const { detail } = character;
  const cards: DetailDisplayCard[] = [];
  const captainAbilityVariants = detail.captainAbilityVariants.length
    ? detail.captainAbilityVariants
    : detail.captainAbility
      ? [
          {
            key: 'captain',
            label: 'Captain Ability',
            text: detail.captainAbility,
          },
        ]
      : [];

  if (captainAbilityVariants.length || detail.captainNotes) {
    cards.push({
      titleKey: "sections.captainAbility",
      rows: [],
      texts: detail.captainNotes
        ? [createText("fields.captainNotes", detail.captainNotes, "muted")]
        : [],
      lists: [],
      entries: captainAbilityVariants.map((entry) => ({
        title: entry.label,
        rows: [],
        texts: [createText(undefined, entry.text)],
        lists: [],
        chips: [],
      })),
      chips: [],
    });
  }

  if (detail.specialName || detail.specialText || detail.specialNotes) {
    cards.push({
      titleKey: "sections.special",
      rows: [],
      texts: [
        ...(detail.specialName ? [createText("fields.specialName", detail.specialName)] : []),
        ...(detail.specialText ? [createText("fields.specialEffect", detail.specialText)] : []),
        ...(detail.specialNotes
          ? [createText("fields.specialNotes", detail.specialNotes, "muted")]
          : []),
      ],
      lists: [],
      entries: [],
      chips: [],
    });
  }

  if (
    detail.superSpecialText ||
    detail.superSpecialCriteriaText ||
    detail.superSpecialNotes ||
    detail.superSpecialCriteria
  ) {
    cards.push({
      titleKey: "sections.superSpecial",
      rows: [],
      texts: [
        ...(detail.superSpecialText
          ? [createText("fields.superSpecialEffect", detail.superSpecialText)]
          : []),
        ...(detail.superSpecialCriteriaText
          ? [createText("superSpecial.criteriaLabel", detail.superSpecialCriteriaText)]
          : []),
        ...(detail.superSpecialNotes
          ? [createText("superSpecial.notesLabel", detail.superSpecialNotes, "muted")]
          : []),
      ],
      lists: [],
      entries: detail.superSpecialCriteria
        ? buildStructuredEntries("Parsed Criteria", detail.superSpecialCriteria, "fields.parsedCriteria")
        : [],
      chips: [],
    });
  }

  if (detail.sailorAbilities.length || detail.sailorNotes) {
    cards.push({
      titleKey: "sections.sailorAbilities",
      rows: [],
      texts: detail.sailorNotes ? [createText("fields.sailorNotes", detail.sailorNotes, "muted")] : [],
      lists: detail.sailorAbilities.length ? [createList(undefined, detail.sailorAbilities)] : [],
      entries: [],
      chips: [],
    });
  }

  return cards.length
    ? {
        titleKey: "sections.abilities",
        cards,
      }
    : null;
}

function buildEnhancementsGroup(character: CharacterDetailRecord): DetailDisplayGroup | null {
  const { detail } = character;
  const cards: DetailDisplayCard[] = [];

  if (detail.limitBreak.length) {
    cards.push({
      titleKey: "sections.limitBreak",
      rows: [],
      texts: [],
      lists: [
        createList(
          undefined,
          detail.limitBreak
            .map((entry) => sanitizeText(entry.description))
            .filter((entry): entry is string => Boolean(entry)),
        ),
      ],
      entries: [],
      chips: [],
    });
  }

  if (detail.potentialAbilities.length) {
    cards.push({
      titleKey: "sections.potentialAbilities",
      rows: [],
      texts: [],
      lists: [],
      entries: detail.potentialAbilities
        .map((entry, index) => ({
          title: sanitizeText(entry.Name) ?? `Potential ${index + 1}`,
          rows: [],
          texts: [],
          lists: Array.isArray(entry.description) && entry.description.length
            ? [createList(undefined, entry.description.map((item) => sanitizeText(item)).filter(Boolean) as string[])]
            : [],
          chips: [],
        }))
        .filter((entry) => entry.title || entry.lists.length),
      chips: [],
    });
  }

  return cards.length
    ? {
        titleKey: "sections.enhancements",
        cards,
      }
    : null;
}

function buildSupportSynergyGroup(character: CharacterDetailRecord): DetailDisplayGroup | null {
  const { detail } = character;
  const cards: DetailDisplayCard[] = [];

  if (detail.supportData.length) {
    cards.push({
      titleKey: "sections.supportData",
      rows: [],
      texts: [],
      lists: [],
      entries: detail.supportData
        .map((entry, index) => ({
          title:
            sanitizeText(entry.supportedCharactersText) ??
            `Support ${index + 1}`,
          rows: [],
          texts: [],
          lists: entry.levelDescriptions.length
            ? [createList("fields.levels", entry.levelDescriptions)]
            : [],
          chips: [],
        }))
        .filter((entry) => entry.title || entry.lists.length),
      chips: [],
    });
  }

  if (detail.builderAbilities.length || detail.partyConflictKeys.length) {
    cards.push({
      titleKey: "sections.teamSynergy",
      rows: [],
      texts: [],
      lists: detail.partyConflictKeys.length
        ? [
            createList(
              "fields.conflicts",
              detail.partyConflictKeys.map((value) => humanizeValue(value)),
            ),
          ]
        : [],
      entries: detail.builderAbilities.map((ability) => ({
        title: ability.label,
        rows: [
          createRow("fields.source", humanizeValue(ability.source)),
          createRow("fields.completeRemoval", ability.isCompleteRemoval ? "Yes" : "No"),
          ...(ability.minTurns !== null
            ? [createRow("fields.turns", formatNumber(ability.minTurns))]
            : []),
          ...(ability.slotTokens.length
            ? [createRow("fields.slots", ability.slotTokens.map((token) => humanizeValue(token)).join(", "))]
            : []),
          ...(ability.coverageMode
            ? [createRow("fields.coverage", humanizeValue(ability.coverageMode))]
            : []),
        ],
        texts: [],
        lists: [],
        chips: [],
      })),
      chips: [],
    });
  }

  return cards.length
    ? {
        titleKey: "sections.supportSynergy",
        cards,
      }
    : null;
}

function buildBattleModesGroup(
  character: CharacterDetailRecord,
  basedOnCharacterName: string | null,
): DetailDisplayGroup | null {
  const { detail } = character;
  const cards: DetailDisplayCard[] = [];
  const rumbleCard = buildRumbleCardModel(detail.rumbleData, basedOnCharacterName);

  if (rumbleCard) {
    cards.push(rumbleCard);
  }

  [
    { titleKey: "sections.swapData", value: detail.swapData },
    { titleKey: "sections.vsSpecial", value: detail.vsSpecial },
    { titleKey: "sections.superType", value: detail.superType },
    { titleKey: "sections.superClass", value: detail.superClass },
  ].forEach(({ titleKey, value }) => {
    const card = buildStructuredCard(titleKey, value);

    if (card) {
      cards.push(card);
    }
  });

  return cards.length
    ? {
        titleKey: "sections.battleModes",
        cards,
      }
    : null;
}

function buildStructuredCard(
  titleKey: string,
  value: Record<string, unknown> | null,
): DetailDisplayCard | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const rows: DetailDisplayRow[] = [];
  const lists: DetailDisplayList[] = [];
  const entries: DetailDisplayEntry[] = [];

  Object.entries(value).forEach(([key, entryValue]) => {
    const label = humanizeKey(key);

    if (isScalar(entryValue)) {
      const formattedValue = formatScalar(entryValue);

      if (formattedValue) {
        rows.push(createRow(undefined, formattedValue, label));
      }

      return;
    }

    if (Array.isArray(entryValue) && entryValue.every((item) => isScalar(item))) {
      const items = entryValue
        .map((item) => formatScalar(item))
        .filter((item): item is string => Boolean(item));

      if (items.length) {
        lists.push(createList(undefined, items, label));
      }

      return;
    }

    entries.push(...buildStructuredEntries(label, entryValue));
  });

  if (!rows.length && !lists.length && !entries.length) {
    return null;
  }

  return {
    titleKey,
    rows,
    texts: [],
    lists,
    entries,
    chips: [],
  };
}

function buildStructuredEntries(
  title: string,
  value: unknown,
  titleKey?: string,
): DetailDisplayEntry[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    if (value.every((item) => isScalar(item))) {
      const items = value
        .map((item) => formatScalar(item))
        .filter((item): item is string => Boolean(item));

      return items.length
        ? [
            {
              title,
              titleKey,
              rows: [],
              texts: [],
              lists: [createList(undefined, items)],
              chips: [],
            },
          ]
        : [];
    }

    return value.flatMap((item, index) => buildStructuredEntries(`${title} ${index + 1}`, item));
  }

  if (!isRecord(value)) {
    const formattedValue = formatScalar(value);

    return formattedValue
      ? [
          {
            title,
            titleKey,
            rows: [createRow(undefined, formattedValue, humanizeKey(title))],
            texts: [],
            lists: [],
            chips: [],
          },
        ]
      : [];
  }

  const rows: DetailDisplayRow[] = [];
  const lists: DetailDisplayList[] = [];

  flattenStructuredValue(value, rows, lists);

  return rows.length || lists.length
    ? [
        {
          title,
          titleKey,
          rows,
          texts: [],
          lists,
          chips: [],
        },
      ]
    : [];
}

function flattenStructuredValue(
  value: UnknownRecord,
  rows: DetailDisplayRow[],
  lists: DetailDisplayList[],
  prefix = "",
): void {
  Object.entries(value).forEach(([key, entryValue]) => {
    const nextLabel = prefix ? `${prefix} ${humanizeKey(key)}` : humanizeKey(key);

    if (entryValue === null || entryValue === undefined) {
      return;
    }

    if (isScalar(entryValue)) {
      const formattedValue = formatScalar(entryValue);

      if (formattedValue) {
        rows.push(createRow(undefined, formattedValue, nextLabel));
      }

      return;
    }

    if (Array.isArray(entryValue)) {
      if (entryValue.every((item) => isScalar(item))) {
        const items = entryValue
          .map((item) => formatScalar(item))
          .filter((item): item is string => Boolean(item));

        if (items.length) {
          lists.push(createList(undefined, items, nextLabel));
        }

        return;
      }

      const summarizedItems = entryValue
        .map((item) => summarizeUnknownValue(item))
        .filter((item): item is string => Boolean(item));

      if (summarizedItems.length) {
        lists.push(createList(undefined, summarizedItems, nextLabel));
      }

      return;
    }

    if (isRecord(entryValue)) {
      flattenStructuredValue(entryValue, rows, lists, nextLabel);
    }
  });
}

function buildRumbleLevelEntry(
  titleKey: string,
  level: number,
  value: unknown,
): DetailDisplayEntry | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const rows: DetailDisplayRow[] = [];
  const lists: DetailDisplayList[] = [];

  if (record["cooldown"] !== undefined && record["cooldown"] !== null) {
    rows.push(createRow("fields.cooldown", formatScalar(record["cooldown"]) ?? ""));
  }

  const effects = Array.isArray(record["effects"])
    ? record["effects"]
        .map((effect) => formatRumbleEffect(effect))
        .filter((effect): effect is string => Boolean(effect))
    : [];

  if (effects.length) {
    lists.push(createList("fields.effects", effects));
  }

  Object.entries(record)
    .filter(([key]) => key !== "cooldown" && key !== "effects")
    .forEach(([key, entryValue]) => {
      if (isScalar(entryValue)) {
        const formattedValue = formatScalar(entryValue);

        if (formattedValue) {
          rows.push(createRow(undefined, formattedValue, humanizeKey(key)));
        }

        return;
      }

      if (Array.isArray(entryValue) && entryValue.every((item) => isScalar(item))) {
        const items = entryValue
          .map((item) => formatScalar(item))
          .filter((item): item is string => Boolean(item));

        if (items.length) {
          lists.push(createList(undefined, items, humanizeKey(key)));
        }

        return;
      }

      if (isRecord(entryValue)) {
        const nestedRows: DetailDisplayRow[] = [];
        const nestedLists: DetailDisplayList[] = [];

        flattenStructuredValue(entryValue, nestedRows, nestedLists, humanizeKey(key));
        rows.push(...nestedRows);
        lists.push(...nestedLists);
      }
    });

  if (!rows.length && !lists.length) {
    return null;
  }

  return {
    title: `${titleKey === "fields.passiveLevel" ? "Passive" : "Special"} Lv ${level}`,
    rows,
    texts: [],
    lists,
    chips: [],
  };
}

function formatRumblePatternStep(value: unknown): string | null {
  const record = asRecord(value);

  if (!record) {
    return formatScalar(value);
  }

  const parts = [
    sanitizeText(record["action"]),
    sanitizeText(record["type"]),
    sanitizeText(record["area"]),
    record["level"] !== undefined && record["level"] !== null
      ? `Lv ${formatScalar(record["level"])}`
      : null,
  ].filter((part): part is string => Boolean(part));

  const extras = Object.entries(record)
    .filter(([key]) => !["action", "type", "area", "level"].includes(key))
    .map(([key, entryValue]) => {
      const formattedValue = formatScalar(entryValue);

      return formattedValue ? `${humanizeKey(key)} ${formattedValue}` : null;
    })
    .filter((part): part is string => Boolean(part));

  const summary = [...parts, ...extras].join(" • ");

  return summary.length ? summary : null;
}

function formatRumbleTarget(value: unknown): string | null {
  const record = asRecord(value);

  if (!record) {
    return formatScalar(value);
  }

  const comparator = sanitizeText(record["comparator"]);
  const criteria = sanitizeText(record["criteria"]);
  const targetValue = [comparator, criteria, comparator || criteria ? "target" : null]
    .filter((part): part is string => Boolean(part))
    .join(" ");

  return targetValue.length ? targetValue : summarizeUnknownValue(record);
}

function formatRumbleEffect(value: unknown): string | null {
  const record = asRecord(value);

  if (!record) {
    return formatScalar(value);
  }

  const parts = [
    sanitizeText(record["effect"]),
    ...(Array.isArray(record["attributes"])
      ? [record["attributes"].map((attribute) => humanizeValue(attribute)).join(", ")]
      : []),
    record["level"] !== undefined && record["level"] !== null
      ? `Lv ${formatScalar(record["level"])}`
      : null,
    record["amount"] !== undefined && record["amount"] !== null
      ? `Amount ${formatScalar(record["amount"])}`
      : null,
    record["chance"] !== undefined && record["chance"] !== null
      ? `${formatScalar(record["chance"])}% chance`
      : null,
    record["duration"] !== undefined && record["duration"] !== null
      ? `${formatScalar(record["duration"])} duration`
      : null,
    sanitizeText(record["type"]),
    formatRumbleTargeting(record["targeting"]),
  ].filter((part): part is string => Boolean(part));

  return parts.length ? parts.join(" • ") : summarizeUnknownValue(record);
}

function formatRumbleTargeting(value: unknown): string | null {
  const record = asRecord(value);

  if (!record) {
    return formatScalar(value);
  }

  const count = formatScalar(record["count"]);
  const priority = sanitizeText(record["priority"]);
  const stat = sanitizeText(record["stat"]);
  const targets = Array.isArray(record["targets"])
    ? record["targets"]
        .map((target) => sanitizeText(target))
        .filter((target): target is string => Boolean(target))
    : [];

  const normalizedTargets = targets.map((target) =>
    count === "1" ? singularizeTarget(target) : target,
  );

  const segments = [
    count,
    priority,
    stat,
    normalizedTargets.length ? normalizedTargets.join(", ") : null,
  ].filter((part): part is string => Boolean(part));

  return segments.length ? segments.join(" ") : summarizeUnknownValue(record);
}

function summarizeUnknownValue(value: unknown): string | null {
  if (isScalar(value)) {
    return formatScalar(value);
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => summarizeUnknownValue(item))
      .filter((item): item is string => Boolean(item));

    return items.length ? items.join(" • ") : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const items = Object.entries(value)
    .map(([key, entryValue]) => {
      const formattedValue = summarizeUnknownValue(entryValue);

      return formattedValue ? `${humanizeKey(key)}: ${formattedValue}` : null;
    })
    .filter((item): item is string => Boolean(item));

  return items.length ? items.join(" • ") : null;
}

function createRow(labelKey: string | undefined, value: string, label?: string): DetailDisplayRow {
  return labelKey ? { labelKey, value } : { label, value };
}

function createText(
  labelKey: string | undefined,
  value: string,
  tone: "default" | "muted" = "default",
  label?: string,
): DetailDisplayText {
  return labelKey ? { labelKey, value, tone } : { label, value, tone };
}

function createList(labelKey: string | undefined, items: string[], label?: string): DetailDisplayList {
  return labelKey ? { labelKey, items } : { label, items };
}

function formatNumber(value: unknown): string {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue.toLocaleString("en-US") : String(value ?? "");
}

function formatScalar(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toLocaleString("en-US") : null;
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  const sanitized = sanitizeText(value);

  return sanitized?.length ? sanitized : null;
}

function sanitizeText(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.replace(/\s+/g, " ").trim();

    return normalized.length ? normalized : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function humanizeKey(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => {
      if (part.toUpperCase() === part && part.length <= 4) {
        return part;
      }

      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function humanizeValue(value: unknown): string {
  if (typeof value !== "string") {
    return formatScalar(value) ?? "";
  }

  return humanizeKey(value);
}

function formatRumbleStatLabel(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (normalized === "def") {
    return "DEF";
  }

  if (normalized === "spd") {
    return "SPD";
  }

  return humanizeKey(value);
}

function singularizeTarget(value: string): string {
  const normalized = value.toLowerCase();

  if (normalized === "enemies") {
    return "enemy";
  }

  if (normalized === "allies") {
    return "ally";
  }

  return value;
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}
