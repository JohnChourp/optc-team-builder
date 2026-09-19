/**
 * 869f13c5t. The words on the four tool pages and the three guides, in one place.
 *
 * `SeoContentPage` renders these records, and `scripts/generate-seo-pages.mjs` builds the static
 * fallback that no-JavaScript crawlers and screen readers get before hydration from the same records,
 * through `scripts/lib/seo-content.mjs`. Until 869f13c5t each page carried two bodies - this one in
 * `app.routes.ts` and a different one in the generator - which shared no sentence, so a search
 * snippet could quote a line the visitor could not find on the page.
 *
 * To change a sentence on one of these pages, change it here; nothing else holds a copy. Titles, meta
 * descriptions and canonical paths are route facts and stay in `src/app/core/data/public-routes.data.ts`.
 * The other thirteen public pages keep their fallback prose in the generator, where it already exists
 * once.
 *
 * The records ship with the lazy seo-content chunk, not the entry script: while they sat in the eager
 * route table they cost the entry bundle about 7 KB.
 *
 * English by decision (869dwcbb8): the page host declares `lang="en"`.
 */

export interface SeoContentLink {
  label: string;
  route: string;
}

export interface SeoContentSection {
  title: string;
  copy: string;
}

export interface SeoContentPageData {
  eyebrow: string;
  title: string;
  summary: string;
  sections: readonly SeoContentSection[];
  links: readonly SeoContentLink[];
}

