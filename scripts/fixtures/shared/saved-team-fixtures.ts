export interface SharedSavedTeamFixture {
  id: string;
  name: string;
  slots: Array<number | null>;
  shipId: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SharedSavedTeamsTransferPayload {
  schemaVersion: 1;
  source: 'saved-teams';
  exportedAt: string;
  teams: SharedSavedTeamFixture[];
}

export interface SharedSavedTeamSharePayload {
  schemaVersion: 1;
  source: 'saved-team-share';
  exportedAt: string;
  team: SharedSavedTeamFixture;
}

export const SHARED_FIXTURE_EXPORTED_AT = '2026-06-25T00:00:00.000Z';

export const SEEDED_SAVED_TEAM_FIXTURE_KEYS = [
  'regressionCrewA',
  'regressionCrewB',
] as const;

export type SharedSavedTeamFixtureKey =
  | (typeof SEEDED_SAVED_TEAM_FIXTURE_KEYS)[number]
  | 'importedCrew';

const SAVED_TEAM_FIXTURES: Record<SharedSavedTeamFixtureKey, SharedSavedTeamFixture> = {
  regressionCrewA: {
    id: 'e2e-regression-crew-a',
    name: 'E2E Regression Crew A',
    slots: [5056, 4551, 4520, 4408, 4267, null],
    shipId: null,
    notes: 'Seeded by browser regression tests.',
    createdAt: SHARED_FIXTURE_EXPORTED_AT,
    updatedAt: SHARED_FIXTURE_EXPORTED_AT,
  },
  regressionCrewB: {
    id: 'e2e-regression-crew-b',
    name: 'E2E Regression Crew B',
    slots: [4265, 4090, 5056, null, null, null],
    shipId: null,
    notes: 'Second seeded team for compare source selection.',
    createdAt: SHARED_FIXTURE_EXPORTED_AT,
    updatedAt: SHARED_FIXTURE_EXPORTED_AT,
  },
  importedCrew: {
    id: 'e2e-imported-crew',
    name: 'E2E Imported Crew',
    slots: [4090, 4265, 4520, null, null, null],
    shipId: null,
    notes: 'Imported by browser regression tests.',
    createdAt: SHARED_FIXTURE_EXPORTED_AT,
    updatedAt: SHARED_FIXTURE_EXPORTED_AT,
  },
};

export function buildSavedTeamFixture(
  key: SharedSavedTeamFixtureKey,
): SharedSavedTeamFixture {
  return cloneSavedTeam(SAVED_TEAM_FIXTURES[key]);
}

export function buildSeededSavedTeamFixtures(): SharedSavedTeamFixture[] {
  return SEEDED_SAVED_TEAM_FIXTURE_KEYS.map((key) => buildSavedTeamFixture(key));
}

export function buildSavedTeamsTransferPayload(
  teams: SharedSavedTeamFixture[],
  exportedAt = SHARED_FIXTURE_EXPORTED_AT,
): SharedSavedTeamsTransferPayload {
  return {
    schemaVersion: 1,
    source: 'saved-teams',
    exportedAt,
    teams: teams.map(cloneSavedTeam),
  };
}

export function buildSavedTeamsTransferJson(teams: SharedSavedTeamFixture[]): string {
  return JSON.stringify(buildSavedTeamsTransferPayload(teams), null, 2);
}

export function buildSavedTeamSharePayload(
  team: SharedSavedTeamFixture,
  exportedAt = SHARED_FIXTURE_EXPORTED_AT,
): SharedSavedTeamSharePayload {
  return {
    schemaVersion: 1,
    source: 'saved-team-share',
    exportedAt,
    team: cloneSavedTeam(team),
  };
}

export function buildSavedTeamShareCode(team: SharedSavedTeamFixture): string {
  return Buffer.from(JSON.stringify(buildSavedTeamSharePayload(team)), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
}

export function buildSavedTeamShareUrl(
  team: SharedSavedTeamFixture,
  origin = 'http://127.0.0.1:4200',
): string {
  const url = new URL('/tabs/manual-team-builder', origin);
  url.searchParams.set('teamShare', buildSavedTeamShareCode(team));

  return url.toString();
}

function cloneSavedTeam(team: SharedSavedTeamFixture): SharedSavedTeamFixture {
  return {
    ...team,
    slots: [...team.slots],
  };
}
