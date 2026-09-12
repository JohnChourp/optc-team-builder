/**
 * The player-facing FAQ, as structure only: every word lives in the `faq`
 * translation scope so the page reads the same in English and in Greek.
 *
 * An entry declares which bullets and links it has rather than letting the
 * template guess, so `faq.data.spec.ts` can walk this list and prove every
 * declared key exists, non-empty, in BOTH locale files. With the list growing
 * one ClickUp task at a time, a question that ships with a Greek half missing
 * is the failure worth catching, and it is invisible to a template test.
 */
export interface FaqLink {
  /** Key segment under `entries.<entryId>.links`. */
  readonly key: string;
  /** In-app route the link opens. */
  readonly route: string;
}

/**
 * A label this entry quotes back from the app's own interface.
 *
 * The FAQ tells a reader to look for something on screen, so the words it puts
 * in quotes have to be the words the screen actually shows - in BOTH languages.
 * The Greek app translates most of them ("Passed" is «Πέρασε», "Download preset
 * JSON" is «Λήψη preset JSON»), so an answer written once in English and
 * translated loosely sends a Greek reader hunting for a button that does not
 * exist. Six such quotes shipped in v0.4.17 before this existed.
 *
 * `faq.data.spec.ts` resolves each reference per language and fails unless the
 * named text contains it, so renaming a button turns the FAQ red instead of
 * quietly making it wrong.
 */
export interface FaqLabelQuote {
  /** Translation scope directory, or `root` for `public/i18n/<lang>.json`. */
  readonly scope: string;
  /** Dotted key inside that scope. Text after the first `{{` is ignored. */
  readonly key: string;
  /** Where in the entry it must appear: `answer`, or `bullets.<name>`. */
  readonly in: string;
}

export interface FaqEntry {
  /** Stable id: the key segment under `entries`, and the accordion value. */
  readonly id: string;
  /** Key segments under `entries.<id>.bullets`, in display order. */
  readonly bullets: readonly string[];
  readonly links: readonly FaqLink[];
  /** App labels this entry quotes; verified against both locales. */
  readonly quotes: readonly FaqLabelQuote[];
}

export interface FaqSection {
  /** Stable id: the key segment under `sections`. */
  readonly id: string;
  readonly entries: readonly FaqEntry[];
}

