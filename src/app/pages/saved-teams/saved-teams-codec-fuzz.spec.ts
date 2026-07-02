import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { type SavedTeam } from '../../core/models/optc.models';
import {
  SAVED_TEAM_SHARE_SOURCE,
  type SavedTeamsImportDiagnosticCode,
  SavedTeamsImportError,
  buildSavedTeamShareCode,
  buildSavedTeamSharePayload,
  buildSavedTeamShareUrl,
  buildSavedTeamsTransferPayload,
  decodeSavedTeamShareCode,
  parseSavedTeamsImportContent,
  parseSavedTeamsImportPayload,
  resolveSavedTeamFromShareInput,
  sanitizeSavedTeamsImportPayload,
  type SavedTeamsTransferPayload,
} from './saved-teams-transfer.utils';

interface CodecFuzzCorpus {
  exportedAt: string;
  validTeams: SavedTeam[];
  legacyPayloads: CorpusPayloadCase[];
  mutationPayloads: CorpusPayloadCase[];
  malformedImportContents: CorpusMalformedCase[];
  shareInputForms: ShareInputForm[];
}

interface CorpusPayloadCase {
  label: string;
  payload: unknown;
  expectedInvalidTeamCount: number;
  expectedDuplicateIdCount: number;
}

interface CorpusMalformedCase {
  label: string;
  raw: string;
  diagnosticCode: SavedTeamsImportDiagnosticCode;
  forbiddenFragments: string[];
}

type ShareInputForm = 'raw-code' | 'query-string' | 'absolute-url' | 'relative-url';

const CORPUS = readCorpus();
const GENERATED_TEAM_COUNT = 64;
const SANITIZE_OPTIONS = {
  now: '2026-07-02T12:00:00.000Z',
  untitledTeamName: 'Untitled Crew',
};

