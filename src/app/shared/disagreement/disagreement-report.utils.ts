/**
 * What a player sends when the app is wrong about a character.
 *
 * 869f13gb3. This app is unusually good at explaining itself - a decisive reason per
 * rejected candidate, Passed / Relaxed / Not applicable per rule, a copyable debug
 * report - and had no path at all for the step after: the player knows a character
 * has an ability the filter did not find.
 *
 * That signal is the most valuable correction available here, because the data is
 * derived: a parser turns upstream prose into tags, and the only people who can see
 * a tag is wrong are the people who play the character. Until now it had nowhere to
 * go. Local overrides exist, but an override is a private workaround - it fixes one
 * device and tells the maintainer nothing.
 *
 * ASSEMBLED, NOT TYPED. Everything the app knows about the disagreement goes in
 * without the player transcribing it: which character, what the app currently
 * derived, the app version, the dataset version and revision, the interface
 * language. The one thing the app cannot know - what they expected instead - is a
 * labelled blank line, because inventing it would be worse than asking.
 *
 * There is no backend and this deliberately does not add one. The report goes to the
 * clipboard and the player pastes it wherever they already contact us, which is the
 * same shape as the diagnostics export and the Auto Team Builder debug report.
 *
 * NOT an error report. `error-log.service.ts` owns crashes; this owns correctness,
 * and the two answer different questions. Keeping them apart is deliberate: a
 * crash log with opinions in it is useless for both.
 */

export interface DisagreementReportInput {
  readonly characterId: number;
  readonly characterName: string;
  /** What the app currently derived for this character - the tags a player disputes. */
  readonly derivedTags: readonly string[];
  readonly appVersion: string;
  /** From `optc-manifest.json`, so the maintainer can tell whether a fix had shipped. */
  readonly datasetSourceVersion: string | null;
  readonly datasetGeneratedOn: string | null;
  readonly language: string;
  /** Injected so the report is reproducible in a test rather than time-dependent. */
  readonly generatedAt: string;
}

/** The line the player fills in. Labelled in English: the report is read by us. */
const EXPECTED_PLACEHOLDER = '(describe what you expected instead)';

/**
 * The cap exists because a character can carry a long tag list and a report nobody
 * can read in a message box gets truncated by the medium instead - silently, and in
 * the middle. Cutting it here says so.
 */
const MAX_TAGS = 40;

export function buildDisagreementReport(input: DisagreementReportInput): string {
  const tags = [...input.derivedTags];
  const shown = tags.slice(0, MAX_TAGS);
  const overflow = tags.length - shown.length;

  const lines = [
    'OPTC Team Builder - something looks wrong',
    '',
    `Character:       ${input.characterName} (#${input.characterId})`,
    `What I expected: ${EXPECTED_PLACEHOLDER}`,
    '',
    'What the app derived:',
    ...(shown.length ? shown.map((tag) => `  - ${tag}`) : ['  (nothing)']),
    ...(overflow > 0 ? [`  ... and ${overflow} more`] : []),
    '',
    `App version:     ${input.appVersion}`,
    `Dataset:         ${input.datasetSourceVersion ?? 'unknown'}${
      input.datasetGeneratedOn ? ` (generated ${input.datasetGeneratedOn})` : ''
    }`,
    `Language:        ${input.language}`,
    `Reported:        ${input.generatedAt}`,
  ];

  return lines.join('\n');
}
