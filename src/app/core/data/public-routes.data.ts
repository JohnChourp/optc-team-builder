/**
 * The public route list, written once.
 *
 * 869f12x57. It used to be written five times - `app.routes.ts`,
 * `app.routes.spec.ts`, `scripts/generate-seo-pages.mjs`,
 * `scripts/audit-seo-pages.mjs` and `scripts/check-docs-integrity.mjs` - and
 * the copies disagreed in every way a set of copies can:
 *
 *   - `/faq` shipped into the router and reached 0 of the 4,637 sitemap URLs
 *     (869f12x4k);
 *   - it had no `data.seo`, so the app served `noindex,follow` with a home-page
 *     canonical while the sitemap advertised it (869f12x57, measured in
 *     production);
 *   - it is still absent from `check-docs-integrity.mjs`, which rejects any doc
 *     that links to `https://optcteambuilder.com/faq/` - demonstrated, while
 *     the identical link to `/privacy/` passes.
 *
 * Three separate failures, one cause: the same fact restated until the
 * restatements drifted. So this is the fact, and the copies read it.
 *
 * WHAT LIVES HERE, and what deliberately does not.
 *
 * Only the fields that were duplicated: where the router declares the route,
 * the canonical path it is published at, and the `<title>` and meta description
 * both the app and the generated page must agree on. The generator's long-form
 * page content - headings, paragraphs, in-page links, schema type - stays in
 * `scripts/generate-seo-pages.mjs`, because pulling it here would add ~20 KB of
 * prose to the app bundle that no screen reads. The generator itself refuses to
 * run if it holds an entry this registry does not name, or the reverse.
 *
 * 869f13c5t. "Exactly one place" was true for thirteen pages and false for the
 * four tools and three guides, whose text the app also rendered - from
 * `app.routes.ts`, in sentences the generator's copy never shared. Those seven
 * now keep their text once, in `src/app/pages/seo-content/seo-content.data.ts`,
 * which the page renders and the generator reads; it ships with the lazy page,
 * so it adds nothing to the entry script either.
 *
 * A route in the router with no record here is not published: it has no
 * `data.seo`, so `AppComponent` falls back to `defaultSeo` and marks it
 * `noindex,follow`. That is the correct default for the screens holding a
 * reader's own data, and it is why the registry lists what IS public rather
 * than what is not.
 */
export interface PublicRouteRecord {
  /** Full path as the router declares it, e.g. `tabs/faq`. */
  readonly routePath: string;
  /** Path the page is published and canonicalised at, e.g. `faq`. */
  readonly canonicalPath: string;
  readonly title: string;
  readonly description: string;
  /** Extra paths the generator emits for the same page, e.g. `tabs/privacy`. */
  readonly aliases?: readonly string[];
  /**
   * 869f13c6b. The page's language; `en` when absent, which is every page today. A page in
   * another language must also name `alternates`, or `routes:sitemap-coverage` fails - see
   * `scripts/lib/public-page-language.mjs`.
   */
  readonly language?: string;
  /** The canonical path of this page in each other language, e.g. `{ el: 'el/faq' }`. Reciprocal. */
  readonly alternates?: Readonly<Record<string, string>>;
}

