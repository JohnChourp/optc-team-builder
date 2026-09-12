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

export interface FaqEntry {
  /** Stable id: the key segment under `entries`, and the accordion value. */
  readonly id: string;
  /** Key segments under `entries.<id>.bullets`, in display order. */
  readonly bullets: readonly string[];
  readonly links: readonly FaqLink[];
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
      },
      {
        // 869exmkgy.
        id: 'dataUpdates',
        bullets: ['where', 'signal', 'reporting'],
        links: [{ key: 'settings', route: '/tabs/settings' }],
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