describe('Saved team codec fuzz invariants', () => {
  it('round-trips corpus and generated transfer payloads through JSON import', () => {
    for (const team of [...CORPUS.validTeams, ...buildGeneratedTeams()]) {
      const payload = buildSavedTeamsTransferPayload([team], CORPUS.exportedAt);
      const parsed = parseSavedTeamsImportContent(JSON.stringify(payload));
      const sanitized = sanitizeSavedTeamsImportPayload(parsed, SANITIZE_OPTIONS);

      expect(parsed).toEqual(payload);
      expect(sanitized.invalidTeamCount).toBe(0);
      expect(sanitized.duplicateIdCount).toBe(0);
      expect(sanitized.teams).toEqual([team]);
      expectSavedTeamInvariants(sanitized.teams[0]);
    }
  });

  it('round-trips share payloads through raw code, query string, and URL inputs', () => {
    for (const team of [CORPUS.validTeams[2]!, ...buildGeneratedTeams().slice(0, 12)]) {
      const sharePayload = buildSavedTeamSharePayload(team, CORPUS.exportedAt);
      const shareCode = buildSavedTeamShareCode(team, CORPUS.exportedAt);

      expect(decodeSavedTeamShareCode(shareCode)).toEqual(sharePayload);

      for (const form of CORPUS.shareInputForms) {
        const parsed = parseSavedTeamsImportContent(buildShareInput(form, team, shareCode));
        const sanitized = sanitizeSavedTeamsImportPayload(parsed, SANITIZE_OPTIONS);

        expect(parsed).toMatchObject({
          exportedAt: CORPUS.exportedAt,
          source: 'saved-teams',
          teams: [expect.objectContaining({ id: team.id })],
        });
        expect(sanitized.invalidTeamCount).toBe(0);
        expect(sanitized.teams).toEqual([team]);
        expectSavedTeamInvariants(sanitized.teams[0]);
      }
    }
  });

  it('repairs legacy and mutated payloads without violating saved-team invariants', () => {
    for (const corpusCase of [...CORPUS.legacyPayloads, ...CORPUS.mutationPayloads]) {
      const payload = parseSavedTeamsImportPayload(JSON.stringify(corpusCase.payload));
      const sanitized = sanitizeSavedTeamsImportPayload(payload, SANITIZE_OPTIONS);

      expect(sanitized.invalidTeamCount, corpusCase.label).toBe(
        corpusCase.expectedInvalidTeamCount,
      );
      expect(sanitized.duplicateIdCount, corpusCase.label).toBe(
        corpusCase.expectedDuplicateIdCount,
      );
      expect(sanitized.teams.length, corpusCase.label).toBeGreaterThan(0);
      sanitized.teams.forEach(expectSavedTeamInvariants);
    }
  });

  it('keeps the canonical v1 transfer fixture on the focused codec route', () => {
    const payload = parseSavedTeamsImportPayload(readFixture('saved-teams-v1.json'));
    const sanitized = sanitizeSavedTeamsImportPayload(payload, SANITIZE_OPTIONS);

    expect(payload.schemaVersion).toBe(1);
    expect(payload.source).toBe('saved-teams');
    expect(sanitized.invalidTeamCount).toBe(0);
    expect(sanitized.duplicateIdCount).toBe(0);
    expect(sanitized.teams.length).toBeGreaterThan(0);
    sanitized.teams.forEach(expectSavedTeamInvariants);
  });

  it('keeps duplicate ids last-write-wins after repair', () => {
    const legacyCase = CORPUS.legacyPayloads[0]!;
    const mutationCase = CORPUS.mutationPayloads[0]!;

    expect(sanitizeCorpusPayload(legacyCase).teams).toEqual([
      {
        id: 'legacy-one',
        name: 'Last Duplicate Wins',
        slots: [404, 505, null, null, null, null],
        shipId: 9002,
        notes: 'duplicate replacement',
        createdAt: '2026-07-02T02:00:00.000Z',
        updatedAt: '2026-07-02T03:00:00.000Z',
      },
    ]);
    expect(sanitizeCorpusPayload(mutationCase).teams).toEqual([
      {
        id: 'boundary-team',
        name: 'Boundary Replacement',
        slots: [6, 5, 4, 3, 2, 1],
        shipId: 321,
        notes: 'replacement',
        createdAt: '2026-07-02T05:00:00.000Z',
        updatedAt: '2026-07-02T06:00:00.000Z',
      },
    ]);
  });

  it('classifies malformed inputs without leaking payload contents', () => {
    for (const corpusCase of CORPUS.malformedImportContents) {
      expectSafeImportError(
        () => parseSavedTeamsImportContent(corpusCase.raw),
        corpusCase.diagnosticCode,
        [corpusCase.raw, ...corpusCase.forbiddenFragments],
      );
    }

    expectSafeImportError(
      () => parseSavedTeamsImportContent(toBase64Url('{"source":')),
      'SAVED_TEAMS_INVALID_SHARE_JSON',
      ['{"source":'],
    );

    const invalidSharePayload = {
      schemaVersion: 1,
      source: SAVED_TEAM_SHARE_SOURCE,
      exportedAt: CORPUS.exportedAt,
      team: null,
      hiddenTeamName: 'Hidden Share Crew',
      hiddenNotes: 'Hidden Share Notes',
    };

    expectSafeImportError(
      () => parseSavedTeamsImportContent(toBase64Url(JSON.stringify(invalidSharePayload))),
      'SAVED_TEAMS_INVALID_SHARE_PAYLOAD',
      ['Hidden Share Crew', 'Hidden Share Notes'],
    );

    const noImportableShareCode = buildSavedTeamShareCode(
      {
        ...CORPUS.validTeams[0]!,
        id: '',
        name: 'Hidden No Import Crew',
        notes: 'Hidden No Import Notes',
      },
      CORPUS.exportedAt,
    );

    expectSafeImportError(
      () => resolveSavedTeamFromShareInput(noImportableShareCode, SANITIZE_OPTIONS),
      'SAVED_TEAMS_NO_IMPORTABLE_TEAM',
      [noImportableShareCode, 'Hidden No Import Crew', 'Hidden No Import Notes'],
    );
  });
});

