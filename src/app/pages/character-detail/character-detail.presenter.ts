import { type NormalizedBuilderAbility } from '../../core/models/auto-team-builder-ability.models';
import {
  type CaptainCoverageTierKind,
  type CharacterDetailRecord,
} from '../../core/models/optc.models';
import {
  buildCaptainCoverageTierView,
  type CaptainCoverageTierScopeToken,
} from '../../core/services/captain-coverage-tier-view.utils';
import { formatBoolean, formattingLanguage } from '../../core/i18n/app-locale-format';
import { normalizeHtmlToText } from '../../core/services/html-text.utils';
import { readGrandPartyConditions } from './grand-party-condition.utils';
import {
  readSupportAutoPlus,
  type SupportAutoPlusReading,
  type SupportAutoPlusTrigger,
} from './support-auto-plus.utils';

type DisplayLabel = {
  label?: string;
  labelKey?: string;
};

interface DetailDisplayRow extends DisplayLabel {
  value: string;
}

interface DetailDisplayText extends DisplayLabel {
  value: string;
  tone?: 'default' | 'muted';
}

interface DetailDisplayList extends DisplayLabel {
  items: string[];
}

/** A piece of a sentence: a key in this page's scope, translated where it is shown, or text as it is. */
export type DetailDisplayToken =
  | { key: string; params?: Record<string, string>; text?: undefined }
  | { text: string; key?: undefined; params?: undefined };

/**
 * 869f63gz3 / 869f63gz7. A sentence the app writes in the reader's language - an Auto+ instruction,
 * a Grand Party Burst Condition - with an optional label before it ("Auto+: ...").
 */
export interface DetailDisplayLine {
  labelKey?: string;
  tokens: DetailDisplayToken[];
}

interface DetailDisplayEntry {
  title?: string;
  titleKey?: string;
  rows: DetailDisplayRow[];
  texts: DetailDisplayText[];
  lists: DetailDisplayList[];
  chips: string[];
  lines?: DetailDisplayLine[];
}

export interface DetailDisplayCard extends DetailDisplayEntry {
  entries: DetailDisplayEntry[];
}

interface DetailDisplayGroup {
  titleKey: string;
  cards: DetailDisplayCard[];
}

interface CharacterDetailCaptainAbilitySummary {
  coverageEntries: CharacterDetailCaptainCoverageEntry[];
  captainNotes: string | null;
  recognizedAbilities: NormalizedBuilderAbility[];
  characterTags: string[];
  /**
   * Union of all distinct Field Territory values across all tiers in all coverage entries.
   * Surfaces as a prominent badge near the raw captain ability so the user immediately sees
   * the field requirement (e.g. "Territory: [QCK]") without scrolling to the tier breakdown.
   */
  fieldTerritories: string[];
}

interface CharacterDetailCaptainCoverageEntry {
  label?: string;
  text: string;
  tiers: CharacterDetailCaptainCoverageTier[];
}

interface CharacterDetailCaptainCoverageTier {
  tier: number;
  kind: CaptainCoverageTierKind;
  scopeLabel: string;
  scopeLabelTokens: CaptainCoverageTierScopeToken[];
  conditionLines: string[];
  /** The same lines, in pieces, so a template can translate the structural parts. */
  conditionLineTokens: CaptainCoverageTierScopeToken[][];
  effectClauses: string[];
  baselineEffectClauses?: string[];
  conditionalEffectClauses?: string[];
  atkBoost?: number;
  hpBoost?: number;
}

export interface CharacterDetailViewModel {
  heroMeta: DetailDisplayRow[];
  heroStats: DetailDisplayRow[];
  captainAbilitySummary: CharacterDetailCaptainAbilitySummary | null;
  groups: DetailDisplayGroup[];
}

type UnknownRecord = Record<string, unknown>;

const RUMBLE_KNOWN_KEYS = new Set([
  'ability',
  'basedOn',
  'cost',
  'gpability',
  'gpcondition',
  'gpspecial',
  'id',
  'llbability',
  'llbresilience',
  'llbspecial',
  'pattern',
  'resilience',
  'special',
  'stats',
  'target',
]);

