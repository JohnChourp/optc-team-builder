export const RELEASE_CHECK_FIXTURE_FILE_NAMES = {
  manifestPath: 'local-manifest.json',
  seedPath: 'local-seed.sql',
  remoteVersionPath: 'remote-version.js',
  remoteUnitsPath: 'remote-units.js',
};

export const RELEASE_CHECK_REPLAY_FIXTURE_CASES = [
  {
    fixture: 'no-change',
    branch: 'no new upstream IDs',
    expectedResult: {
      releaseNeeded: false,
      reason: 'no-new-upstream-characters',
      localSourceVersion: '36',
      remoteSourceVersion: '36',
      localCharacterCount: 2,
      remoteCharacterCount: 2,
      newCharacterIds: [],
      newCharacterCount: 0,
    },
  },
  {
    fixture: 'new-character',
    branch: 'new upstream ID detected',
    expectedResult: {
      releaseNeeded: true,
      reason: 'new-upstream-characters',
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterCount: 2,
      remoteCharacterCount: 3,
      newCharacterIds: [3],
      newCharacterCount: 1,
    },
  },
  {
    fixture: 'active-release-running',
    branch: 'new upstream ID blocked by active release guard',
    expectedResult: {
      releaseNeeded: true,
      reason: 'new-upstream-characters',
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterCount: 2,
      remoteCharacterCount: 3,
      newCharacterIds: [3],
      newCharacterCount: 1,
    },
  },
  {
    fixture: 'upstream-shape-drift',
    branch: 'source and object shape drift with no new upstream IDs',
    expectedResult: {
      releaseNeeded: false,
      reason: 'no-new-upstream-characters',
      localSourceVersion: '36',
      remoteSourceVersion: '38',
      localCharacterCount: 2,
      remoteCharacterCount: 2,
      newCharacterIds: [],
      newCharacterCount: 0,
    },
  },
];

export const MALFORMED_RELEASE_CHECK_FIXTURE = 'error';
export const SOURCE_CONTRACT_BROKEN_RELEASE_CHECK_FIXTURE = 'source-contract-broken';

export const HISTORICAL_RELEASE_CHECK_BACKTEST_CORPUS = 'scripts/fixtures/release-check/history/corpus.json';
