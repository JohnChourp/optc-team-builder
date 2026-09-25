/**
 * 869f63gkm. What a character search compares: words, not punctuation.
 *
 * Every character search was a plain substring test over lower-cased text, so the punctuation had
 * to be typed exactly as the dataset spells it. Measured 2026-09-23: "Monkey D Luffy" found 0 cards
 * against 115 for "Monkey D. Luffy", "Portgas D Ace" 0 against 40, "Mr 1" 0 against 10 - and 326
 * cards carry a dotted abbreviation (`D.` 201, `Mr.` 57, `Dr.` 41). The one name outside ASCII,
 * `Usopp-un - Hercules’ Student`, could not be found with the apostrophe a keyboard types at all.
 *
 * So both sides of every comparison - the query and the text searched - go through
 * `normalizeCharacterSearchText`, which keeps what a player means and drops what they would have
 * to guess:
 *
 *  - case is ignored, as before;
 *  - an apostrophe JOINS the letters around it (`Lion's` and `Lions` both read `lions`) - it sits
 *    inside a word, and nobody types `lion s`;
 *  - every other run of punctuation, symbols and spaces is ONE word break (`D.`, `-`, `&`, `:`,
 *    `/`, a double space), so `Monkey D Luffy`, `monkey d. luffy` and `Monkey  D.Luffy` agree.
 *
 * Applying the same function to both sides is what makes it safe: if the typed text was found
 * before, its normalised form is still found in the normalised text, because every rule above
 * maps a substring to a substring. A search can only find MORE than it did, never less.
 *
 * The one query that would lose its meaning is one with no letter or digit at all - `&`, which
 * a player can use to list every paired card. Normalised it would be empty and match everything,
 * so it is compared as typed instead, exactly as before (`CharacterSearchTerm.literal`).
 *
 * The SQL path cannot call this module, so the loader registers the same function with SQLite
 * under `CHARACTER_SEARCH_TEXT_SQL_FUNCTION` on both of its paths (see
 * `services/dataset-database-loader.utils.ts`), and the repository's `LIKE` compares normalised text.
 *
 * Kept free of any dataset column on purpose: a later `search_aliases` column (community names -
 * a separate change) is meant to go through this same function, so an alias and a name can never
 * be searched by two different rules. That is also why it lives in `grammar/`: it keeps the three
 * constraints `captain-boost-grammar.ts` documents (import-free, erasable syntax only, the
 * `package.json` beside it), so a Node script loads this very file rather than a copy of it -
 * `scripts/benchmark-dataset.mjs` already does, to time the search the app really runs, and the
 * importer can when it writes that column.
 */

/** `'`, `‘`, `’`, `ʼ`, `` ` `` and `´`: every apostrophe a keyboard or the dataset produces. */
const APOSTROPHES = /['\u2018\u2019\u02bc`\u00b4]/gu;
/** Anything that is not a letter, a digit or a mark that belongs to a letter. */
const WORD_BREAKS = /[^\p{L}\p{N}\p{M}]+/gu;

/** The name SQLite knows `normalizeCharacterSearchText` by. */
export const CHARACTER_SEARCH_TEXT_SQL_FUNCTION = 'optc_search_text';

export function normalizeCharacterSearchText(value: string): string {
  return value.toLowerCase().replace(APOSTROPHES, '').replace(WORD_BREAKS, ' ').trim();
}

export interface CharacterSearchTerm {
  /** The query as words: what every text it is compared with is normalised to as well. */
  readonly normalized: string;
  /**
   * The query as typed, trimmed and lower-cased. Only used when `normalized` is empty - a query
   * made of nothing but punctuation - so `&` still finds the cards with an `&` in their name.
   */
  readonly literal: string;
}

/** The term to search for, or `null` when the query asks for nothing. */
export function toCharacterSearchTerm(query: string | null | undefined): CharacterSearchTerm | null {
  const literal = String(query ?? '')
    .trim()
    .toLowerCase();

  if (!literal.length) {
    return null;
  }

  return { normalized: normalizeCharacterSearchText(literal), literal };
}

/**
 * Whether a character's searchable text contains the term.
 *
 * `text` is the raw text. A caller that searches the same text on every keystroke (the catalogue
 * cache) keeps it normalised once instead, and compares it with `term.normalized` itself.
 */
export function matchesCharacterSearchTerm(text: string, term: CharacterSearchTerm): boolean {
  return term.normalized.length
    ? normalizeCharacterSearchText(text).includes(term.normalized)
    : text.toLowerCase().includes(term.literal);
}