const RUMBLE_LEVELED_SECTION_CONFIGS = [
  { key: 'ability', title: 'Passive' },
  { key: 'special', title: 'Special' },
  { key: 'llbability', title: 'LLB Passive' },
  { key: 'llbspecial', title: 'LLB Special' },
] as const;

export function buildCharacterDetailViewModel(
  character: CharacterDetailRecord,
  basedOnCharacterName: string | null = null,
): CharacterDetailViewModel {
  const groups: DetailDisplayGroup[] = [
    buildAbilitiesGroup(character),
    buildEnhancementsGroup(character),
    buildSupportGroup(character),
    buildBattleModesGroup(character, basedOnCharacterName),
  ].filter((group): group is DetailDisplayGroup => group !== null);

  const starsDisplay = formatStars(character);

  return {
    heroMeta: [
      createRow('fields.type', formatCharacterType(character.type)),
      createRow('fields.primaryClass', character.primaryClass),
      ...(character.secondaryClass
        ? [createRow('fields.secondaryClass', character.secondaryClass)]
        : []),
      /*
       * 869f63gv6. A dual or VS unit's forms, each with the type and classes it has after a swap -
       * the classes the class filters and Captain Coverage now count for it, marked there.
       */
      ...(character.forms ?? []).map((form) =>
        createRow(
          'fields.form',
          [form.name, formatCharacterType(form.type), form.classes.join(' / ')]
            .filter((part) => part.length > 0)
            .join(' · '),
        ),
      ),
      createRow('fields.stars', starsDisplay),
      createRow('fields.cost', formatNumber(character.cost)),
    ],
    heroStats: [
      ...createOptionalNumberRow('stats.maxHp', character.stats.max.hp),
      ...createOptionalNumberRow('stats.maxAtk', character.stats.max.atk),
      ...createOptionalNumberRow('stats.maxRcv', character.stats.max.rcv),
    ],
    captainAbilitySummary: buildCaptainAbilitySummary(character),
    groups,
  };
}

export function buildRumbleCardModel(
  rumbleData: Record<string, unknown> | null,
  basedOnCharacterName: string | null = null,
): DetailDisplayCard | null {
  if (!rumbleData || typeof rumbleData !== 'object' || Array.isArray(rumbleData)) {
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
        'fields.inheritsFrom',
        basedOnCharacterName?.trim().length
          ? basedOnCharacterName.trim()
          : `Character #${basedOnId}`,
      ),
    );
  }

  const stats = asRecord(rumbleData['stats']);

  if (stats) {
    Object.entries(stats).forEach(([key, value]) => {
      const formattedValue = formatScalar(value);

      if (formattedValue) {
        rows.push(createRow(undefined, formattedValue, formatRumbleStatLabel(key)));
      }
    });
  }

  const targetSummary = formatRumbleTarget(rumbleData['target']);

  if (targetSummary) {
    rows.push(createRow('fields.target', targetSummary));
  }

  const pattern = Array.isArray(rumbleData['pattern'])
    ? rumbleData['pattern']
        .map((step) => formatRumblePatternStep(step))
        .filter((step): step is string => Boolean(step))
    : [];

  if (pattern.length) {
    lists.push(createList('fields.pattern', pattern));
  }

  const leveledEntries = RUMBLE_LEVELED_SECTION_CONFIGS.flatMap(({ key, title }) =>
    buildRumbleMaxSectionEntry(title, rumbleData[key]),
  );
  const staticEntries = [
    ...buildRumbleStaticSectionEntries('Resilience', rumbleData['resilience']),
    ...buildRumbleStaticSectionEntries('LLB Resilience', rumbleData['llbresilience']),
  ];

  // The three Grand Party fields are their own card - `buildGrandPartyCardModel`.
  const extraEntries = Object.entries(rumbleData)
    .filter(([key]) => !RUMBLE_KNOWN_KEYS.has(key))
    .flatMap(([key, value]) => buildStructuredEntries(humanizeKey(key), value));

  entries.push(...leveledEntries, ...staticEntries, ...extraEntries);

  if (!rows.length && !texts.length && !lists.length && !entries.length) {
    return null;
  }

  return {
    titleKey: 'sections.rumbleData',
    rows,
    texts,
    lists,
    entries,
    chips: [],
  };
}

