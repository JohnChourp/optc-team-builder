import { describe, expect, it } from 'vitest';

import {
  type AutoBuildResult,
  type AutoBuildSlotExplanation,
} from '../../core/models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../../core/models/optc.models';
import {
  AUTO_TEAM_DEBUG_REPORT_SCHEMA,
  AUTO_TEAM_DEBUG_REPORT_SCHEMA_VERSION,
  type AutoTeamDebugReportInput,
  type AutoTeamDebugReportRequestSource,
  buildAutoTeamDebugReport,
  buildAutoTeamDebugReportTeamKey,
  formatAutoTeamDebugReportMarkdown,
} from './auto-team-builder-debug-report.utils';

describe('Auto Team Builder debug report (869exmkdp)', () => {
  it('is versioned and carries the engine codes as they are, never translated text', () => {
    const report = buildAutoTeamDebugReport(createInput());
    const [captain] = report.outcome.slots ?? [];

    expect(report.schema).toBe(AUTO_TEAM_DEBUG_REPORT_SCHEMA);
    expect(report.schemaVersion).toBe(AUTO_TEAM_DEBUG_REPORT_SCHEMA_VERSION);
    expect(report.outcome.status).toBe('exact');
    expect(report.outcome.candidateCount).toBe(412);
    expect(captain).toEqual({
      role: 'captain',
      characterId: 101,
      name: 'Character 101',
      primaryReason: { code: 'manualPick' },
      reasons: [{ code: 'manualPick' }, { code: 'leaderScopeMatch', params: { slotCount: 6 } }],
      fallbackReasons: [],
      rejected: [
        {
          characterId: 901,
          reasons: [{ code: 'lowerCoverageContribution', params: { coverageGap: 2 } }],
        },
      ],
    });
    expect(report.rules).toEqual([
      { key: 'types', state: 'passed' },
      { key: 'classes', state: 'relaxed' },
    ]);
    expect(report.app).toEqual({ version: '0.4.15', platform: 'web', language: 'el' });
    expect(report.dataset).toEqual({
      generatedAt: '2026-09-11T18:00:00.000Z',
      sourceVersion: '36',
      characterCount: 4618,
      detailCount: 4530,
      abilityCatalogGeneratedAt: '2026-09-11T18:00:01.000Z',
    });
    expect(report.performance).toEqual({
      wallMs: 3210,
      searchMs: 2800,
      attemptsCompleted: 4,
      totalAttempts: 9,
      activeWorkers: 4,
    });
  });

  it('reads the same team the same way whatever the slot order', () => {
    const slots = createInput().result!.slots;
    const reversedSubs = [slots[1]!, slots[0]!, ...slots.slice(2).reverse()];

    expect(buildAutoTeamDebugReportTeamKey(slots)).toBe('101,102|103,104,105,106');
    expect(buildAutoTeamDebugReportTeamKey(reversedSubs)).toBe('101,102|103,104,105,106');
    // A leader swapped with a sub is a different team.
    const swapped = slots.map((slot) =>
      slot.character.id === 102
        ? { ...slot, role: 'sub' as const }
        : slot.character.id === 103
          ? { ...slot, role: 'friendCaptain' as const }
          : slot,
    );

    expect(buildAutoTeamDebugReportTeamKey(swapped)).toBe('101,103|102,104,105,106');
  });

  it('reports a build that found no team from the page inputs, without empty result sections', () => {
    const report = buildAutoTeamDebugReport({
      ...createInput(),
      result: null,
      failure: 'noTeam',
      rules: [],
      performance: null,
    });

    expect(report.outcome).toEqual({ status: 'noTeam' });
    expect(report).not.toHaveProperty('rules');
    expect(report).not.toHaveProperty('relaxation');
    expect(report).not.toHaveProperty('coverage');
    expect(report).not.toHaveProperty('performance');
    expect(report.request.types).toEqual(['DEX', 'QCK']);
    expect(report.request.manualSlots).toEqual([{ role: 'captain', characterIds: [101] }]);
    expect(report.dataQuality.overriddenTeamCharacterIds).toEqual([]);
    expect(formatAutoTeamDebugReportMarkdown(report)).toContain('- Result: no team found\n');
  });

  it('says a relaxed team and a failure apart from an exact one', () => {
    const input = createInput();
    const relaxed = {
      ...input,
      result: { ...input.result!, relaxation: { ...input.result!.relaxation, usedFallback: true } },
    };

    expect(buildAutoTeamDebugReport(relaxed).outcome.status).toBe('fallback');
    expect(
      buildAutoTeamDebugReport({ ...relaxed, failure: 'guidedRelaxedOnly' }).outcome.status,
    ).toBe('guidedRelaxedOnly');
  });

  it('names only the team members that carry a local edit, and counts every edit', () => {
    const report = buildAutoTeamDebugReport({
      ...createInput(),
      localOverrideCharacterIds: [105, 999, 103, 103],
    });

    expect(report.dataQuality.localOverrideCount).toBe(3);
    expect(report.dataQuality.overriddenTeamCharacterIds).toEqual([103, 105]);
    expect(report.dataQuality.incompleteTeamCharacterIds).toEqual([106]);
    expect(formatAutoTeamDebugReportMarkdown(report)).toContain(
      '- Local character edits in this team: 103, 105\n',
    );
  });

  it('keeps battle titles out, and compacts the request to codes and counts', () => {
    const report = buildAutoTeamDebugReport(createInput());
    const text = formatAutoTeamDebugReportMarkdown(report);

    expect(text).not.toContain('My secret stage');
    expect(report.request.battles).toEqual([
      {
        enemyMechanics: [{ key: 'despair', category: 'crewDebuff', minTurns: 3 }],
        characterGroups: [[{ key: 'atkUp', count: 1 }]],
      },
    ]);
    expect(report.request.characterTagSets).toEqual({
      operator: 'all',
      sets: [{ operator: 'any', tags: ['Straw Hat Crew'] }],
    });
    expect(report.request.excludedCharacterCount).toBe(2);
    expect(report.request.leaderBoostRanges).toEqual({ ATK: { min: 3, max: null } });
    expect(report.request.flags['requireFullCaptainAbilityCoverage']).toBe(true);
    expect(report.request.flags['favoritesOnly']).toBe(false);
    expect(report.coverage).toEqual({
      missingAbilityKeys: ['orbBoost'],
      missingRequiredCharacterGroups: 0,
      missingBattles: 1,
      leaderScopeSlots: { matching: 5, total: 6 },
      leaderTiersCovered: false,
      uncoveredTierLabels: ['ATK x4.5'],
    });
  });

  it('marks a missing ability catalog and missing dataset in both the JSON and the summary', () => {
    const report = buildAutoTeamDebugReport({
      ...createInput(),
      abilityCatalogGeneratedAt: null,
    });

    expect(report.dataQuality.abilityCatalogLoaded).toBe(false);
    expect(formatAutoTeamDebugReportMarkdown(report)).toContain(
      '- Data: 4618 characters, generated 2026-09-11T18:00:00.000Z, ability catalog not loaded\n',
    );
    expect(
      formatAutoTeamDebugReportMarkdown(
        buildAutoTeamDebugReport({ ...createInput(), dataset: null }),
      ),
    ).toContain('- Data: not loaded\n');
  });

  it('prints a short summary, then JSON that reads back to the same report', () => {
    const report = buildAutoTeamDebugReport(createInput());
    const text = formatAutoTeamDebugReportMarkdown(report);
    const json = text.slice(text.indexOf('```json\n') + 8, text.lastIndexOf('\n```'));

    expect(text.startsWith('### Auto Team Builder debug report\n')).toBe(true);
    expect(text).toContain(
      '- Result: team found with every rule kept from 412 candidates in 3.2 s\n',
    );
    expect(JSON.parse(json)).toEqual(report);
  });

  it('stays small for a full team with three close alternatives on every slot', () => {
    const input = createInput();
    const rejected = [901, 902, 903].map((characterId) => ({
      characterId,
      characterName: `Alternative ${characterId}`,
      reasons: [
        { code: 'lowerCoverageContribution' as const, params: { coverageGap: 2 } },
        { code: 'lowerRequirementDemand' as const },
        { code: 'rankingTieBreak' as const },
      ],
    }));
    const heavy = {
      ...input,
      result: {
        ...input.result!,
        slots: input.result!.slots.map((slot) => ({
          ...slot,
          explanation: { ...slot.explanation!, rejectedCandidates: rejected },
        })),
      },
    };

    expect(formatAutoTeamDebugReportMarkdown(buildAutoTeamDebugReport(heavy)).length).toBeLessThan(
      16 * 1024,
    );
  });
});

