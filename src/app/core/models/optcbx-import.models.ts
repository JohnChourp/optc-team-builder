export interface OptcbxParsedImport {
  importedNumbers: number[];
  duplicatesRemoved: number;
}

export interface OptcbxImportResult {
  importedNumbers: number[];
  matchedIds: number[];
  unmatchedIds: number[];
  duplicatesRemoved: number;
  addedCount: number;
  alreadyFavoritedCount: number;
  /**
   * 869f26084. Favourites this import did NOT mention - the other direction of the comparison the
   * import has always performed and only ever reported one half of.
   *
   * Every path that grows this list is additive: `mergeFavoriteIds` unions, and every Character
   * Boxes call site spreads the current ids. So the list only ever grew, and the staleness that
   * accumulated was units the reader no longer owns - which re-importing could not fix, because
   * the import unions too.
   *
   * **Never applied automatically.** An import that silently deletes is worse than one that only
   * adds, because the reader cannot tell a deletion from a matching failure.
   */
  removableIds: number[];
  /**
   * Favourites that no longer resolve to a character in the shipped dataset.
   *
   * Deliberately counted and deliberately NOT offered for removal. A favourite we cannot resolve
   * is evidence about our own dataset, not about what the reader owns - it means the character
   * left the dataset, and removing it would be us deleting the reader's data to cover our gap.
   */
  unresolvedFavoriteCount: number;
}