/**
 * 869f63gz7. Grand Party: three Rumble teams under one GP Leader, whose Leader Skill buffs the crew
 * and whose Burst fires once its condition is met - most often after two crew members are defeated.
 *
 * Its three fields used to sit inside the Rumble card under hard-coded English titles, with the Burst
 * Condition printed as raw `Count` / `Type` / `Team` rows. They are their own card now, titled the
 * way upstream labels them (Leader Skill, Burst, Burst Condition), with the condition in words in
 * the reader's language (`grand-party-condition.utils.ts`). The effects themselves read as the Rumble
 * card's do.
 */
export function buildGrandPartyCardModel(
  rumbleData: Record<string, unknown> | null,
): DetailDisplayCard | null {
  if (!isRecord(rumbleData)) {
    return null;
  }

  const conditionLines = buildGrandPartyConditionLines(rumbleData['gpcondition']);
  const entries: DetailDisplayEntry[] = [
    ...buildRumbleMaxSectionEntry('Leader Skill', rumbleData['gpability'], 'grandParty.leaderSkill'),
    ...buildRumbleMaxSectionEntry('Burst', rumbleData['gpspecial'], 'grandParty.burst'),
    ...(conditionLines.length
      ? [
          {
            titleKey: 'grandParty.burstCondition',
            rows: [],
            texts: [],
            lists: [],
            chips: [],
            lines: conditionLines,
          },
        ]
      : []),
  ];

  return entries.length
    ? {
        titleKey: 'sections.grandParty',
        rows: [],
        texts: [],
        lists: [],
        entries,
        chips: [],
      }
    : null;
}

/**
 * One line per condition, in words. A shape the formatter does not know is shown as readable
 * `Key: value` text rather than dropped - the same fallback every other Rumble field uses.
 */
function buildGrandPartyConditionLines(value: unknown): DetailDisplayLine[] {
  return readGrandPartyConditions(value).flatMap((reading): DetailDisplayLine[] => {
    if (reading.key === null) {
      const text = summarizeUnknownValue(reading.value);

      return text ? [{ tokens: [{ text }] }] : [];
    }

    return [
      {
        tokens: [
          {
            key: `grandParty.condition.${reading.key}`,
            params: { ...reading.names, count: formatNumber(reading.count) },
          },
        ],
      },
    ];
  });
}

export function resolveRumbleBasedOnId(rumbleData: Record<string, unknown> | null): number | null {
  if (!rumbleData || typeof rumbleData !== 'object' || Array.isArray(rumbleData)) {
    return null;
  }

  const basedOnValue = rumbleData['basedOn'];
  const basedOnId = Number(basedOnValue);

  return Number.isInteger(basedOnId) && basedOnId > 0 ? basedOnId : null;
}

function buildCaptainAbilitySummary(
  character: CharacterDetailRecord,
): CharacterDetailCaptainAbilitySummary | null {
  const { detail } = character;
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
  const generatedCoverageByKey = new Map(
    (detail.captainAbilityCoverage?.entries ?? []).map((entry) => [entry.key, entry] as const),
  );
  const coverageEntries = captainAbilityVariants
    .map((entry) => {
      const text = entry.text.trim();
      const generatedCoverage = generatedCoverageByKey.get(entry.key);
      const tiers = generatedCoverage?.tiers
        ? generatedCoverage.tiers.map(buildCaptainCoverageTierView)
        : [];

      return {
        label: entry.label,
        text,
        tiers,
      };
    })
    .filter((entry) => entry.text.length || entry.tiers.length);
  const captainNotes = detail.captainNotes?.trim() || null;
  const recognizedAbilities = detail.builderAbilities.filter(
    (ability) => ability.source === 'captainAbility',
  );
  const characterTags = (detail.characterTags ?? []).filter((tag) => tag.trim().length > 0);
  const fieldTerritories = [
    ...new Set(
      (detail.captainAbilityCoverage?.entries ?? []).flatMap((entry) =>
        (entry.tiers ?? []).flatMap((tier) =>
          (tier.fieldConditions ?? []).flatMap((condition) => condition.territories ?? []),
        ),
      ),
    ),
  ];

  return coverageEntries.length ||
    captainNotes ||
    recognizedAbilities.length ||
    characterTags.length ||
    fieldTerritories.length
    ? {
        coverageEntries,
        captainNotes,
        recognizedAbilities,
        characterTags,
        fieldTerritories,
      }
    : null;
}