function createInput(): AutoTeamDebugReportInput {
  const request: AutoTeamDebugReportRequestSource = {
    types: ['DEX', 'QCK'],
    selectedClasses: ['Fighter'],
    selectedCharacterTags: ['Straw Hat Crew'],
    characterTagSets: {
      operator: 'all',
      sets: [
        { id: 'set-1', operator: 'any', tags: ['Straw Hat Crew'] },
        { id: 'set-2', operator: 'any', tags: [] },
      ],
    },
    selectedCharacterNames: [],
    requiredAbilities: [
      { abilityKey: 'orbBoost', minTurns: null, slotTokens: [], requiredCharacterCount: 1 },
    ],
    battleRequirements: [
      {
        id: 'battle-1',
        title: 'My secret stage',
        enemyMechanics: [
          {
            mechanicKey: 'despair',
            category: 'crewDebuff',
            minTurns: 3,
            triggerTags: [],
            responseTags: [],
            conditionTags: [],
            derivedAbilityKey: null,
          },
        ],
        requiredCharacterGroups: [
          {
            id: 'group-1',
            abilities: [
              { abilityKey: 'atkUp', minTurns: null, slotTokens: [], requiredCharacterCount: 1 },
            ],
          },
        ],
      },
      {
        id: 'battle-2',
        title: 'Empty placeholder',
        enemyMechanics: [],
        requiredCharacterGroups: [],
      },
    ],
    enemyMechanics: [],
    manualSlots: [
      { role: 'captain', characterIds: [101] },
      { role: 'friendCaptain', characterIds: [] },
    ],
    excludedCharacterIds: [700, 701],
    leaderBoostFilters: ['HP', 'ATK'],
    leaderBoostRanges: { HP: { min: null, max: null }, ATK: { min: 3, max: null } },
    requireFullCaptainAbilityCoverage: true,
  };
  const explanation = (id: number): AutoBuildSlotExplanation =>
    id === 101
      ? {
          primaryReason: { code: 'manualPick' },
          reasons: [{ code: 'manualPick' }, { code: 'leaderScopeMatch', params: { slotCount: 6 } }],
          fallbackReasons: [],
          rejectedCandidates: [
            {
              characterId: 901,
              characterName: 'Alternative 901',
              reasons: [{ code: 'lowerCoverageContribution', params: { coverageGap: 2 } }],
            },
          ],
        }
      : {
          primaryReason: { code: 'burstRole' },
          reasons: [{ code: 'burstRole' }],
          fallbackReasons: [],
          rejectedCandidates: [],
        };
  const roles: Array<AutoBuildResult['slots'][number]['role']> = [
    'captain',
    'friendCaptain',
    'sub',
    'sub',
    'sub',
    'sub',
  ];
  const result = {
    input: request,
    requestedInput: request,
    candidateCount: 412,
    shipSelection: null,
    slots: [101, 102, 103, 104, 105, 106].map((id, index) => ({
      role: roles[index]!,
      character: createCharacter(id, id === 106),
      reasonChips: [],
      explanation: explanation(id),
    })),
    relaxation: {
      usedFallback: false,
      droppedTypes: [],
      droppedClasses: [],
      droppedCharacterTags: [],
      droppedCharacterNames: [],
      minimumLeaderSuperEffectMatchingSlots: null,
      allowedLeadersWithSuperEffects: false,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: false,
      ignoredSuperTandemCriteria: false,
    },
    coverage: {
      leaderCriteria: {
        matchingSlots: 5,
        totalSlots: 6,
        allLeaderTiersCovered: false,
        leaderTierCoverages: [{ uncoveredTierLabels: ['ATK x4.5'] }],
      },
      abilityRequirements: {
        requested: [],
        matched: [],
        missing: [
          { abilityKey: 'orbBoost', minTurns: null, slotTokens: [], requiredCharacterCount: 1 },
        ],
        matchesAll: false,
      },
      requiredCharacterGroups: { requested: [], matched: [], missing: [], matchesAll: true },
      battleRequirements: {
        requested: [],
        matched: [],
        missing: [{ id: 'battle-1' }],
        matchesAll: false,
      },
    },
  } as unknown as AutoBuildResult;

  return {
    createdAt: '2026-09-11T18:30:00.000Z',
    app: { version: '0.4.15', platform: 'web', language: 'el' },
    dataset: {
      generatedAt: '2026-09-11T18:00:00.000Z',
      sourceVersion: '36',
      characterCount: 4618,
      detailCount: 4530,
    },
    abilityCatalogGeneratedAt: '2026-09-11T18:00:01.000Z',
    localOverrideCharacterIds: [],
    context: {
      candidateSource: 'all',
      candidatePoolSize: null,
      boxCharacterCount: null,
      excludeBoxCharacterCount: null,
      favoriteCharacterCount: 3,
      guidedAutoBuild: false,
      workerCount: 4,
    },
    request,
    result,
    failure: null,
    rules: [
      { key: 'types', state: 'passed' },
      { key: 'classes', state: 'relaxed' },
    ],
    performance: {
      wallMs: 3210,
      searchMs: 2800,
      attemptsCompleted: 4,
      totalAttempts: 9,
      activeWorkers: 4,
    },
  };
}

function createCharacter(id: number, isIncomplete = false): CharacterDetailRecord {
  return { id, name: `Character ${id}`, isIncomplete } as CharacterDetailRecord;
}
