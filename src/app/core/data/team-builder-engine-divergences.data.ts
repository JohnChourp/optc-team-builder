/**
 * Where the quest and Rumble team builders deliberately differ, and where
 * nobody has decided yet.
 *
 * 869f12x69. Two builders, two engines, two workers, real divergences - and no
 * record of which differences are design and which are drift. Without one,
 * every session that reads one engine after the other proposes making them the
 * same, and the refusals already in this project's record get re-argued. That
 * is the cost being paid repeatedly.
 *
 * Each entry is evidenced by symbols that exist, and
 * `scripts/check-engine-divergences.mjs` fails when one of them stops existing -
 * so this cannot quietly become prose about a codebase that has moved on.
 *
 * ONE CORRECTION TO THE FRAMING THIS TASK ARRIVED WITH.
 *
 * It said "the quest builder's translations contain zero score keys, because
 * that engine evaluates whole teams against rules". The first half is true and
 * the second is not quite: the quest engine scores individual candidates too -
 * `AutoBuildCandidate.recencyScore` is a per-unit number it sorts by. What it
 * does not do is put a score on the SELECTED slot or show one to the reader.
 * `AutoBuildSlot` carries `reasonChips` and an `explanation`; `RumbleTeamSlot`
 * carries `score` as well, renders it as "Score {{score}}", and persists it
 * through export and import.
 *
 * So the difference is not "one scores and one does not". It is **what each
 * one shows and keeps**, which is a narrower and more defensible line - and the
 * one that actually matters when somebody proposes adding a per-slot number to
 * the quest results.
 */

export type EngineDivergenceStatus =
  /** Someone decided this, and the decision is recorded with its date. */
  | 'deliberate'
  /** Nobody has decided. Named here so it is an open question, not a silent difference. */
  | 'unreviewed';

export interface EngineDivergence {
  readonly id: string;
  readonly summary: string;
  /** What the quest builder does. */
  readonly quest: string;
  /** What the Rumble builder does. */
  readonly rumble: string;
  readonly status: EngineDivergenceStatus;
  /** Required when `status` is `deliberate`: who decided what, and when. */
  readonly decision?: string;
  /** Symbols that must still exist, so this record cannot outlive the code. */
  readonly evidence: readonly { readonly file: string; readonly symbol: string }[];
}