function buildAbilitiesGroup(character: CharacterDetailRecord): DetailDisplayGroup | null {
  const { detail } = character;
  const cards: DetailDisplayCard[] = [];

  if (detail.specialName || detail.specialText || detail.specialNotes) {
    cards.push({
      titleKey: 'sections.special',
      rows: [],
      texts: [
        ...(detail.specialName ? [createText('fields.specialName', detail.specialName)] : []),
        ...(detail.specialText ? [createText('fields.specialEffect', detail.specialText)] : []),
        ...(detail.specialNotes
          ? [createText('fields.specialNotes', detail.specialNotes, 'muted')]
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
      titleKey: 'sections.superSpecial',
      rows: [],
      texts: [
        ...(detail.superSpecialText
          ? [createText('fields.superSpecialEffect', detail.superSpecialText)]
          : []),
        ...(detail.superSpecialCriteriaText
          ? [createText('superSpecial.criteriaLabel', detail.superSpecialCriteriaText)]
          : []),
        ...(detail.superSpecialNotes
          ? [createText('superSpecial.notesLabel', detail.superSpecialNotes, 'muted')]
          : []),
      ],
      lists: [],
      entries: detail.superSpecialCriteria
        ? buildStructuredEntries(
            'Parsed Criteria',
            detail.superSpecialCriteria,
            'fields.parsedCriteria',
          )
        : [],
      chips: [],
    });
  }

  if (detail.sailorAbilities.length || detail.sailorNotes) {
    cards.push({
      titleKey: 'sections.sailorAbilities',
      rows: [],
      texts: detail.sailorNotes
        ? [createText('fields.sailorNotes', detail.sailorNotes, 'muted')]
        : [],
      lists: detail.sailorAbilities.length ? [createList(undefined, detail.sailorAbilities)] : [],
      entries: [],
      chips: [],
    });
  }

  return cards.length
    ? {
        titleKey: 'sections.abilities',
        cards,
      }
    : null;
}

function buildEnhancementsGroup(character: CharacterDetailRecord): DetailDisplayGroup | null {
  const { detail } = character;
  const cards: DetailDisplayCard[] = [];

  if (detail.potentialAbilities.length) {
    cards.push({
      titleKey: 'sections.potentialAbilities',
      rows: [],
      texts: [],
      lists: [],
      entries: detail.potentialAbilities
        .map((entry, index) => ({
          title: sanitizeText(entry.Name) ?? `Potential ${index + 1}`,
          rows: [],
          texts: [],
          lists:
            Array.isArray(entry.description) && entry.description.length
              ? [
                  createList(
                    undefined,
                    entry.description.map((item) => sanitizeText(item)).filter(Boolean) as string[],
                  ),
                ]
              : [],
          chips: [],
        }))
        .filter((entry) => entry.title || entry.lists.length),
      chips: [],
    });
  }

  return cards.length
    ? {
        titleKey: 'sections.enhancements',
        cards,
      }
    : null;
}

function buildSupportGroup(character: CharacterDetailRecord): DetailDisplayGroup | null {
  const { detail } = character;
  const cards: DetailDisplayCard[] = [];

  if (detail.supportData.length) {
    cards.push({
      titleKey: 'sections.supportData',
      rows: [],
      texts: [],
      lists: [],
      entries: detail.supportData
        .map((entry, index) => {
          /*
           * 869f63gz3. The dataset writes support text as HTML: on the shipped seed of 2026-09-25,
           * 40 texts carried a `<b>[AUTO+]</b>` that interpolation printed as it is. This is the
           * normaliser the captain text goes through; measured then, it changed those 40 and no
           * other support text.
           */
          const supportedCharacters = normalizeHtmlToText(entry.supportedCharactersText);
          const levelDescriptions = entry.levelDescriptions
            .map((description) => normalizeHtmlToText(description))
            .filter((description) => description.length > 0);
          const autoPlusLines = entry.levelDescriptions.flatMap((description) =>
            readSupportAutoPlus(description).flatMap((reading) => buildAutoPlusLines(reading)),
          );

          return {
            title: `Support ${index + 1}`,
            rows: supportedCharacters
              ? [createRow('support.supportedCharactersLabel', supportedCharacters)]
              : [],
            texts: [],
            lists: levelDescriptions.length
              ? [createList('support.maxLevelEffect', levelDescriptions)]
              : [],
            chips: [],
            ...(autoPlusLines.length ? { lines: autoPlusLines } : {}),
          };
        })
        .filter((entry) => entry.title || entry.lists.length),
      chips: [],
    });
  }

  return cards.length
    ? {
        titleKey: 'sections.supportData',
        cards,
      }
    : null;
}

/**
 * 869f63gz3. One Auto+ instruction in the reader's language: "Auto+: at stage 3, fires the
 * supported character's Special by itself". One line per effect, so no sentence has to join two
 * effect names in a way only English word order allows. A sentence the parser does not recognise is
 * shown as the dataset wrote it.
 */
function buildAutoPlusLines(reading: SupportAutoPlusReading): DetailDisplayLine[] {
  const labelKey = 'support.autoPlus.label';

  if (reading.kind === 'unrecognised') {
    return [{ labelKey, tokens: [{ text: reading.source }] }];
  }

  const triggerTokens = buildAutoPlusTriggerTokens(reading.triggers, reading.join);
  const effectKey =
    reading.kind === 'fires' ? 'support.autoPlus.fires' : 'support.autoPlus.neverFires';

  return reading.effects.map((effect) => ({
    labelKey,
    tokens: [
      ...triggerTokens,
      ...(triggerTokens.length ? [{ text: ', ' }] : []),
      { key: effectKey, params: { effect } },
    ],
  }));
}

function buildAutoPlusTriggerTokens(
  triggers: readonly SupportAutoPlusTrigger[],
  join: 'any' | 'all' | null,
): DetailDisplayToken[] {
  const or: DetailDisplayToken[] = [{ text: ' ' }, { key: 'support.autoPlus.or' }, { text: ' ' }];
  // Triggers that must hold together read best with the stage first: "at the final stage, when an
  // enemy applies Territory". The order carries no meaning when all of them are required.
  const ordered =
    join === 'all'
      ? [...triggers].sort((left, right) => Number(isStageTrigger(right)) - Number(isStageTrigger(left)))
      : triggers;

  return ordered.flatMap((trigger, index) => [
    ...(index === 0 ? [] : join === 'all' ? [{ text: ', ' }] : or),
    ...buildAutoPlusTriggerToken(trigger, or),
  ]);
}

function isStageTrigger(trigger: SupportAutoPlusTrigger): boolean {
  return trigger.kind === 'stage' || trigger.kind === 'final-stage';
}

function buildAutoPlusTriggerToken(
  trigger: SupportAutoPlusTrigger,
  or: DetailDisplayToken[],
): DetailDisplayToken[] {
  switch (trigger.kind) {
    case 'stage':
      return [{ key: 'support.autoPlus.stage', params: { stage: String(trigger.stage) } }];
    case 'final-stage':
      return [{ key: 'support.autoPlus.finalStage' }];
    case 'enemy-barrier':
      return [{ key: 'support.autoPlus.enemyBarrier' }];
    case 'enemy-inflicts': {
      // The key ends on `{{status}}` in both languages, so any further status follows it directly.
      const [first = '', ...rest] = trigger.statuses;

      return [
        { key: 'support.autoPlus.enemyInflicts', params: { status: first } },
        ...rest.flatMap((status) => [...or, { text: status }]),
      ];
    }
    case 'enemy-applies':
      return [{ key: 'support.autoPlus.enemyApplies', params: { status: trigger.status } }];
  }
}

function buildBattleModesGroup(
  character: CharacterDetailRecord,
  basedOnCharacterName: string | null,
): DetailDisplayGroup | null {
  const { detail } = character;
  const cards: DetailDisplayCard[] = [];
  const rumbleCard = buildRumbleCardModel(detail.rumbleData, basedOnCharacterName);
  const grandPartyCard = buildGrandPartyCardModel(detail.rumbleData);
  const superTandemCard = buildLeveledBattleModeCard(
    'sections.superTandemData',
    detail.superTandemData ?? null,
  );
  const finalTapCard = buildFinalTapCard(detail.finalTapData ?? null);
  const rushSugoSpecialCard = buildLeveledBattleModeCard(
    'sections.rushSugoSpecialData',
    detail.rushSugoSpecialData ?? null,
  );

  if (rumbleCard) {
    cards.push(rumbleCard);
  }

  if (grandPartyCard) {
    cards.push(grandPartyCard);
  }

  if (superTandemCard) {
    cards.push(superTandemCard);
  }

  if (finalTapCard) {
    cards.push(finalTapCard);
  }

  if (rushSugoSpecialCard) {
    cards.push(rushSugoSpecialCard);
  }

  [
    { titleKey: 'sections.swapData', value: detail.swapData },
    { titleKey: 'sections.vsSpecial', value: detail.vsSpecial },
    { titleKey: 'sections.exSuperData', value: detail.exSuperData ?? null },
    { titleKey: 'sections.superType', value: detail.superType },
    { titleKey: 'sections.superClass', value: detail.superClass },
    { titleKey: 'sections.switchEffectData', value: detail.switchEffectData ?? null },
    { titleKey: 'sections.captainShiftData', value: detail.captainShiftData ?? null },
  ].forEach(({ titleKey, value }) => {
    const card = buildStructuredCard(titleKey, value);

    if (card) {
      cards.push(card);
    }
  });

  return cards.length
    ? {
        titleKey: 'sections.battleModes',
        cards,
      }
    : null;
}

function buildFinalTapCard(finalTapData: Record<string, unknown> | null): DetailDisplayCard | null {
  return buildLeveledBattleModeCard('sections.finalTapData', finalTapData);
}

function buildLeveledBattleModeCard(
  titleKey: string,
  value: Record<string, unknown> | null,
): DetailDisplayCard | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const requirement = sanitizeText(record['requirement']);
  const levelEntries = Array.isArray(record['levels'])
    ? record['levels']
        .map((level, index) => buildFinalTapLevelEntry(level, index))
        .filter((entry): entry is DetailDisplayEntry => entry !== null)
    : [];
  const criteriaEntries = record['criteria']
    ? buildStructuredEntries('Parsed Criteria', record['criteria'], 'fields.parsedCriteria')
    : [];
  const entries = [...levelEntries, ...criteriaEntries];

  if (!requirement && !entries.length) {
    return null;
  }

  return {
    titleKey,
    rows: requirement ? [createRow('fields.requirement', requirement)] : [],
    texts: [],
    lists: [],
    entries,
    chips: [],
  };
}

function buildStructuredCard(
  titleKey: string,
  // A plain-text Captain Shift (`swapData`, 90 units) has no structure to lay out, and renders
  // no card - the same as before the model admitted the string.
  value: Record<string, unknown> | string | null,
): DetailDisplayCard | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
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

function buildFinalTapLevelEntry(value: unknown, index: number): DetailDisplayEntry | null {
  const record = asRecord(value);

  if (!record) {
    const effect = formatScalar(value);

    return effect
      ? {
          title: `Lv ${index + 1}`,
          rows: [],
          texts: [createText('fields.effect', effect)],
          lists: [],
          chips: [],
        }
      : null;
  }

  const rawLevel = Number(record['level']);
  const title =
    sanitizeText(record['label']) ?? `Lv ${Number.isFinite(rawLevel) ? rawLevel : index + 1}`;
  const effect = sanitizeText(record['effect']);
  const rows: DetailDisplayRow[] = [];
  const texts: DetailDisplayText[] = effect ? [createText('fields.effect', effect)] : [];
  const lists: DetailDisplayList[] = [];

  Object.entries(record)
    .filter(([key]) => !['level', 'label', 'effect'].includes(key))
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
      }
    });

  return rows.length || texts.length || lists.length
    ? {
        title,
        rows,
        texts,
        lists,
        chips: [],
      }
    : null;
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
  prefix = '',
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

