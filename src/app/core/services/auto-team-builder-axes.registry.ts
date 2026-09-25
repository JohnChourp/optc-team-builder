import {
  type AutoBuildInput,
  type AutoBuildResult,
} from '../models/auto-team-builder.models';

/**
 * 869f127ec. The Auto Team Builder engine reasons in numbered axes - *"Axis 7, same shape as axes
 * 6, 9 and 10"* - and nothing listed them. There was no place that said how many exist, what each
 * reads, whether it can be relaxed, or what relaxing it means to the player. The numbering lived
 * only in one comment, so a new axis was added by imitation.
 *
 * This is that list. It is deliberately a MAPPING and not a rewrite: the engine's behaviour is
 * untouched by this file existing, which is why the whole suite is byte-for-byte identical with and
 * without it. The task asked for extraction, and a 1657-line engine plus a 6058-line utils module
 * is not a thing to restructure for tidiness.
 *
 * What it buys, immediately:
 *
 *  - a test asserts every relaxation the ENGINE can report has an entry here, so an eleventh axis
 *    cannot be added without appearing in the list;
 *  - a test asserts every entry's input field exists on `AutoBuildInput`, so an entry cannot name a
 *    field that was renamed away;
 *  - a test asserts every relaxable axis has a Final team report row, so a rule can no longer be
 *    relaxed without the report having anywhere to say so.
 *
 * The numbers are the ones the engine's own comment used, kept rather than renumbered: a reader who
 * finds that comment should land here and recognise it.
 */

/** Which part of the search an axis constrains. Used for grouping, never for behaviour. */
export type AutoTeamBuilderAxisFamily =
  /** Who may be in the team at all. */
  | 'candidatePool'
  /** What the two leader seats may be. */
  | 'leaderScope'
  /** What the leaders' own abilities must satisfy. */
  | 'leaderAbility';

export interface AutoTeamBuilderAxis {
  /** The number the engine's comments use. Stable; never renumbered when one is added. */
  readonly axis: number;
  readonly id: string;
  /** The `AutoBuildInput` field the reader sets. */
  readonly inputField: keyof AutoBuildInput;
  /** The `relaxation` fields the engine writes when this axis is conceded, if it can be. */
  readonly relaxationFields: readonly (keyof AutoBuildResult['relaxation'])[];
  readonly relaxable: boolean;
  readonly family: AutoTeamBuilderAxisFamily;
  /**
   * The Final team report row that speaks for this axis, or null when the axis has no row.
   * `report.rules.<key>.*` in `public/i18n/auto-team-builder/`.
   */
  readonly reportRowKey: string | null;
}