export const TEAM_BUILDER_ENGINE_DIVERGENCES: readonly EngineDivergence[] = [
  {
    id: 'per-slot-score-shown-to-the-reader',
    summary: 'Only Rumble shows and stores a score for each chosen unit.',
    quest:
      'Scores candidates internally to order them (AutoBuildCandidate.recencyScore), then reports the chosen slot with reasonChips and an explanation. No number reaches the reader and none is persisted.',
    rumble:
      'RumbleTeamSlot carries a score alongside its reasonChips, renders it as "Score {{score}}", and carries it through export and import.',
    status: 'deliberate',
    decision:
      'Half-refused once already as a feature request for the quest side; a per-slot number implies a precision the rule-based quest engine does not have, because its answer is Passed / Relaxed / Not applicable against requirements rather than a grade.',
    evidence: [
      { file: 'src/app/core/models/auto-team-builder.models.ts', symbol: 'recencyScore' },
      { file: 'src/app/core/models/auto-team-builder-rumble.models.ts', symbol: 'RumbleTeamSlot' },
      {
        file: 'src/app/pages/auto-team-builder-rumble/auto-team-builder-rumble-export.utils.ts',
        symbol: 'score',
      },
    ],
  },
  {
    id: 'how-the-enemy-is-described',
    summary: 'Rumble takes an opponent team; the quest side uses stored Saved Enemies.',
    quest:
      'The enemy is a first-class stored entity with its own page and its own links to teams, described by mechanics and ability requirements.',
    rumble:
      'The opponent is a team of units entered into the builder, with a toggle that makes the next build counter its filled slots. It is not stored as an entity.',
    status: 'deliberate',
    decision:
      'The two games describe an enemy differently: a quest enemy is a set of mechanics, a Rumble opponent is a crew. 869f12x45 proposes persisting Rumble opponents, which would close the storage half without merging the models.',
    evidence: [
      { file: 'src/app/core/models/auto-team-builder-rumble.models.ts', symbol: 'RumbleOpponentSlotContext' },
      { file: 'src/app/pages/saved-enemies/saved-enemies.page.ts', symbol: 'SavedEnemiesPage' },
    ],
  },
  {
    id: 'what-happens-when-nothing-fits',
    summary: 'The quest engine relaxes and retries; the Rumble engine drops and reports.',
    quest:
      'Carries a relaxation summary and re-runs with loosened constraints, through a multi-attempt worker protocol (runAttempt, attemptProgress, maxScheduledFallbackAttempts).',
    rumble:
      'Has no relaxation concept. It reports droppedTypes and droppedClasses, and offers a resultMode of score or closestCost.',
    status: 'deliberate',
    decision:
      'A quest team either satisfies the requirements or does not, so saying WHICH requirement was relaxed is the answer. A Rumble team is always fieldable, so the useful answer is which asks could not be honoured.',
    evidence: [
      { file: 'src/app/core/models/auto-team-builder.models.ts', symbol: 'AutoBuildRelaxationSummary' },
      { file: 'src/app/core/models/auto-team-builder-rumble.models.ts', symbol: 'RumbleBuildResultMode' },
      { file: 'src/app/core/services/auto-team-builder.worker.models.ts', symbol: 'runAttempt' },
    ],
  },
  {
    id: 'how-many-teams-come-back',
    summary: 'The quest engine returns one team; the Rumble engine returns a ranked list.',
    quest:
      'Returns a single AutoBuildResult. Ranked alternatives exist separately, as AutoBuildRankedResults.',
    rumble: 'Returns RumbleTeamResult[] up to a requested limit, fanned out across workerCount workers.',
    status: 'deliberate',
    decision:
      'The quest side answers "build me a team that clears this"; the Rumble side answers "which crews are strongest", which is a list by nature.',
    evidence: [
      { file: 'src/app/core/models/auto-team-builder.models.ts', symbol: 'AutoBuildRankedResults' },
      { file: 'src/app/core/services/auto-team-builder-rumble.worker.models.ts', symbol: 'workerCount' },
    ],
  },
  {
    id: 'ship-selection',
    summary: 'Only the quest builder chooses a ship.',
    quest:
      'Returns a shipSelection alongside the team, chosen against the same requirements as the crew.',
    rumble:
      'Has no ship concept at all - no input for one, no field on a result, and nothing to render.',
    status: 'deliberate',
    decision: 'Pirate Rumble does not use ships, so there is nothing to select.',
    evidence: [
      { file: 'src/app/core/models/auto-team-builder.models.ts', symbol: 'AutoBuildShipSelection' },
    ],
  },
  {
    id: 'worker-warm-up',
    summary: 'Only the quest worker is initialised before a run.',
    quest:
      'Has an init request and a ready response, so the dataset is loaded into the worker before the first build.',
    rumble: 'Has only run, progress, result and error; every run ships its records with it.',
    status: 'unreviewed',
    decision: undefined,
    evidence: [
      { file: 'src/app/core/services/auto-team-builder.worker.models.ts', symbol: "type: 'init'" },
      {
        file: 'src/app/core/services/auto-team-builder-rumble.worker.models.ts',
        symbol: 'AutoTeamBuilderRumbleWorkerRequest',
      },
    ],
  },
];

/** Differences nobody has decided on. These are open questions, not settled design. */
export function unreviewedEngineDivergences(): readonly EngineDivergence[] {
  return TEAM_BUILDER_ENGINE_DIVERGENCES.filter(
    (divergence) => divergence.status === 'unreviewed',
  );
}