function buildRumbleMaxSectionEntry(
  title: string,
  value: unknown,
  titleKey?: string,
): DetailDisplayEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const maxEntry = [...value].reverse().find((entry) => buildRumbleLevelEntry(title, entry));
  const builtEntry = buildRumbleLevelEntry(title, maxEntry, titleKey);

  return builtEntry ? [builtEntry] : [];
}

function buildRumbleStaticSectionEntries(title: string, value: unknown): DetailDisplayEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items = value
    .map((entry) => formatRumbleStaticEntry(entry))
    .filter((entry): entry is string => Boolean(entry));

  return items.length
    ? [
        {
          title,
          rows: [],
          texts: [],
          lists: [createList(undefined, items)],
          chips: [],
        },
      ]
    : [];
}

function buildRumbleLevelEntry(
  title: string,
  value: unknown,
  titleKey?: string,
): DetailDisplayEntry | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const rows: DetailDisplayRow[] = [];
  const lists: DetailDisplayList[] = [];

  if (record['cooldown'] !== undefined && record['cooldown'] !== null) {
    rows.push(createRow('fields.cooldown', formatScalar(record['cooldown']) ?? ''));
  }

  // 869f63gz7. How many times a Grand Party Burst can be used - its one scalar besides the effects.
  if (record['uses'] !== undefined && record['uses'] !== null) {
    rows.push(createRow('fields.uses', formatScalar(record['uses']) ?? ''));
  }

  const effects = Array.isArray(record['effects'])
    ? record['effects']
        .map((effect) => formatRumbleEffect(effect))
        .filter((effect): effect is string => Boolean(effect))
    : [];

  if (effects.length) {
    lists.push(createList('fields.effects', effects));
  }

  Object.entries(record)
    .filter(([key]) => key !== 'cooldown' && key !== 'uses' && key !== 'effects')
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
    ...(titleKey ? { titleKey } : { title }),
    rows,
    texts: [],
    lists,
    chips: [],
  };
}

