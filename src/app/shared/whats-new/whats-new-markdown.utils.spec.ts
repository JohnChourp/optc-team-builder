import { describe, expect, it } from 'vitest';

import { WHATS_NEW_ENTRIES } from '../../core/data/whats-new.data';
import { type InlineToken, tokenizeInlineMarkdown } from './whats-new-markdown.utils';

/**
 * 869f13gam. The rule requires the bold and the screen could not render it, so every
 * correctly-written entry reached a player as literal asterisks.
 *
 * Two things these cases are built to prove, beyond "bold works":
 *
 *   - nothing is ever LOST. Every case asserts that concatenating the tokens' text
 *     reproduces the input minus exactly its consumed markers, because the failure
 *     mode that actually matters on this surface is a player seeing less than was
 *     written;
 *   - `<class>` survives. Four live strings contain it, and it is the case that
 *     would have quietly disappeared under an `[innerHTML]` implementation.
 */

const render = (tokens: readonly InlineToken[]): string => tokens.map((token) => token.text).join('');

describe('tokenizeInlineMarkdown', () => {
  it('leaves a string with no markup as a single plain token', () => {
    expect(tokenizeInlineMarkdown('Nothing changed on any screen.')).toEqual([
      { text: 'Nothing changed on any screen.', bold: false, code: false },
    ]);
  });

  it('marks a bold span and keeps the text either side', () => {
    expect(tokenizeInlineMarkdown('The **Settings** screen')).toEqual([
      { text: 'The ', bold: false, code: false },
      { text: 'Settings', bold: true, code: false },
      { text: ' screen', bold: false, code: false },
    ]);
  });

  it('marks a code span', () => {
    expect(tokenizeInlineMarkdown('like `2026-09-22T07:30:00.000Z`.')).toEqual([
      { text: 'like ', bold: false, code: false },
      { text: '2026-09-22T07:30:00.000Z', bold: false, code: true },
      { text: '.', bold: false, code: false },
    ]);
  });

  it('marks several spans in one string', () => {
    const tokens = tokenizeInlineMarkdown('**Character Boxes** showed `2026-01-01` in **Settings**');

    expect(tokens.filter((token) => token.bold).map((token) => token.text)).toEqual([
      'Character Boxes',
      'Settings',
    ]);
    expect(tokens.filter((token) => token.code).map((token) => token.text)).toEqual(['2026-01-01']);
  });

  /* "Both together", in the harder reading: a code span nested inside a bold one. */
  it('carries bold and code at once when code is nested inside bold', () => {
    const tokens = tokenizeInlineMarkdown('see **the `ngsw.json` file** now');

    expect(tokens).toEqual([
      { text: 'see ', bold: false, code: false },
      { text: 'the ', bold: true, code: false },
      { text: 'ngsw.json', bold: true, code: true },
      { text: ' file', bold: true, code: false },
      { text: ' now', bold: false, code: false },
    ]);
  });

  /*
   * The live case. `<class>` is a placeholder a player is meant to READ, and under
   * an [innerHTML] implementation the browser would parse it as an unknown element
   * and show nothing at all.
   */
  it('keeps angle brackets as text, which is why this returns tokens and not HTML', () => {
    const tokens = tokenizeInlineMarkdown('boosts chances of <class> characters getting orbs');

    expect(render(tokens)).toBe('boosts chances of <class> characters getting orbs');
    expect(tokens.every((token) => !token.bold && !token.code)).toBe(true);
  });

  it('keeps a script tag as text rather than as markup', () => {
    const hostile = '<script>alert(1)</script> and <img src=x onerror=alert(1)>';

    expect(render(tokenizeInlineMarkdown(hostile))).toBe(hostile);
    expect(render(tokenizeInlineMarkdown(`**${hostile}**`))).toBe(hostile);
  });

  describe('unbalanced and degenerate markers render literally rather than vanishing', () => {
    it('leaves an opener with no closer alone', () => {
      expect(render(tokenizeInlineMarkdown('The **Settings screen'))).toBe('The **Settings screen');
      expect(render(tokenizeInlineMarkdown('a `backtick and no closer'))).toBe(
        'a `backtick and no closer',
      );
    });

    it('leaves an empty span alone rather than eating its markers', () => {
      expect(render(tokenizeInlineMarkdown('a **** b'))).toBe('a **** b');
      expect(render(tokenizeInlineMarkdown('a `` b'))).toBe('a `` b');
    });

    it('leaves a lone marker alone', () => {
      for (const input of ['*', '**', '***', '`', '2 ** 8 is 256', 'a * b * c']) {
        expect(render(tokenizeInlineMarkdown(input))).toBe(input);
      }
    });

    /*
     * `**a **b** c**` is genuinely ambiguous and every renderer has to pick. Markers
     * pair left to right - first with second, third with fourth - which is what
     * CommonMark does for the simple case and, more importantly, is predictable from
     * reading the string. The assertion below is derived from running it rather than
     * guessed: the first draft of this case asserted that the whole thing came back
     * bold, and it does not.
     *
     * What matters either way is the invariant in the last expectation: no character
     * is lost, whichever pairing wins.
     */
    it('pairs markers left to right rather than nesting', () => {
      const tokens = tokenizeInlineMarkdown('**outer **inner** outer**');

      expect(tokens).toEqual([
        { text: 'outer ', bold: true, code: false },
        { text: 'inner', bold: false, code: false },
        { text: ' outer', bold: true, code: false },
      ]);
      expect(render(tokens)).toBe('outer inner outer');
    });

    it('returns nothing for an empty string', () => {
      expect(tokenizeInlineMarkdown('')).toEqual([]);
    });
  });

  /*
   * The guard against a silent regression in the DATA rather than in this function.
   * If somebody starts writing a syntax this does not implement, these entries are
   * where it will first reach a player - so the real corpus is the fixture.
   */
  describe('against the real changelog', () => {
    const strings = WHATS_NEW_ENTRIES.flatMap((entry) => [
      entry.headline.en,
      entry.headline.el,
      entry.summaryEn,
      entry.summaryEl,
      ...[...entry.added, ...entry.improved, ...entry.fixed].flatMap((item) => [item.en, item.el]),
    ]);

    /*
     * Prove the sample is non-empty before trusting anything below it. The count is
     * of STRINGS THAT CONTAIN bold, not of bold occurrences - measured 2026-09-22
     * those are 170 and 371 respectively, and an earlier draft of this assertion
     * conflated them and failed.
     */
    it('has a non-empty sample, and one that actually contains bold', () => {
      expect(strings.length).toBeGreaterThan(1500);
      expect(strings.filter((value) => value.includes('**')).length).toBeGreaterThan(100);
    });

    /*
     * The invariant, stated so it cannot be wrong about WHICH markers get consumed.
     *
     * An earlier draft computed the expectation as `value.replaceAll('**','')` and
     * broke the moment an entry quoted `**Settings**` inside a code span - where the
     * asterisks are content and only the backticks are consumed. Re-deriving which
     * marker is consumed where would mean re-implementing the tokenizer inside its
     * own test, which proves nothing.
     *
     * So: ignoring every marker character on both sides, nothing else may change.
     * That catches a dropped, duplicated or reordered character without taking any
     * position on marker handling - and the exact check below it still holds the
     * tighter line for the 1,900-odd strings with no code span at all.
     */
    it('loses no character of any entry, whichever markers it consumes', () => {
      const withoutMarkers = (value: string): string => value.replaceAll('*', '').replaceAll('`', '');

      for (const value of strings) {
        expect(withoutMarkers(render(tokenizeInlineMarkdown(value)))).toBe(withoutMarkers(value));
      }
    });

    it('consumes exactly the bold markers when an entry has no code span', () => {
      for (const value of strings.filter((entry) => !entry.includes('`'))) {
        expect(render(tokenizeInlineMarkdown(value))).toBe(value.replaceAll('**', ''));
      }
    });

    /*
     * Markers inside a CODE span are literal by design, and the v0.6.4 entry relies
     * on exactly that: it illustrates the old behaviour by quoting `**Settings**`,
     * and had to, because writing it bare made the entry render "Settings instead of
     * Settings". An earlier draft of this assertion forbade that and would have
     * blocked the only honest way to write the note.
     */
    it('leaves no stray marker inside a rendered token, outside code spans', () => {
      for (const value of strings) {
        for (const token of tokenizeInlineMarkdown(value)) {
          if (token.code) {
            continue;
          }

          expect(token.text).not.toContain('**');
        }
      }
    });

    it('keeps markers literal inside a code span, which the v0.6.4 entry depends on', () => {
      const tokens = tokenizeInlineMarkdown('you were reading `**Settings**` instead of Settings');

      expect(tokens).toEqual([
        { text: 'you were reading ', bold: false, code: false },
        { text: '**Settings**', bold: false, code: true },
        { text: ' instead of Settings', bold: false, code: false },
      ]);
    });
  });
});