export const PUBLIC_ROUTES: readonly PublicRouteRecord[] = [
  {
    routePath: '',
    canonicalPath: '',
    title: 'OPTC Team Builder | One Piece Treasure Cruise Tools',
    description:
      'Plan OPTC crews with character search, Rumble rankings, captain coverage, auto team building, Crew Forge, saved teams, enemies, boxes, Drive sync, and offline tools.',
  },
  {
    routePath: 'tabs/characters',
    canonicalPath: 'tabs/characters',
    title: 'OPTC Characters | OPTC Team Builder',
    description:
      'Browse the One Piece Treasure Cruise character catalog with stats, classes, abilities, and team-building data.',
  },
  {
    routePath: 'tabs/rumble-characters',
    canonicalPath: 'tabs/rumble-characters',
    title: 'Rumble Characters | OPTC Team Builder',
    description:
      'Rank One Piece Treasure Cruise Pirate Rumble characters by full Rumble score, favorites, core filters, and custom stat focus.',
  },
  {
    routePath: 'tabs/auto-team-builder',
    canonicalPath: 'tabs/auto-team-builder',
    title: 'Auto Team Builder | OPTC Team Builder',
    description:
      'Find OPTC team candidates by enemy mechanics, character abilities, type filters, and team-building requirements.',
  },
  {
    routePath: 'tabs/manual-team-builder',
    canonicalPath: 'tabs/manual-team-builder',
    title: 'Manual Team Builder | OPTC Team Builder',
    description:
      'Build and save fixed OPTC crews manually with character slots, an optional ship, and a local cost budget.',
  },
  {
    routePath: 'tabs/captain-coverage',
    canonicalPath: 'tabs/captain-coverage',
    title: 'Captain Coverage | OPTC Team Builder',
    description:
      'Pick an OPTC Captain and see which characters that Captain Ability boosts, with the full catalogue still listed and only your own filters narrowing it.',
  },
  {
    routePath: 'tabs/auto-team-builder-rumble',
    canonicalPath: 'tabs/auto-team-builder-rumble',
    title: 'Auto Team Rumble Builder | OPTC Team Builder',
    description:
      'Build a Pirate Rumble team from local OPTC rumble data with deterministic scoring and synergy ranking.',
  },
  {
    routePath: 'tabs/crew-forge',
    canonicalPath: 'tabs/crew-forge',
    title: 'Crew Forge | OPTC Team Builder',
    description:
      'Import crew screenshots and match recognized slots against the OPTC character catalog.',
  },
  {
    routePath: 'tabs/account',
    canonicalPath: 'tabs/account',
    title: 'Account | OPTC Team Builder',
    description:
      'Manage your optional Google account connection and Google Drive backup for OPTC Team Builder.',
    aliases: ['tabs/drive-sync'],
  },
  {
    routePath: 'tools/optc-team-builder',
    canonicalPath: 'tools/optc-team-builder',
    title: 'OPTC Team Builder Tool | One Piece Treasure Cruise Crew Planner',
    description:
      'Use OPTC Team Builder to search One Piece Treasure Cruise characters, compare abilities, plan crews, and jump into auto team-building tools.',
  },
  {
    routePath: 'tools/optc-auto-team-builder',
    canonicalPath: 'tools/optc-auto-team-builder',
    title: 'OPTC Auto Team Builder | Enemy Mechanics and Ability Filters',
    description:
      'Build One Piece Treasure Cruise teams by enemy mechanics, ability requirements, manual slots, type filters, class filters, and character candidates.',
  },
  {
    routePath: 'tools/optc-rumble-team-builder',
    canonicalPath: 'tools/optc-rumble-team-builder',
    title: 'OPTC Pirate Rumble Team Builder | Rumble Rankings and Synergy',
    description:
      'Build Pirate Rumble teams in OPTC with local Rumble data, active and bench slots, score ranking, type focus, and synergy checks.',
  },
  {
    routePath: 'tools/optc-character-database',
    canonicalPath: 'tools/optc-character-database',
    title: 'OPTC Character Database | One Piece Treasure Cruise Search',
    description:
      'Search the OPTC character database by id, name, type, class, specials, captain abilities, support effects, and Pirate Rumble data.',
  },
  {
    routePath: 'guides/how-to-build-an-optc-team',
    canonicalPath: 'guides/how-to-build-an-optc-team',
    title: 'How to Build an OPTC Team | One Piece Treasure Cruise Guide',
    description:
      'Learn a practical OPTC team-building workflow: pick captains, cover enemy mechanics, choose utility, lock manual slots, and compare candidates.',
  },
  {
    routePath: 'guides/guided-build-compare-team-sharing',
    canonicalPath: 'guides/guided-build-compare-team-sharing',
    title: 'Guided Build, Compare Mode, and Team Sharing | OPTC Team Builder',
    description:
      'Learn how to use guided Auto Team Builder, compare current, saved, and imported teams, and move saved teams with JSON, share links, and share codes.',
  },
  {
    routePath: 'guides/optc-pirate-rumble-team-building',
    canonicalPath: 'guides/optc-pirate-rumble-team-building',
    title: 'OPTC Pirate Rumble Team Building Guide | Rumble Builder',
    description:
      'Build better OPTC Pirate Rumble teams by comparing Rumble passives, specials, stats, roles, active slots, bench slots, and type synergy.',
  },
  {
    routePath: 'tabs/faq',
    canonicalPath: 'faq',
    title: 'OPTC Team Builder FAQ | Questions About Building a Team',
    description:
      'Answers to common OPTC Team Builder questions: where to start, what the filters mean, why a result changed, and what to do when a suggested team looks wrong.',
    aliases: ['tabs/faq'],
  },
  {
    routePath: 'tabs/privacy',
    canonicalPath: 'privacy',
    title: 'Privacy Policy | OPTC Team Builder',
    description:
      'Read the privacy policy for OPTC Team Builder.',
    aliases: ['tabs/privacy'],
  },
  {
    routePath: 'tabs/cookies',
    canonicalPath: 'cookies',
    title: 'Cookie Policy | OPTC Team Builder',
    description:
      'Read the cookie policy for OPTC Team Builder.',
    aliases: ['tabs/cookies'],
  },
  {
    routePath: 'tabs/terms',
    canonicalPath: 'terms',
    title: 'Terms of Service | OPTC Team Builder',
    description:
      'Read the terms of service for OPTC Team Builder.',
    aliases: ['tabs/terms'],
  },];

/** `data.seo` for one route, by the path the router declares it at. */
export function publicRouteSeo(routePath: string): {
  title: string;
  description: string;
  canonicalPath: string;
} {
  const record = PUBLIC_ROUTES.find((route) => route.routePath === routePath);

  if (!record) {
    /*
     * Thrown rather than defaulted. A typo here would otherwise produce a route
     * that silently serves `noindex,follow` - which is precisely the defect this
     * registry exists to end, and it took a production measurement to find the
     * first time.
     */
    throw new Error(`No public route record for "${routePath}".`);
  }

  return {
    title: record.title,
    description: record.description,
    canonicalPath: record.canonicalPath,
  };
}
