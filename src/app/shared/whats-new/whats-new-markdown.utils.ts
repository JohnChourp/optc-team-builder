/**
 * The two pieces of inline markdown the release entries actually use.
 *
 * 869f13gam. `CLAUDE.md`'s "Every release writes its own What's New entry" REQUIRES
 * the bold - "Say WHERE it happened… **Captain Coverage**, the **filter bar**" - and
 * the modal rendered every entry as plain text, so a player read literal asterisks:
 *
 *   The **Settings** screen has a new **Recent problems on this device** section.
 *
 * A documented rule mandated a syntax the only screen that displays it could not
 * render. Seen on the emulator at v0.6.3; v0.6.0 shipped the day before with the
 * same, so it had been arriving at players for as long as the rule had existed.
 *
 * WHY THIS RETURNS TOKENS AND NOT AN HTML STRING. The obvious fix is to build
 * `<strong>…</strong>` and bind it with `[innerHTML]`. That works, and it makes
 * correctness depend on getting the escaping right every time. This returns a token
 * list the template renders structurally, so no HTML string is ever constructed and
 * Angular's default escaping applies to every character. The injection path is
 * closed by construction rather than by care.
 *
 * That is not theoretical here. Four live strings contain `<class>` - a placeholder
 * a player is meant to READ, from an entry about orb-boost wording:
 *
 *   boosts chances of <class> characters getting … orbs
 *
 * Bound through `[innerHTML]`, the browser parses `<class>` as an unknown element and
 * the player sees NOTHING where the placeholder should be. Tokens render it as text.
 *
 * MEASURED 2026-09-22, against 202 entries and 1,980 string literals:
 *
 *   `**bold**`   371 occurrences, in  33 entries
 *   `` `code` ``   2 occurrences, in   1 entry
 *   italics, links, headings, strikethrough, HTML entities:  0
 *   literals with an unbalanced `**`:                        0
 *
 * So the subset is not a guess about what markdown might appear - it is the whole of
 * what does. The other 169 entries predate the voice rule and contain no markup at
 * all, which is why they were never visibly broken.
 *
 * A markdown library would be several orders of magnitude more code than this, would
 * bring its own escaping decisions to a player-facing surface, and would support a
 * syntax nobody writes here. Anything beyond these two is rendered as the literal
 * text it is, which is the right failure: a player sees what was written rather than
 * nothing.
 */

/** A run of text with the marks that apply to it. Both can be true at once. */
export interface InlineToken {
  readonly text: string;
  readonly bold: boolean;
  readonly code: boolean;
}

const BOLD = '**';
const CODE = '`';

/**
 * Splits a player-facing string into styled runs.
 *
 * Deliberately total: every input produces output, and an input with no markup
 * produces exactly one plain token. There is no error path, because the alternative
 * to rendering a malformed entry is showing a player nothing.
 *
 * `insideBold` is how nesting is bounded. Code spans may appear inside bold - that is
 * the "both at once" case - but bold inside bold is not a thing in markdown and
 * allowing the recursion would be a way to loop on crafted input.
 */
export function tokenizeInlineMarkdown(source: string, insideBold = false): InlineToken[] {
  const tokens: InlineToken[] = [];
  let plain = '';
  let index = 0;

  const flush = (): void => {
    if (plain) {
      tokens.push({ text: plain, bold: insideBold, code: false });
      plain = '';
    }
  };

  while (index < source.length) {
    if (source.startsWith(CODE, index)) {
      const close = source.indexOf(CODE, index + CODE.length);

      /*
       * `close > index + 1` rejects an EMPTY span as well as an unclosed one. An
       * empty `` `` `` is far more likely to be two literal backticks in prose than
       * an intentional empty code span, and rendering it as an empty <code> would
       * lose both characters.
       */
      if (close > index + CODE.length) {
        flush();
        tokens.push({ text: source.slice(index + CODE.length, close), bold: insideBold, code: true });
        index = close + CODE.length;
        continue;
      }
    }

    if (!insideBold && source.startsWith(BOLD, index)) {
      const close = source.indexOf(BOLD, index + BOLD.length);

      /* Same reasoning, and it is also what makes a bare `****` render literally. */
      if (close > index + BOLD.length) {
        flush();
        tokens.push(...tokenizeInlineMarkdown(source.slice(index + BOLD.length, close), true));
        index = close + BOLD.length;
        continue;
      }
    }

    /*
     * Falling through is the whole unbalanced-marker story: an opener with no closer
     * is copied out character by character, so `**Settings` reads as `**Settings`
     * rather than vanishing or swallowing the rest of the sentence.
     */
    plain += source[index];
    index += 1;
  }

  flush();

  return tokens;
}