function readCorpus(): CodecFuzzCorpus {
  return JSON.parse(readFixture('saved-team-codec-fuzz-corpus.json')) as CodecFuzzCorpus;
}

function readFixture(fileName: string): string {
  return readFileSync(resolve(process.cwd(), 'scripts/fixtures/data', fileName), 'utf8');
}

function buildGeneratedTeams(): SavedTeam[] {
  return Array.from({ length: GENERATED_TEAM_COUNT }, (_, seed) => buildGeneratedTeam(seed));
}

function buildGeneratedTeam(seed: number): SavedTeam {
  const day = String((seed % 28) + 1).padStart(2, '0');
  const hour = String(seed % 24).padStart(2, '0');
  const minute = String((seed * 7) % 60).padStart(2, '0');
  const timestamp = `2026-07-${day}T${hour}:${minute}:00.000Z`;

  return {
    id: `fuzz-team-${seed}`,
    name: seed % 8 === 0 ? `Fuzz \u039a\u03b1\u03bb\u03b7\u03bc\u03b5\u03c1\u03b1 ${seed}` : `Fuzz Crew ${seed}`,
    notes: seed % 6 === 0 ? `Generated note \u2713 ${seed}` : `Generated note ${seed}`,
    shipId: seed % 5 === 0 ? null : seed + 1000,
    slots: Array.from({ length: 6 }, (_, slotIndex) =>
      (seed + slotIndex) % 4 === 0 ? null : seed * 100 + slotIndex + 1,
    ),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildShareInput(form: ShareInputForm, team: SavedTeam, shareCode: string): string {
  switch (form) {
    case 'raw-code':
      return shareCode;
    case 'query-string':
      return `?teamShare=${shareCode}`;
    case 'absolute-url':
      return buildSavedTeamShareUrl(team, 'https://optcteambuilder.com', CORPUS.exportedAt);
    case 'relative-url':
      return `/tabs/manual-team-builder?teamShare=${shareCode}`;
  }
}

function sanitizeCorpusPayload(corpusCase: CorpusPayloadCase) {
  const payload = parseSavedTeamsImportPayload(
    JSON.stringify(corpusCase.payload),
  ) as SavedTeamsTransferPayload;

  return sanitizeSavedTeamsImportPayload(payload, SANITIZE_OPTIONS);
}

function expectSavedTeamInvariants(team: SavedTeam | undefined): void {
  expect(team).toBeDefined();
  if (!team) {
    return;
  }

  expect(team.id.trim()).toBe(team.id);
  expect(team.id.length).toBeGreaterThan(0);
  expect(team.name.trim()).toBe(team.name);
  expect(team.name.length).toBeGreaterThan(0);
  expect(team.slots).toHaveLength(6);
  expect(
    team.slots.every((slotId) => slotId === null || (Number.isInteger(slotId) && slotId > 0)),
  ).toBe(true);
  expect(team.shipId === null || (Number.isInteger(team.shipId) && team.shipId > 0)).toBe(true);
  expect(Number.isNaN(Date.parse(team.createdAt))).toBe(false);
  expect(Number.isNaN(Date.parse(team.updatedAt))).toBe(false);
}

function expectSafeImportError(
  run: () => unknown,
  diagnosticCode: SavedTeamsImportDiagnosticCode,
  forbiddenFragments: string[],
): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(SavedTeamsImportError);
    expect(error).toMatchObject({ diagnosticCode });

    const serializedError = `${String(error)} ${JSON.stringify(error)}`;
    for (const fragment of forbiddenFragments.filter(Boolean)) {
      expect(serializedError).not.toContain(fragment);
    }
    return;
  }

  throw new Error(`Expected ${diagnosticCode} diagnostic`);
}

function toBase64Url(value: string): string {
  return globalThis.btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}
