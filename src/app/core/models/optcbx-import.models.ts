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
}