/** Keyed by the route path the page is served at, which is also its canonical path. */
export const SEO_CONTENT_PAGES: Readonly<Record<string, SeoContentPageData>> = {
  'tools/optc-team-builder': {
    eyebrow: 'OPTC tool',
    title: 'OPTC Team Builder Tool',
    summary:
      'A fan-made One Piece Treasure Cruise crew planner for searching characters, checking ability coverage, and moving quickly from a unit idea to a playable team.',
    sections: [
      {
        title: 'Search before you build',
        copy: 'Start from the character catalog when you need names, ids, types, classes, specials, supports, and captain ability context before choosing crew slots.',
      },
      {
        title: 'Move into real tools',
        copy: 'Use the live Characters, Captain Coverage, Auto Team Builder, and Crew Forge screens instead of copying data between separate spreadsheets.',
      },
      {
        title: 'Keep planning data local',
        copy: 'Saved teams, saved enemies, character boxes, and backups stay in your browser unless you choose to use Drive sync.',
      },
    ],
    links: [
      { label: 'Browse OPTC characters', route: '/tabs/characters' },
      { label: 'Open Auto Team Builder', route: '/tabs/auto-team-builder' },
    ],
  },
  'tools/optc-auto-team-builder': {
    eyebrow: 'Auto builder',
    title: 'OPTC Auto Team Builder',
    summary:
      'Find One Piece Treasure Cruise crew candidates by describing the mechanics and ability coverage your team needs.',
    sections: [
      {
        title: 'Mechanic-first planning',
        copy: 'Enter bind, despair, paralysis, barriers, damage reduction, orb problems, interrupts, and other enemy requirements to narrow the character pool.',
      },
      {
        title: 'Manual slots stay useful',
        copy: 'Lock known captains or key subs first, then let the builder search around the characters you already want to use.',
      },
      {
        title: 'Readable candidate results',
        copy: 'Generated teams and fallback candidates are ranked with coverage details so you can understand why a unit was selected.',
      },
    ],
    links: [
      { label: 'Open Auto Team Builder', route: '/tabs/auto-team-builder' },
      { label: 'Check captain coverage', route: '/tabs/captain-coverage' },
    ],
  },
  'tools/optc-rumble-team-builder': {
    eyebrow: 'Pirate Rumble',
    title: 'OPTC Pirate Rumble Team Builder',
    summary:
      'Compare Pirate Rumble units and build active and bench slots from local One Piece Treasure Cruise Rumble data.',
    sections: [
      {
        title: 'Rumble-specific scoring',
        copy: 'The Rumble tools prioritize passive effects, special effects, stats, roles, type focus, and synergy instead of regular quest-only ability text.',
      },
      {
        title: 'Active and bench slots',
        copy: 'Build around the slots you care about, review suggested teams, and inspect dropped or resolved type choices.',
      },
      {
        title: 'Useful for tier-list research',
        copy: 'Rumble Characters gives a searchable ranking surface for players comparing OPTC Pirate Rumble units before building a team.',
      },
    ],
    links: [
      { label: 'Build a Rumble team', route: '/tabs/auto-team-builder-rumble' },
      { label: 'Rank Rumble characters', route: '/tabs/rumble-characters' },
    ],
  },
  'tools/optc-character-database': {
    eyebrow: 'Character database',
    title: 'OPTC Character Database',
    summary:
      'Search One Piece Treasure Cruise character data and open generated detail pages with stats, abilities, supports, and Rumble information.',
    sections: [
      {
        title: 'Character search',
        copy: 'Use names, ids, types, classes, and ability text to find the units you need for a crew or Rumble setup.',
      },
      {
        title: 'Detail pages',
        copy: 'Generated character pages expose crawlable summaries for captain ability, special, support, and Pirate Rumble data where available.',
      },
      {
        title: 'Connected planning',
        copy: 'Character pages link back into the app tools so search and team planning stay connected.',
      },
    ],
    links: [
      { label: 'Open Characters', route: '/tabs/characters' },
      { label: 'Open Rumble Characters', route: '/tabs/rumble-characters' },
    ],
  },
  'guides/how-to-build-an-optc-team': {
    eyebrow: 'Team-building guide',
    title: 'How to Build an OPTC Team',
    summary:
      'A practical workflow for One Piece Treasure Cruise players who need to turn enemy mechanics and available units into a working crew.',
    sections: [
      {
        title: 'Start with the captain',
        copy: 'Pick a captain that covers the key characters you want to use, then verify type, class, cost, universal, and self-scope coverage.',
      },
      {
        title: 'Map the mechanics',
        copy: 'List the enemy mechanics that must be handled, including bind, despair, paralysis, barriers, damage reduction, orb problems, and interrupts.',
      },
      {
        title: 'Lock and search',
        copy: 'Place known units in manual slots, then use ability filters and generated candidates to fill missing utility and damage roles.',
      },
    ],
    links: [
      { label: 'Check captain coverage', route: '/tabs/captain-coverage' },
      { label: 'Open Auto Team Builder', route: '/tabs/auto-team-builder' },
    ],
  },
  'guides/guided-build-compare-team-sharing': {
    eyebrow: 'Feature guide',
    title: 'Guided Build, Compare Mode, and Team Sharing',
    summary:
      'Use guided auto build to fill one crew slot at a time, compare team sources side by side, and move saved teams between devices with supported local transfer formats.',
    sections: [
      {
        title: 'Guided auto build',
        copy: 'Turn on Guided auto build when you want the builder to fill and lock only the next empty slot. It starts with Captain, then advances through subs while keeping earlier picks locked; when all manual slots are filled, the next build validates the locked team.',
      },
      {
        title: 'Compare mode sources',
        copy: 'Compare mode can use the current generated team, a team already saved on this device, or an imported payload. Use it to check changed slots, filled slots, ability counts, Captain Ability tier coverage, and ship differences before saving or rebuilding.',
      },
      {
        title: 'Supported transfer formats',
        copy: 'Saved Teams import accepts schema v1 saved-teams JSON, a saved-team share link, or a raw saved-team share code. Stable-id v1 team records can be repaired when optional fields are missing or stale; unsupported schemas, malformed share codes, and teams without a stable id are rejected.',
      },
      {
        title: 'Example flows',
        copy: 'Build a team with guided mode, save it, share it from Saved Teams, then open the share link on another device to preload Manual Team Builder as an unsaved draft. You can also paste the same share code into Saved Teams import or Compare mode.',
      },
      {
        title: 'Current limits',
        copy: 'Saved teams are local to the current browser or app install unless you export, share, import, or sync them. Corrupted local saved-team storage is repaired in place when possible, and unrecoverable records are removed with a warning instead of breaking the page.',
      },
    ],
    links: [
      { label: 'Open Auto Team Builder', route: '/tabs/auto-team-builder' },
      { label: 'Open Saved Teams', route: '/tabs/saved-teams' },
    ],
  },
  'guides/optc-pirate-rumble-team-building': {
    eyebrow: 'Pirate Rumble guide',
    title: 'OPTC Pirate Rumble Team Building',
    summary:
      'Use Rumble-specific data to compare units, shape active and bench slots, and understand team synergy before saving a setup.',
    sections: [
      {
        title: 'Use Rumble data',
        copy: 'Regular specials and captain abilities do not describe the whole Rumble picture. Compare passive effects, special effects, cooldown, defense, speed, and role tags.',
      },
      {
        title: 'Balance roles',
        copy: 'Strong Rumble teams usually need damage, survivability, control, and support effects distributed across active and bench slots.',
      },
      {
        title: 'Compare before saving',
        copy: 'Use Rumble Characters for unit ranking, then use Auto Team Rumble Builder to test team combinations and save useful results.',
      },
    ],
    links: [
      { label: 'Rank Rumble characters', route: '/tabs/rumble-characters' },
      { label: 'Build a Rumble team', route: '/tabs/auto-team-builder-rumble' },
    ],
  },
};