export const FAQ_SECTIONS: readonly FaqSection[] = [
  {
    id: 'start',
    entries: [
      {
        // 869exmkgg: asked for "quick presets per battle role". Those do not
        // exist and are not wanted - shipped teams go stale with every nightly
        // data release (owner, 869exmkam). This answers what reuse really is.
        id: 'presets',
        bullets: ['presetJson', 'savedEnemy', 'savedTeam'],
        links: [
          { key: 'autoTeamBuilder', route: '/tabs/auto-team-builder' },
          { key: 'savedEnemies', route: '/tabs/saved-enemies' },
        ],
        quotes: [
          {
            scope: 'auto-team-builder',
            key: 'actions.downloadPresetJson',
            in: 'bullets.presetJson',
          },
          { scope: 'auto-team-builder', key: 'actions.importPresetJson', in: 'bullets.presetJson' },
        ],
      },
    ],
  },
  {
    // 869exmkvu. The ability tag picker explains itself in its own help block;
    // the crew tag picker has none, and nothing explained the three filters
    // together.
    id: 'filters',
    entries: [
      {
        id: 'filterLabels',
        bullets: ['typesClasses', 'abilityTags', 'crewTags', 'counts', 'reading'],
        links: [{ key: 'autoTeamBuilder', route: '/tabs/auto-team-builder' }],
        quotes: [
          { scope: 'character-facet-filter', key: 'mode.any', in: 'bullets.typesClasses' },
          { scope: 'character-facet-filter', key: 'mode.all', in: 'bullets.typesClasses' },
          { scope: 'ability-tag-sets', key: 'formula.lead', in: 'bullets.reading' },
        ],
      },
    ],
  },
  {
    id: 'results',
    entries: [
      {
        // 869exmkfn.
        id: 'whenResultChanges',
        bullets: ['rules', 'pool', 'leaders', 'imports', 'dataset'],
        links: [{ key: 'autoTeamBuilder', route: '/tabs/auto-team-builder' }],
        quotes: [
          {
            scope: 'auto-team-builder',
            key: 'filters.allowAnyFriendCaptainAutoFill.toggle',
            in: 'bullets.leaders',
          },
        ],
      },
      {
        // 869exmkw1. Distinct from wrongSuggestion: this one is what the
        // search DOES when nothing fits, not how to read a team you dislike.
        id: 'fallbackAndLimits',
        bullets: ['order', 'whatBends', 'whatDoesNot', 'noTeam', 'guided'],
        links: [{ key: 'autoTeamBuilder', route: '/tabs/auto-team-builder' }],
        quotes: [
          { scope: 'auto-team-builder', key: 'report.states.relaxed', in: 'answer' },
          {
            scope: 'auto-team-builder',
            key: 'filters.guidedAutoBuild.toggle',
            in: 'bullets.guided',
          },
        ],
      },
      {
        // 869exmkvr. A checklist BEFORE saving, where wrongSuggestion is a
        // diagnosis after the fact.
        id: 'checkBeforeSaving',
        bullets: ['conditions', 'coverage', 'report', 'cost', 'compare'],
        links: [
          { key: 'autoTeamBuilder', route: '/tabs/auto-team-builder' },
          { key: 'savedTeams', route: '/tabs/saved-teams' },
        ],
        quotes: [
          {
            scope: 'captain-team-condition-status',
            key: 'title.fullDual',
            in: 'bullets.conditions',
          },
          {
            scope: 'captain-team-condition-status',
            key: 'title.partial',
            in: 'bullets.conditions',
          },
          { scope: 'captain-team-condition-status', key: 'title.none', in: 'bullets.conditions' },
          { scope: 'team-coverage-summary', key: 'title', in: 'bullets.coverage' },
          { scope: 'auto-team-builder', key: 'report.title', in: 'bullets.report' },
          { scope: 'auto-team-builder', key: 'compare.title', in: 'bullets.compare' },
        ],
      },
    ],
  },
  {
    id: 'problems',
    entries: [
      {
        // 869exmkgp.
        id: 'wrongSuggestion',
        bullets: ['report', 'whyPicked', 'editCharacter', 'debugReport'],
        links: [{ key: 'autoTeamBuilder', route: '/tabs/auto-team-builder' }],
        quotes: [
          { scope: 'auto-team-builder', key: 'report.title', in: 'answer' },
          { scope: 'auto-team-builder', key: 'report.states.passed', in: 'answer' },
          { scope: 'auto-team-builder', key: 'report.states.relaxed', in: 'answer' },
          { scope: 'auto-team-builder', key: 'report.states.notApplicable', in: 'answer' },
          {
            scope: 'auto-team-builder',
            key: 'results.explanations.title',
            in: 'bullets.whyPicked',
          },
          { scope: 'auto-team-builder', key: 'report.title', in: 'bullets.report' },
          {
            scope: 'auto-team-builder',
            key: 'results.explanations.rejectedTitle',
            in: 'bullets.whyPicked',
          },
          { scope: 'auto-team-builder', key: 'debugReport.copyAction', in: 'bullets.debugReport' },
        ],
      },
      {
        // 869exmkgy.
        id: 'dataUpdates',
        bullets: ['where', 'signal', 'reporting'],
        links: [{ key: 'settings', route: '/tabs/settings' }],
        quotes: [{ scope: 'settings', key: 'about.title', in: 'bullets.where' }],
      },
    ],
  },
];

/**
 * Every translation key the page will ask for, in page order. The spec reads
 * this instead of re-deriving the shape, so a key the template builds and the
 * spec checks can never drift apart.
 */
export function listFaqTranslationKeys(
  sections: readonly FaqSection[] = FAQ_SECTIONS,
): readonly string[] {
  const keys = ['eyebrow', 'title', 'summary'];

  for (const section of sections) {
    keys.push(`sections.${section.id}.title`);

    for (const entry of section.entries) {
      keys.push(`entries.${entry.id}.question`, `entries.${entry.id}.answer`);
      keys.push(...entry.bullets.map((bullet) => `entries.${entry.id}.bullets.${bullet}`));
      keys.push(...entry.links.map((link) => `entries.${entry.id}.links.${link.key}`));
    }
  }

  return keys;
}
