/**
 * 869f1p4wx. A small, curated, read-only set of teams, shipped with the app.
 *
 * 869f12xc8 asked for a shared layer - teams published against a piece of content, searchable,
 * importable - and was explicit that **the deliverable is a decision, not a design**, because the
 * full version is a different kind of product: somewhere to store other people's data, a
 * moderation process with a human in it, a takedown route, a privacy and terms rewrite, and an
 * availability promise a GitHub Pages site does not make.
 *
 * **This is the zero-backend half, and only that half.** Nothing is submitted, so there is nothing
 * to moderate, nothing to store on anyone's behalf, and no promise to keep. It ships the way
 * `whats-new.data.ts` ships release history: a TypeScript constant, in the bundle, read-only. The
 * full shared layer remains the owner's decision and is not started.
 *
 * ## What these teams are, stated plainly
 *
 * **They are worked examples composed from the shipped dataset. They are not community
 * submissions, and none of them claims to have cleared anything.** Nobody sent them in, no player
 * is credited, and no clear is asserted - doing any of that without real submissions would be
 * inventing a record and attributing it to people who never wrote it.
 *
 * What each one does carry is a rationale that can be checked against the dataset, which is the
 * only claim this file is entitled to make. `scripts/check-published-teams.mjs` checks it: every
 * character id exists, every stage is one of the 787 the dataset carries, and the four SUB slots
 * hold no two characters that share a `partyConflictKeys` entry - the rule the dataset encodes and
 * that applies to subs only, never to the two leader seats.
 */
export interface PublishedTeam {
  readonly id: string;
  /** Must match a `group` the dataset's drop sources use. */
  readonly group: string;
  /** Must match a `stage` the dataset carries under that group. */
  readonly stage: string;
  /** Slot 0 is the Captain, slot 1 the Friend Captain, 2-5 the subs. */
  readonly slots: readonly (number | null)[];
  /**
   * Why these six, in terms the dataset can confirm. A team with no checkable rationale is an
   * opinion about play, and this file is not entitled to ship those.
   *
   * Both languages, like every other player-facing string in this app. A live pass caught this
   * rendering as English inside Greek copy, which is the one thing the reader would notice first.
   */
  readonly rationale: { readonly en: string; readonly el: string };
  readonly curatedOn: string;
  /**
   * True for a team composed for this app rather than submitted by a player. Every entry here is
   * one today; the field exists so a real submission, if the owner ever accepts them, is
   * distinguishable from a worked example rather than silently mixed in with them.
   */
  readonly workedExample: true;
}

const CURATED_ON = '2026-09-14';

export const PUBLISHED_TEAMS: readonly PublishedTeam[] = [
  {
    id: 'treasure-map-garp-mode-crew',
    group: 'Treasure Map',
    stage: 'Garp',
    // Chopperemon, Kizaru, Garp, Lafitte, Kikunojo, Raizo - no two share a conflict key.
    slots: [3271, 3270, 3387, 3386, 3296, 3237],
    rationale: {
      en: 'Every one of these six has special text that does something extra specifically on a Treasure Map - they are drawn from the 60 characters in the shipped dataset whose specials carry a Treasure Map clause. Composed for this app to show what such a crew looks like; it is not a submitted team and claims no clear.',
      el: 'Και οι έξι έχουν special text που κάνει κάτι επιπλέον ειδικά σε Treasure Map - προέρχονται από τους 60 χαρακτήρες των δεδομένων της εφαρμογής που έχουν ρήτρα Treasure Map στο special τους. Φτιάχτηκε για αυτή την εφαρμογή ως παράδειγμα τέτοιου crew· δεν είναι ομάδα που υπέβαλε κάποιος και δεν ισχυρίζεται πέρασμα.',
    },
    curatedOn: CURATED_ON,
    workedExample: true,
  },
  {
    id: 'free-spirit-crew',
    group: 'Raid',
    stage: 'Clash!! Buster Call',
    // Ace, Luffy, Nami, Vivi, Loki, Reiju - all Free Spirit, all distinct conflict keys.
    slots: [5032, 5014, 4633, 4632, 4629, 4628],
    rationale: {
      en: 'All six carry the Free Spirit class at 5 stars or above, so this is what a single-class Free Spirit crew looks like out of the shipped dataset. Composed for this app as a worked example of a class crew; it is not a submitted team and claims no clear.',
      el: 'Και οι έξι έχουν την κλάση Free Spirit σε 5 αστέρια ή πάνω, οπότε έτσι μοιάζει ένα crew μίας κλάσης Free Spirit μέσα από τα δεδομένα της εφαρμογής. Φτιάχτηκε για αυτή την εφαρμογή ως παράδειγμα crew κλάσης· δεν είναι ομάδα που υπέβαλε κάποιος και δεν ισχυρίζεται πέρασμα.',
    },
    curatedOn: CURATED_ON,
    workedExample: true,
  },
];