function formatRumbleStaticEntry(value: unknown): string | null {
  const record = asRecord(value);

  if (!record) {
    return formatScalar(value);
  }

  const parts = [
    sanitizeText(record['type']),
    sanitizeText(record['attribute']),
    record['chance'] !== undefined && record['chance'] !== null
      ? `${formatScalar(record['chance'])}% chance`
      : null,
    record['percentage'] !== undefined && record['percentage'] !== null
      ? `${formatScalar(record['percentage'])}%`
      : null,
    record['amount'] !== undefined && record['amount'] !== null
      ? `Amount ${formatScalar(record['amount'])}`
      : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length ? parts.join(' • ') : summarizeUnknownValue(record);
}

function formatRumblePatternStep(value: unknown): string | null {
  const record = asRecord(value);

  if (!record) {
    return formatScalar(value);
  }

  const parts = [
    sanitizeText(record['action']),
    sanitizeText(record['type']),
    sanitizeText(record['area']),
    record['level'] !== undefined && record['level'] !== null
      ? `Lv ${formatScalar(record['level'])}`
      : null,
  ].filter((part): part is string => Boolean(part));

  const extras = Object.entries(record)
    .filter(([key]) => !['action', 'type', 'area', 'level'].includes(key))
    .map(([key, entryValue]) => {
      const formattedValue = formatScalar(entryValue);

      return formattedValue ? `${humanizeKey(key)} ${formattedValue}` : null;
    })
    .filter((part): part is string => Boolean(part));

  const summary = [...parts, ...extras].join(' • ');

  return summary.length ? summary : null;
}

function formatRumbleTarget(value: unknown): string | null {
  const record = asRecord(value);

  if (!record) {
    return formatScalar(value);
  }

  const comparator = sanitizeText(record['comparator']);
  const criteria = sanitizeText(record['criteria']);
  const targetValue = [comparator, criteria, comparator || criteria ? 'target' : null]
    .filter((part): part is string => Boolean(part))
    .join(' ');

  return targetValue.length ? targetValue : summarizeUnknownValue(record);
}

function formatRumbleEffect(value: unknown): string | null {
  const record = asRecord(value);

  if (!record) {
    return formatScalar(value);
  }

  const parts = [
    sanitizeText(record['effect']),
    ...(Array.isArray(record['attributes'])
      ? [record['attributes'].map((attribute) => humanizeValue(attribute)).join(', ')]
      : []),
    record['level'] !== undefined && record['level'] !== null
      ? `Lv ${formatScalar(record['level'])}`
      : null,
    record['amount'] !== undefined && record['amount'] !== null
      ? `Amount ${formatScalar(record['amount'])}`
      : null,
    record['chance'] !== undefined && record['chance'] !== null
      ? `${formatScalar(record['chance'])}% chance`
      : null,
    record['duration'] !== undefined && record['duration'] !== null
      ? `${formatScalar(record['duration'])} duration`
      : null,
    sanitizeText(record['type']),
    formatRumbleTargeting(record['targeting']),
  ].filter((part): part is string => Boolean(part));

  return parts.length ? parts.join(' • ') : summarizeUnknownValue(record);
}

function formatRumbleTargeting(value: unknown): string | null {
  const record = asRecord(value);

  if (!record) {
    return formatScalar(value);
  }

  const count = formatScalar(record['count']);
  const priority = sanitizeText(record['priority']);
  const stat = sanitizeText(record['stat']);
  const targets = Array.isArray(record['targets'])
    ? record['targets']
        .map((target) => sanitizeText(target))
        .filter((target): target is string => Boolean(target))
    : [];

  const normalizedTargets = targets.map((target) =>
    count === '1' ? singularizeTarget(target) : target,
  );

  const segments = [
    count,
    priority,
    stat,
    normalizedTargets.length ? normalizedTargets.join(', ') : null,
  ].filter((part): part is string => Boolean(part));

  return segments.length ? segments.join(' ') : summarizeUnknownValue(record);
}

function summarizeUnknownValue(value: unknown): string | null {
  if (isScalar(value)) {
    return formatScalar(value);
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => summarizeUnknownValue(item))
      .filter((item): item is string => Boolean(item));

    return items.length ? items.join(' • ') : null;
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

  return items.length ? items.join(' • ') : null;
}

function createRow(labelKey: string | undefined, value: string, label?: string): DetailDisplayRow {
  return labelKey ? { labelKey, value } : { label, value };
}

function createText(
  labelKey: string | undefined,
  value: string,
  tone: 'default' | 'muted' = 'default',
  label?: string,
): DetailDisplayText {
  return labelKey ? { labelKey, value, tone } : { label, value, tone };
}

function createList(
  labelKey: string | undefined,
  items: string[],
  label?: string,
): DetailDisplayList {
  return labelKey ? { labelKey, items } : { label, items };
}

function createOptionalNumberRow(labelKey: string, value: number | null): DetailDisplayRow[] {
  return value === null ? [] : [createRow(labelKey, formatNumber(value))];
}

function formatNumber(value: unknown): string {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue.toLocaleString(formattingLanguage()) : String(value ?? '');
}

function formatStars(character: Pick<CharacterDetailRecord, 'stars' | 'starsLabel'>): string {
  const starsLabel = character.starsLabel?.trim();

  return starsLabel?.length ? starsLabel : formatNumber(character.stars);
}

function formatCharacterType(value: string): string {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .join(' / ');
}

function formatScalar(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString(formattingLanguage()) : null;
  }

  if (typeof value === 'boolean') {
    return formatBoolean(value);
  }

  const sanitized = sanitizeText(value);

  return sanitized?.length ? sanitized : null;
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

function humanizeKey(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((part) => {
      if (part.toUpperCase() === part && part.length <= 4) {
        return part;
      }

      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

function humanizeValue(value: unknown): string {
  if (typeof value !== 'string') {
    return formatScalar(value) ?? '';
  }

  return humanizeKey(value);
}

function formatRumbleStatLabel(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (normalized === 'def') {
    return 'DEF';
  }

  if (normalized === 'spd') {
    return 'SPD';
  }

  return humanizeKey(value);
}

function singularizeTarget(value: string): string {
  const normalized = value.toLowerCase();

  if (normalized === 'enemies') {
    return 'enemy';
  }

  if (normalized === 'allies') {
    return 'ally';
  }

  return value;
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}