export const AUTO_TEAM_BUILDER_AXES: readonly AutoTeamBuilderAxis[] = [
  {
    axis: 1,
    id: 'selectedTypes',
    inputField: 'types',
    relaxationFields: ['droppedTypes'],
    relaxable: true,
    family: 'candidatePool',
    reportRowKey: 'types',
  },
  {
    axis: 2,
    id: 'selectedClasses',
    inputField: 'selectedClasses',
    relaxationFields: ['droppedClasses'],
    relaxable: true,
    family: 'candidatePool',
    reportRowKey: 'classes',
  },
  {
    axis: 3,
    id: 'selectedCharacterTags',
    inputField: 'selectedCharacterTags',
    relaxationFields: ['droppedCharacterTags'],
    relaxable: true,
    family: 'candidatePool',
    reportRowKey: 'characterTags',
  },
  {
    axis: 4,
    id: 'selectedCharacterNames',
    inputField: 'selectedCharacterNames',
    relaxationFields: ['droppedCharacterNames'],
    relaxable: true,
    family: 'candidatePool',
    reportRowKey: 'characterNames',
  },
  {
    axis: 5,
    id: 'leaderSuperEffectSlotCount',
    inputField: 'minimumLeaderSuperEffectMatchingSlots',
    relaxationFields: ['minimumLeaderSuperEffectMatchingSlots'],
    relaxable: true,
    family: 'leaderScope',
    reportRowKey: 'leaderSuperScope',
  },
  {
    axis: 6,
    id: 'leaderSuperEffectScope',
    inputField: 'requireAllSlotsInLeaderSuperEffectScope',
    relaxationFields: ['ignoredLeaderSuperEffectScope'],
    relaxable: true,
    family: 'leaderScope',
    reportRowKey: 'leaderSuperScope',
  },
  {
    axis: 7,
    id: 'captainAbilityCoverage',
    inputField: 'requireFullCaptainAbilityCoverage',
    relaxationFields: ['ignoredCaptainAbilityCoverage', 'downgradedCaptainAbilityCoverageToSimple'],
    relaxable: true,
    family: 'leaderAbility',
    reportRowKey: 'captainAbility',
  },
  {
    axis: 8,
    id: 'bothLeadersCaptainAbilityCoverage',
    inputField: 'requireBothLeadersFullCaptainAbilityCoverage',
    relaxationFields: ['ignoredCaptainAbilityCoverage'],
    relaxable: true,
    family: 'leaderAbility',
    reportRowKey: 'captainAbility',
  },
  {
    axis: 9,
    id: 'leaderSuperSpecialCriteria',
    inputField: 'requireLeaderSuperSpecialCriteria',
    relaxationFields: [
      'ignoredLeaderSuperSpecialCriteria',
      'ignoredSuperSpecialCriteriaCharacterNames',
    ],
    relaxable: true,
    family: 'leaderAbility',
    reportRowKey: 'superSpecial',
  },
  {
    axis: 10,
    id: 'superTandemCriteria',
    inputField: 'requireSuperTandemCriteria',
    relaxationFields: ['ignoredSuperTandemCriteria', 'ignoredSuperTandemCriteriaCharacterNames'],
    relaxable: true,
    family: 'leaderAbility',
    reportRowKey: 'superTandem',
  },
  {
    axis: 11,
    id: 'allowLeadersWithSuperEffects',
    inputField: 'allowAnyFriendCaptainAutoFill',
    relaxationFields: ['allowedLeadersWithSuperEffects'],
    relaxable: true,
    family: 'leaderScope',
    reportRowKey: 'leaderSuperScope',
  },
  /*
   * 869f333ey (D4). The Captain the reader pinned. Conceded only when that Captain provably cannot
   * lead the crew asked for (`resolvePinnedCaptainImpossibility`), and then only for another Captain
   * from the same pool that keeps every filter and the coverage - issue #523.
   */
  {
    axis: 12,
    id: 'pinnedCaptain',
    inputField: 'manualSlots',
    relaxationFields: ['replacedCaptain'],
    relaxable: true,
    family: 'leaderScope',
    reportRowKey: 'captain',
  },
  /*
   * 869f63gma. A Saved Enemy's hard avoid. Relaxed to a ranking only when no team can be built with
   * it, as the owner decided for both builders; `relaxedAvoidedValues` names what got in. A soft
   * avoid and every prefer are rankings from the start, so they never relax - the same row reports
   * them as applied.
   */
  {
    axis: 13,
    id: 'avoidedTypesAndClasses',
    inputField: 'avoidMode',
    relaxationFields: ['relaxedAvoidedValues'],
    relaxable: true,
    family: 'candidatePool',
    reportRowKey: 'avoidPrefer',
  },
] as const;

/**
 * `usedFallback` is not an axis - it is the summary of whether ANY axis was conceded. Listing it
 * as one would make the completeness test below pass for the wrong reason.
 */
export const NON_AXIS_RELAXATION_FIELDS: readonly (keyof AutoBuildResult['relaxation'])[] = [
  'usedFallback',
];

export function findAxisById(id: string): AutoTeamBuilderAxis | undefined {
  return AUTO_TEAM_BUILDER_AXES.find((axis) => axis.id === id);
}

export function findAxesByRelaxationField(
  field: keyof AutoBuildResult['relaxation'],
): AutoTeamBuilderAxis[] {
  return AUTO_TEAM_BUILDER_AXES.filter((axis) => axis.relaxationFields.includes(field));
}

/** Every Final team report row an axis speaks through, de-duplicated. */
export function listAxisReportRowKeys(): string[] {
  return [
    ...new Set(
      AUTO_TEAM_BUILDER_AXES.map((axis) => axis.reportRowKey).filter(
        (key): key is string => key !== null,
      ),
    ),
  ].sort();
}
