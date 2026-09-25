/**
 * 869f6td2q. The ONE order "Name A→Z" and "Name Z→A" mean, wherever a list of characters is sorted.
 *
 * The SQL path sorts with `COLLATE NOCASE` (`buildDetailedCharacterOrderByClause` in
 * `optc-repository.service.ts`), and it is what Character Boxes uses while the reader has no local
 * character override. Every in-memory path sorted with `localeCompare(..., { sensitivity: 'base' })`
 * instead - the Characters screen, Captain Coverage, and Character Boxes itself the moment the
 * reader saves one override. Over the shipped roster the two disagreed on **1,063 of 4,622**
 * positions (measured 2026-09-24): the collator weighs `&`, `-`, `:`, `'` and `"` differently from a
 * byte compare, so the same list reordered itself as soon as the path serving it changed.
 *
 * The fix is to make the in-memory paths do exactly what SQLite does, not the other way round:
 *
 *  - `NOCASE` folds the 26 ASCII capitals and nothing else, then compares the UTF-8 bytes. A UTF-8
 *    byte compare is a code-point compare, so this folds `A`-`Z` and compares code points.
 *  - UTF-16 code units are NOT in code-point order above U+D7FF: a surrogate pair (U+10000 and up)
 *    starts with `0xD800`-`0xDBFF` and would sort BEFORE `U+E000`-`U+FFFF`. `toCodePointOrder` moves
 *    the surrogates above that range, which is the standard fix-up, so an emoji in a name typed into
 *    a local override sorts where SQLite would put it.
 *
 * `Intl.Collator` is not the answer here, on purpose. Sort order does not follow the interface
 * language (`docs/locale-behaviour.md`, "Sort order", an owner-recorded decision): the names are
 * Latin-script community names whatever the language, and a collator would also be exactly what
 * the locale guard's Rule D exists to catch. This comparator has no locale to get wrong.
 *
 * Ties (names equal under NOCASE, e.g. differing only in case) return 0; every caller breaks them by
 * id, exactly as the SQL `ORDER BY name COLLATE NOCASE, id` does.
 */
export function compareCharacterNamesNoCase(left: string, right: string): number {
  const length = Math.min(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const leftUnit = toCodePointOrder(foldAsciiUpperCase(left.charCodeAt(index)));
    const rightUnit = toCodePointOrder(foldAsciiUpperCase(right.charCodeAt(index)));

    if (leftUnit !== rightUnit) {
      return leftUnit - rightUnit;
    }
  }

  return left.length - right.length;
}

/** `A`-`Z` to `a`-`z`; every other code unit, accented capitals included, is left alone. */
function foldAsciiUpperCase(unit: number): number {
  return unit >= 0x41 && unit <= 0x5a ? unit + 0x20 : unit;
}

function toCodePointOrder(unit: number): number {
  if (unit >= 0xe000) {
    return unit - 0x800;
  }

  if (unit >= 0xd800) {
    return unit + 0x2000;
  }

  return unit;
}
