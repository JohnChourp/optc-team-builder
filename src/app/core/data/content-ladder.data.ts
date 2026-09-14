/**
 * 869f1naz5. A short, dated, hand-curated ladder of content, and what a box needs to field for it.
 *
 * 869f12xb1 asked for a progress advisor - *"with this box, what is my next goal"* - and the
 * feasibility gate split the question cleanly in two.
 *
 * **Stage requirements are absent from the dataset, completely.** Zero `detail_json` rows mention
 * player level, stamina or unlock. A drop source carries five fields - `group`, `stage`, `dropId`,
 * `slot`, `global` - and `slot` is a drop slot number, not a difficulty.
 *
 * **Stage names are not.** `character_drops` yields **787 distinct (group, stage) pairs across 14
 * groups**, so a curated ladder does not invent a parallel list of content; it attaches
 * requirements to names the dataset already carries. `scripts/check-content-ladder.mjs` binds every
 * entry below to a real one, which is what makes a hand-maintained file survivable: a stage renamed
 * upstream turns a lane **red** instead of quietly becoming a lie.
 *
 * ## The limit this file will not step over
 *
 * The dataset supports **what a box can field**. It does not support **what a box can clear** -
 * that is game-balance knowledge, and this project has no source for it. So every requirement here
 * is a statement about the box, the surface says "field" and never "clear", and any number that is
 * a starting point rather than an established fact carries `provisional: true` and says why in its
 * own note. A guard rejects a provisional entry with no note.
 *
 * **As of 2026-09-14 no entry is provisional**: the four rarity floors that shipped that way were
 * confirmed by the owner, and each carries `confirmedOn` and says so in its note. The field stays
 * because the next milestone added may need it - and the guard rejects an entry that claims both
 * states, or one whose note still says "provisional" after the flag is gone.
 *
 * **Not a tier list, and nothing about spending money.** Both were ruled out by the brief.
 *
 * The past does not accumulate here. This is deliberately a handful of well-known milestones rather
 * than an attempt at completeness that ages badly - the research's own recommendation.
 */
export interface ContentLadderRequirement {
  /** Characters the box must hold before it can field this at all. A team is six slots. */
  readonly teamSize: number;
  /** A rough rarity floor: at least `count` characters at `stars` or above. */
  readonly minStars?: { readonly stars: number; readonly count: number };
  /** At least this many characters of each named class. */
  readonly classCounts?: Readonly<Record<string, number>>;
  /** At least this many characters of each named type. */
  readonly typeCounts?: Readonly<Record<string, number>>;
}

export interface ContentLadderMilestone {
  readonly id: string;
  /** Must match a `group` the dataset's drop sources use. */
  readonly group: string;
  /** Must match a `stage` the dataset carries under that group. */
  readonly stage: string;
  readonly requirement: ContentLadderRequirement;
  /** When these numbers were last looked at, so a stale ladder is visible rather than assumed. */
  readonly curatedOn: string;
  /**
   * Where the requirement came from. A requirement with no traceable basis is an opinion, and this
   * file exists because opinions about difficulty are exactly what it must not ship.
   */
  readonly sourceNote: string;
  /** True when the numbers are a starting point the owner has not confirmed. */
  readonly provisional?: boolean;
  /**
   * When the owner confirmed this milestone's requirement, if they have.
   *
   * Mutually exclusive with `provisional` - a guard rejects an entry that claims both, because
   * "confirmed" and "not yet confirmed" cannot both be true of one number.
   */
  readonly confirmedOn?: string;
}

const CURATED_ON = '2026-09-14';
/**
 * 869f1t8wv. When the owner confirmed the requirement numbers below.
 *
 * The four rarity floors shipped as `provisional` because difficulty is game-balance knowledge and
 * this dataset carries none of it - the values were a starting point with nothing behind them. The
 * owner is the authority for this project, so their confirmation IS the source, and it is recorded
 * with its date rather than dressed up as something derived.
 */
const OWNER_CONFIRMED_ON = '2026-09-14';

/**
 * Ordered easiest-box-requirement first. The Story Island entries follow the game's own story
 * order, which is the one ordering here that needs no judgement at all.
 */
export const CONTENT_LADDER: readonly ContentLadderMilestone[] = [
  {
    id: 'story-orange-town',
    group: 'Story Island',
    stage: 'Orange Town',
    requirement: { teamSize: 2 },
    curatedOn: CURATED_ON,
    sourceNote:
      'The second island of the story. The only requirement stated is that a box can field more than a lone captain, which is a fact about the box rather than a claim about difficulty.',
  },
  {
    id: 'story-syrup-village',
    group: 'Story Island',
    stage: 'Syrup Village',
    requirement: { teamSize: 4 },
    curatedOn: CURATED_ON,
    sourceNote:
      'Third island in story order. Team size only - a partial team is the thing a new box actually lacks.',
  },
  {
    id: 'story-baratie',
    group: 'Story Island',
    stage: 'Baratie',
    requirement: { teamSize: 6 },
    curatedOn: CURATED_ON,
    sourceNote:
      'Fourth island in story order, and the point at which a box can fill all six slots. Six is the number of slots in a team, not a difficulty estimate.',
  },
  {
    id: 'story-arlong-park',
    group: 'Story Island',
    stage: 'Arlong Park',
    requirement: { teamSize: 6, minStars: { stars: 3, count: 4 } },
    curatedOn: CURATED_ON,
    confirmedOn: OWNER_CONFIRMED_ON,
    sourceNote:
      'Fifth island in story order. The 3-star floor on four members describes a box that has begun evolving its units. Owner-confirmed on 2026-09-14 - the number is theirs to set, and this project has no other source for a difficulty requirement.',
  },
  {
    id: 'raid-buster-call',
    group: 'Raid',
    stage: 'Clash!! Buster Call',
    requirement: { teamSize: 6, minStars: { stars: 5, count: 5 } },
    curatedOn: CURATED_ON,
    confirmedOn: OWNER_CONFIRMED_ON,
    sourceNote:
      'The Raid with the most drops in the dataset (22), so it is well-known content rather than a corner case. The 5-star floor on five members describes a developed box. Owner-confirmed on 2026-09-14.',
  },
  {
    id: 'kizuna-shanks',
    group: 'Kizuna Clash',
    stage: 'Shanks',
    requirement: { teamSize: 6, minStars: { stars: 5, count: 6 } },
    curatedOn: CURATED_ON,
    confirmedOn: OWNER_CONFIRMED_ON,
    sourceNote:
      'Kizuna Clash is repeated runs for a shared score rather than one clear, so a full developed team is what the box needs to contribute at all. Owner-confirmed on 2026-09-14. Still unrecorded either way: Kizuna crews are usually class-restricted, and this dataset does not carry that.',
  },
  {
    id: 'treasure-map-garp',
    group: 'Treasure Map',
    stage: 'Garp',
    requirement: { teamSize: 6, minStars: { stars: 5, count: 6 } },
    curatedOn: CURATED_ON,
    confirmedOn: OWNER_CONFIRMED_ON,
    sourceNote:
      'Treasure Map scores rather than clears, so nothing here claims a clear. Owner-confirmed on 2026-09-14. Still unrecorded either way: which units are boosted on a given map is not in this dataset, and the reader enters that separately on Auto Team Builder.',
  },
];
