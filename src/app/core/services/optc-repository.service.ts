import { Injectable, signal, type Signal } from '@angular/core';
import type { Database, SqlJsStatic } from 'sql.js';

import {
  DEFAULT_AUTO_TEAM_CANDIDATE_LIMIT,
  type AutoBuildCandidateQueryOptions,
} from '../models/auto-team-builder.models';
import { type AutoBuildAbilityCatalog } from '../models/auto-team-builder-ability.models';
import {
  type CaptainCoverageTierKind,
  type CharacterAssets,
  type CharacterCaptainAbilityScope,
  type CharacterDetail,
  type CharacterDetailRecord,
  type CharacterDropSource,
  type CharacterEvolutionBranch,
  type CharacterProgression,
  type CharacterFacetMatchMode,
  type CharacterRecord,
  type CharacterSupportEntry,
  type DetailedCharacterSearchQuery,
  type CharacterListItem,
  type DatasetManifest,
  type NormalizedSuperSpecialCriteria,
  type NormalizedSuperTandemData,
  type NormalizedSuperTandemLevel,
  type CharacterIdOrder,
  type OfflinePackSummary,
  type CharacterRegionArtwork,
  type CharacterRegionRelease,
  type ShipRecord,
  type SuperCriteriaBranch,
} from '../models/optc.models';
import { CharacterOverridesService } from './character-overrides.service';
import {
  buildCharacterFacetSqlClause,
  matchesCharacterFacet,
  normalizeCharacterFacetSelection,
} from './character-facet-filter.utils';
import {
  applyOverrideToCharacterDetailRecord,
  applyOverrideToCharacterListItem,
} from './character-overrides.utils';
import {
  buildCharacterTagMatchIndex,
  type CharacterTagMatchIndex,
} from './character-tag-set.utils';
import {
  buildCharacterRegionSqlClause,
  isCharacterAvailableInRegion,
  normalizeCharacterRegionPreference,
} from './character-region.utils';
import {
  loadDatasetDatabase,
  markDatasetReady,
  type DatasetDownloadProgress,
} from './dataset-database-loader.utils';
import { UserStateService } from './user-state.service';

interface SqlRow {
  [key: string]: string | number | null;
}

const SQL_WASM_PATH = 'assets/vendor/sql.js/sql-wasm.wasm';
const DATASET_MANIFEST_PATH = 'assets/data/optc-manifest.json';
const AUTO_TEAM_BUILDER_ABILITY_CATALOG_PATH = 'assets/data/optc-auto-builder-abilities.json';
const FALLBACK_CHARACTER_IMAGE = 'assets/placeholders/character-card.svg';
const INVALID_CLASS_PATTERN = /^Class\d+$/i;
const SHIP_THUMBNAIL_PACK_ID = 'ship-thumbnails';
const SHIP_THUMBNAIL_PACK_KEY = 'shipThumbnails';
/**
 * How many rows are decorated between two `await yieldToMainThread()` calls, so a
 * full-catalogue decoration does not hold the main thread for one long task.
 *
 * At today's 4,622 characters and 4,622 detail rows that is **9** yields on the
 * character pass and **18** on the detail pass - a macrotask boundary roughly
 * every tenth of the work, not per row.
 *
 * **Both values are UNMEASURED, and that is recorded rather than dressed up.**
 * They arrived together in `6cb47dc1` (2026-05-09), a generic "update user state
 * readiness checks" refactor whose message does not mention them, with no stated
 * measurement anywhere and no test pinning either number. Nothing establishes why
 * the detail pass yields twice as often as the character pass - the plausible
 * reason is that a detail row parses more JSON per row, but nobody wrote that down
 * and nobody timed it.
 *
 * So: do not read these as tuned figures, and do not "optimise" them on the
 * strength of the ratio. If one needs changing, measure the long-task profile
 * first and replace this note with the number you got. Same shape as
 * `RECENT_FALLBACK_AVERAGE_ALPHA` in `auto-team-builder.engine.ts`, which is
 * documented the same honest way.
 */
const CHARACTER_DECORATION_YIELD_INTERVAL = 500;
const DETAIL_DECORATION_YIELD_INTERVAL = 250;

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * The single comparator behind `sortMode: 'powerFirst'`.
 *
 * Exported because callers that filter the detailed catalog themselves instead
 * of going through `searchDetailedCharacters` — Manual Team Builder's
 * tag-filtered candidate path is the only one today — must order their results
 * with the same function, not by re-deriving `id DESC` by hand. Two hand-rolled
 * copies of an ordering are how the same filter starts answering differently
 * depending on which code path happens to serve it.
 *
 * `buildCharacterPowerFirstOrderByClause` below is the SQL twin; the two must
 * always describe the same order.
 */
export function compareCharactersByPowerFirst(
  left: Pick<CharacterRecord, 'id'>,
  right: Pick<CharacterRecord, 'id'>,
): number {
  return right.id - left.id;
}

function buildCharacterPowerFirstOrderByClause(alias: string): string {
  const prefix = alias ? `${alias}.` : '';
  return `${prefix}id DESC`;
}

function resolveCharacterIdOrderDirection(idOrder: CharacterIdOrder | undefined): 'ASC' | 'DESC' {
  return idOrder === 'oldest' ? 'ASC' : 'DESC';
}

function buildCharacterIdOrderByClause(
  alias: string,
  idOrder: CharacterIdOrder | undefined,
): string {
  const prefix = alias ? `${alias}.` : '';
  return `${prefix}id ${resolveCharacterIdOrderDirection(idOrder)}`;
}

function buildCharacterBoostOrderByClause(
  alias: string,
  columnName: string,
  idOrder: CharacterIdOrder | undefined,
): string {
  const prefix = alias ? `${alias}.` : '';
  return `${prefix}${columnName} DESC, ${buildCharacterIdOrderByClause(alias, idOrder)}, ${prefix}cost DESC, ${prefix}name COLLATE NOCASE ASC`;
}

function buildDetailedCharacterOrderByClause(
  alias: string,
  sortMode: DetailedCharacterSearchQuery['sortMode'] | 'catalog',
  idOrder: CharacterIdOrder | undefined,
): string {
  if (sortMode === 'captainHpBoost') {
    return buildCharacterBoostOrderByClause(alias, 'captain_hp_boost', idOrder);
  }

  if (sortMode === 'captainAtkBoost') {
    return buildCharacterBoostOrderByClause(alias, 'captain_atk_boost', idOrder);
  }

  if (sortMode === 'captainAverageBoost') {
    return buildCharacterBoostOrderByClause(alias, 'captain_average_boost', idOrder);
  }

  if (sortMode === 'nameAsc') {
    return `${alias}.name COLLATE NOCASE ASC, ${buildCharacterIdOrderByClause(alias, idOrder)}`;
  }

  if (sortMode === 'nameDesc') {
    return `${alias}.name COLLATE NOCASE DESC, ${buildCharacterIdOrderByClause(alias, idOrder)}`;
  }

  if (sortMode === 'idAsc') {
    return `${alias}.id ASC`;
  }

  if (sortMode === 'idDesc' || sortMode === 'newest' || sortMode === 'powerFirst') {
    return buildCharacterPowerFirstOrderByClause(alias);
  }

  return buildCharacterIdOrderByClause(alias, idOrder);
}

function normalizeStringList(value: unknown): string[] {
  return (Array.isArray(value) ? value : [])
    .map((entry) => String(entry ?? '').trim())
    .filter((entry) => entry.length > 0);
}

function normalizeSupportData(value: unknown): CharacterSupportEntry[] {
  return (Array.isArray(value) ? value : [])
    .map((entry) => {
      const record =
        entry && typeof entry === 'object' && !Array.isArray(entry)
          ? (entry as Record<string, unknown>)
          : null;
      const supportedCharactersText = String(
        record?.['supportedCharactersText'] ?? record?.['Characters'] ?? '',
      ).trim();
      const levelDescriptions = normalizeStringList(
        record?.['levelDescriptions'] ?? record?.['description'],
      );

      if (!supportedCharactersText.length && levelDescriptions.length === 0) {
        return null;
      }

      return {
        supportedCharactersText,
        levelDescriptions,
      };
    })
    .filter((entry): entry is CharacterSupportEntry => Boolean(entry));
}

// Every character has at least one captain ability coverage tier. Characters with parsed
// captain text produce real tiers; characters without captain text get this trivial
// scope:'none' baseline tier so the Auto Team Builder can treat leader eligibility uniformly
// as "has any captain ability tier" — no text-vs-tier branching, no per-character bypass.
// Documented in audits/auto-team-builder/MANUAL_LEADER_SWEEP_AUDIT.md (No-Bypass policy).
const NO_CAPTAIN_ABILITY_TIER_ENTRY_KEY = 'no-captain-ability';
const NO_CAPTAIN_ABILITY_TIER_ENTRY_LABEL = 'No Captain Ability';

function createNoCaptainAbilityCoverageEntry(): NonNullable<
  CharacterDetail['captainAbilityCoverage']
>['entries'][number] {
  return {
    key: NO_CAPTAIN_ABILITY_TIER_ENTRY_KEY,
    label: NO_CAPTAIN_ABILITY_TIER_ENTRY_LABEL,
    tiers: [
      {
        tier: 1,
        kind: 'baseline',
        scope: 'none',
        characterConditions: {
          universal: false,
          fallbackOther: false,
          selfOnly: false,
          types: [],
          classes: [],
          characterTags: [],
        },
        teamConditions: [],
        fieldConditions: [],
        triggerConditions: [],
        clauses: [],
      },
    ],
  };
}

export function normalizeCaptainAbilityCoverage(
  value: unknown,
): CharacterDetail['captainAbilityCoverage'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { entries: [createNoCaptainAbilityCoverageEntry()] };
  }

  const record = value as Record<string, unknown>;
  const rawEntries = Array.isArray(record['entries']) ? record['entries'] : [];

  const parsedEntries = rawEntries
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }

      const entryRecord = entry as Record<string, unknown>;
      const key = String(entryRecord['key'] ?? '').trim();
      const label = String(entryRecord['label'] ?? '').trim();

      if (!key.length || !label.length) {
        return null;
      }

      const tiers = normalizeCaptainCoverageTiers(entryRecord['tiers']);

      return {
        key,
        label,
        tiers,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (parsedEntries.length === 0) {
    parsedEntries.push(createNoCaptainAbilityCoverageEntry());
  }

  return { entries: parsedEntries };
}

function normalizeCaptainAbilityScope(value: unknown): CharacterCaptainAbilityScope {
  return value === 'crew-wide' ||
    value === 'captain-only' ||
    value === 'subset' ||
    value === 'none'
    ? value
    : 'none';
}

function normalizeCaptainCoverageTiers(
  value: unknown,
): NonNullable<CharacterDetail['captainAbilityCoverage']>['entries'][number]['tiers'] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const tierNumber = Number(record['tier']);
      if (!Number.isFinite(tierNumber) || tierNumber <= 0) {
        return null;
      }
      const kindRaw = record['kind'];
      const kind: CaptainCoverageTierKind =
        kindRaw === 'baseline' ||
        kindRaw === 'unconditional-top' ||
        kindRaw === 'conditional' ||
        kindRaw === 'baseline-and-conditional'
          ? (kindRaw as CaptainCoverageTierKind)
          : 'baseline';
      const scope = normalizeCaptainAbilityScope(record['scope']);
      const characterConditions = normalizeCaptainCoverageTargetScope(record['characterConditions']);
      const teamConditions = normalizeCaptainCoverageTeamConditions(record['teamConditions']);
      const fieldConditions = normalizeCaptainCoverageFieldConditions(record['fieldConditions']);
      const triggerConditions = normalizeCaptainCoverageTriggerConditions(
        record['triggerConditions'],
      );
      const clauses = normalizeStringList(record['clauses']);
      const baselineClausesRaw = record['baselineClauses'];
      const conditionalClausesRaw = record['conditionalClauses'];
      const baselineClauses =
        baselineClausesRaw !== undefined ? normalizeStringList(baselineClausesRaw) : undefined;
      const conditionalClauses =
        conditionalClausesRaw !== undefined
          ? normalizeStringList(conditionalClausesRaw)
          : undefined;
      const atkBoostRaw = Number(record['atkBoost']);
      const hpBoostRaw = Number(record['hpBoost']);

      return {
        tier: tierNumber,
        kind,
        scope,
        characterConditions,
        teamConditions,
        fieldConditions,
        triggerConditions,
        clauses,
        ...(baselineClauses && baselineClauses.length ? { baselineClauses } : {}),
        ...(conditionalClauses && conditionalClauses.length ? { conditionalClauses } : {}),
        atkBoost: Number.isFinite(atkBoostRaw) && atkBoostRaw > 0 ? atkBoostRaw : undefined,
        hpBoost: Number.isFinite(hpBoostRaw) && hpBoostRaw > 0 ? hpBoostRaw : undefined,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

function normalizeCaptainCoverageTargetScope(
  value: unknown,
): NonNullable<
  CharacterDetail['captainAbilityCoverage']
>['entries'][number]['tiers'][number]['characterConditions'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {
        universal: false,
        fallbackOther: false,
        selfOnly: false,
        dominantType: false,
        types: [],
        classes: [],
        characterTags: [],
      };
  }
  const record = value as Record<string, unknown>;
  const costRange = normalizeNumericRange(record['costRange']);
  const rarityRange = normalizeNumericRange(record['rarityRange']);
  return {
    universal: Boolean(record['universal']),
    fallbackOther: Boolean(record['fallbackOther']),
    selfOnly: Boolean(record['selfOnly']),
    dominantType: Boolean(record['dominantType']),
    types: normalizeStringList(record['types']),
    classes: normalizeStringList(record['classes']),
    characterTags: normalizeStringList(record['characterTags']),
    costRange,
    rarityRange,
  };
}

function normalizeNumericRange(value: unknown): { min?: number; max?: number } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const min = Number(record['min']);
  const max = Number(record['max']);
  const range: { min?: number; max?: number } = {};
  if (Number.isFinite(min)) {
    range.min = min;
  }
  if (Number.isFinite(max)) {
    range.max = max;
  }
  return range.min === undefined && range.max === undefined ? undefined : range;
}

function normalizeCaptainCoverageTeamConditions(
  value: unknown,
): NonNullable<
  CharacterDetail['captainAbilityCoverage']
>['entries'][number]['tiers'][number]['teamConditions'] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const kindRaw = record['kind'];
      type TeamConditionKind =
        | 'crew-composition'
        | 'crew-count'
        | 'crew-exclusion'
        | 'requires-captain'
        | 'requires-friend-captain';
      const kind: TeamConditionKind =
        kindRaw === 'crew-composition' ||
        kindRaw === 'crew-count' ||
        kindRaw === 'crew-exclusion' ||
        kindRaw === 'requires-captain' ||
        kindRaw === 'requires-friend-captain'
          ? (kindRaw as TeamConditionKind)
          : 'crew-composition';
      const minCountRaw = Number(record['minCount']);
      const exactCountRaw = Number(record['exactCount']);
      return {
        kind,
        conditionGroup:
          typeof record['conditionGroup'] === 'string' && record['conditionGroup'].trim()
            ? record['conditionGroup'].trim()
            : undefined,
        minCount: Number.isFinite(minCountRaw) && minCountRaw > 0 ? minCountRaw : undefined,
        exactCount: Number.isFinite(exactCountRaw) && exactCountRaw > 0 ? exactCountRaw : undefined,
        types: normalizeStringList(record['types']),
        classes: normalizeStringList(record['classes']),
        characterTags: normalizeStringList(record['characterTags']),
        sameType: Boolean(record['sameType']),
        rawClause: String(record['rawClause'] ?? ''),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

function normalizeCaptainCoverageFieldConditions(
  value: unknown,
): NonNullable<
  CharacterDetail['captainAbilityCoverage']
>['entries'][number]['tiers'][number]['fieldConditions'] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      return {
        kind: 'territory' as const,
        territories: normalizeStringList(record['territories']),
        rawClause: String(record['rawClause'] ?? ''),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

function normalizeCaptainCoverageTriggerConditions(
  value: unknown,
): NonNullable<
  CharacterDetail['captainAbilityCoverage']
>['entries'][number]['tiers'][number]['triggerConditions'] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const kindRaw = record['kind'];
      type TriggerKind =
        | 'action-special-excellent'
        | 'action-special-perfect'
        | 'hp-below'
        | 'hp-above'
        | 'defeated-enemy-last-turn'
        | 'start-of-fight'
        | 'captain-branch-state'
        | 'consecutive-perfects'
        | 'other';
      const allowedKinds = new Set<TriggerKind>([
        'action-special-excellent',
        'action-special-perfect',
        'hp-below',
        'hp-above',
        'defeated-enemy-last-turn',
        'start-of-fight',
        'captain-branch-state',
        'consecutive-perfects',
        'other',
      ]);
      const kind: TriggerKind = allowedKinds.has(kindRaw as TriggerKind)
        ? (kindRaw as TriggerKind)
        : 'other';
      const hpPercentRaw = Number(record['hpPercent']);
      const durationTurnsRaw = Number(record['durationTurns']);
      const perfectStreakRaw = Number(record['perfectStreak']);
      const branchLabelRaw = record['branchLabel'];
      return {
        kind,
        hpPercent: Number.isFinite(hpPercentRaw) ? hpPercentRaw : undefined,
        durationTurns:
          Number.isFinite(durationTurnsRaw) && durationTurnsRaw > 0 ? durationTurnsRaw : undefined,
        perfectStreak:
          Number.isFinite(perfectStreakRaw) && perfectStreakRaw > 0 ? perfectStreakRaw : undefined,
        branchLabel:
          typeof branchLabelRaw === 'string' && branchLabelRaw.length > 0
            ? branchLabelRaw
            : undefined,
        rawClause: String(record['rawClause'] ?? ''),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

function normalizeSuperCriteriaBranch(value: unknown): SuperCriteriaBranch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const branchType = String(record['branchType'] ?? '').trim();

  if (branchType === 'character_count_any') {
    const requiredCount = Number(record['requiredCount']);
    const rawOptions = Array.isArray(record['options']) ? (record['options'] as unknown[]) : [];
    const options = rawOptions
      .map((entry: unknown) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return null;
        }

        const entryRecord = entry as Record<string, unknown>;
        const label = String(entryRecord['label'] ?? '').trim();
        const acceptedKeys = normalizeStringList(entryRecord['acceptedKeys']);

        if (!label.length || acceptedKeys.length === 0) {
          return null;
        }

        return {
          label,
          acceptedKeys,
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          label: string;
          acceptedKeys: string[];
        } => Boolean(entry),
      );

    return Number.isInteger(requiredCount) && requiredCount > 0 && options.length > 0
      ? {
          branchType,
          requiredCount,
          matchMode: record['matchMode'] === 'any_candidate' ? 'any_candidate' : 'unique_options',
          options,
        }
      : null;
  }

  if (branchType === 'class_or_type_count_any') {
    const requiredCount = Number(record['requiredCount']);
    const allowedClasses = normalizeStringList(record['allowedClasses']);
    const allowedTypes = normalizeStringList(record['allowedTypes']);

    return Number.isInteger(requiredCount) &&
      requiredCount > 0 &&
      (allowedClasses.length > 0 || allowedTypes.length > 0)
      ? {
          branchType,
          requiredCount,
          allowedClasses,
          allowedTypes,
        }
      : null;
  }

  if (branchType === 'class_or_type_presence_all') {
    const requiredClasses = normalizeStringList(record['requiredClasses']);
    const requiredTypes = normalizeStringList(record['requiredTypes']);

    return requiredClasses.length > 0 || requiredTypes.length > 0
      ? {
          branchType,
          requiredClasses,
          requiredTypes,
        }
      : null;
  }

  return null;
}

function normalizeSuperSpecialCriteria(value: unknown): NormalizedSuperSpecialCriteria | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const rawText = String(record['rawText'] ?? '').trim();
  const rawRosterBranches = Array.isArray(record['rosterBranches'])
    ? (record['rosterBranches'] as unknown[])
    : [];
  const rosterBranches = rawRosterBranches
    .map((branch: unknown) => normalizeSuperCriteriaBranch(branch))
    .filter((branch): branch is SuperCriteriaBranch => Boolean(branch));
  const parserStatus = String(record['parserStatus'] ?? '').trim();
  const normalizedParserStatus =
    parserStatus === 'roster_only' ||
    parserStatus === 'mixed' ||
    parserStatus === 'non_roster_only' ||
    parserStatus === 'unsupported'
      ? parserStatus
      : rosterBranches.length > 0
        ? 'roster_only'
        : 'unsupported';

  if (!rawText.length) {
    return null;
  }

  return {
    rawText,
    requiresCaptain: Boolean(record['requiresCaptain']),
    excludesSelf: Boolean(record['excludesSelf']),
    rosterBranches,
    hasNonRosterBranches: Boolean(record['hasNonRosterBranches']),
    parserStatus: normalizedParserStatus,
  };
}

function normalizeSuperTandemData(value: unknown): NormalizedSuperTandemData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const requirement =
    typeof record['requirement'] === 'string' && record['requirement'].trim().length
      ? record['requirement'].trim()
      : null;
  const levels = (Array.isArray(record['levels']) ? record['levels'] : [])
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }

      const levelRecord = entry as Record<string, unknown>;
      const level = Number(levelRecord['level']);
      const effect =
        typeof levelRecord['effect'] === 'string' && levelRecord['effect'].trim().length
          ? levelRecord['effect'].trim()
          : '';

      return Number.isInteger(level) && level > 0 && effect.length
        ? {
            ...levelRecord,
            level,
            effect,
          }
        : null;
    })
    .filter((entry): entry is NormalizedSuperTandemLevel => Boolean(entry));
  const criteria = normalizeSuperSpecialCriteria(record['criteria']);

  if (!requirement && !levels.length && !criteria) {
    return null;
  }

  return {
    ...record,
    requirement,
    levels,
    criteria,
  };
}

/**
 * 869f1935z. A stored JSON array, or an empty one. A missing row is the common case - most
 * characters have no evolution and most have no drop source - so this must not throw or return
 * null, or every caller grows the same guard.
 */
function parseJsonArray<T>(value: unknown): T[] {
  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);

    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * `undefined` is admitted because that is what indexing a `SqlRow` yields for an
 * absent column under `noUncheckedIndexedAccess`, and the body has always
 * treated it exactly as `null`. Only the signature was untrue.
 */
function parseNullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Same widening as parseNullableNumber: `Number(undefined)` is NaN, already floored to 0. */
function parseBoostNumber(value: string | number | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function compareBoostSortedCharacters(
  left: CharacterRecord,
  right: CharacterRecord,
  key: 'captainHpBoost' | 'captainAtkBoost' | 'captainAverageBoost',
  idOrder: CharacterIdOrder | undefined = 'newest',
): number {
  const boostDifference = right[key] - left[key];

  if (boostDifference !== 0) {
    return boostDifference;
  }

  const idDifference = compareCharacterIds(left.id, right.id, idOrder);

  if (idDifference !== 0) {
    return idDifference;
  }

  const costDifference = right.cost - left.cost;

  if (costDifference !== 0) {
    return costDifference;
  }

  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
}

function compareCharacterIds(
  leftId: number,
  rightId: number,
  idOrder: CharacterIdOrder | undefined,
): number {
  return idOrder === 'oldest' ? leftId - rightId : rightId - leftId;
}

function normalizeCandidateCostRange(range: AutoBuildCandidateQueryOptions['costRange']): {
  min: number | null;
  max: number | null;
} {
  return {
    min: normalizeCandidateCostRangeBound(range?.min),
    max: normalizeCandidateCostRangeBound(range?.max),
  };
}

function normalizeCandidateCostRangeBound(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : null;
}

function normalizeDetailedCharacterCostRange(range: DetailedCharacterSearchQuery['costRange']): {
  min: number | null;
  max: number | null;
} {
  return {
    min: normalizeCandidateCostRangeBound(range?.min),
    max: normalizeCandidateCostRangeBound(range?.max),
  };
}

function recordMatchesCandidateCostRange(
  record: Pick<CharacterDetailRecord, 'cost'>,
  range: { min: number | null; max: number | null },
): boolean {
  if (range.min !== null && record.cost < range.min) {
    return false;
  }

  if (range.max !== null && record.cost > range.max) {
    return false;
  }

  return true;
}

@Injectable({ providedIn: 'root' })
export class OptcRepositoryService {
  private readonly sqlPromise: Promise<SqlJsStatic>;
  private readonly databasePromise: Promise<Database>;
  private manifestPromise?: Promise<DatasetManifest>;
  private autoBuilderAbilityCatalogPromise?: Promise<AutoBuildAbilityCatalog>;
  private detailedCatalogPromise?: Promise<CharacterDetailRecord[]>;
  private detailedCatalogOverrideRevision = -1;
  private rumbleBuilderCandidatesPromise?: Promise<CharacterDetailRecord[]>;
  private rumbleBuilderCandidatesOverrideRevision = -1;
  private availableCharacterTagsPromise?: Promise<string[]>;
  private availableCharacterTagsOverrideRevision = -1;
  private characterTagMatchIndexPromise?: Promise<CharacterTagMatchIndex>;
  private characterTagMatchIndexOverrideRevision = -1;

  public constructor(
    private readonly characterOverrides: CharacterOverridesService,
    private readonly userState: UserStateService,
  ) {
    this.sqlPromise = import('sql.js').then((module) =>
      module.default({
        locateFile: () => SQL_WASM_PATH,
      }),
    );
    this.databasePromise = this.createDatabase();
  }

  public async getDatasetManifest(): Promise<DatasetManifest> {
    this.manifestPromise ??= this.fetchJson<DatasetManifest>(DATASET_MANIFEST_PATH).then(
      (manifest) => this.normalizeManifest(manifest),
    );
    return this.manifestPromise;
  }

  public async getAutoBuilderAbilityCatalog(): Promise<AutoBuildAbilityCatalog> {
    this.autoBuilderAbilityCatalogPromise ??= this.fetchJson<AutoBuildAbilityCatalog>(
      AUTO_TEAM_BUILDER_ABILITY_CATALOG_PATH,
    );
    return this.autoBuilderAbilityCatalogPromise;
  }

  public async getAllCharacters(): Promise<CharacterListItem[]> {
    const rows = await this.selectAll(
      `
        SELECT
          id,
          name,
          is_incomplete,
          type,
          primary_class,
          secondary_class,
          classes_json,
          stars,
          stars_label,
          cost,
          combo,
          min_hp,
          min_atk,
          min_rcv,
          max_hp,
          max_atk,
          max_rcv,
          growth,
          captain_hp_boost,
          captain_atk_boost,
          captain_average_boost,
          region_json,
          region_release_json,
          assets_json,
          search_text
        FROM characters
        ORDER BY stars DESC, id DESC
      `,
    );

    return this.decorateCharacterRows(rows);
  }

  public async getDetailedCharacterCatalog(): Promise<CharacterDetailRecord[]> {
    await this.characterOverrides.ready();
    const overrideRevision = this.characterOverrides.revision();

    if (
      this.detailedCatalogPromise &&
      this.detailedCatalogOverrideRevision === overrideRevision
    ) {
      return this.detailedCatalogPromise;
    }

    this.detailedCatalogOverrideRevision = overrideRevision;
    this.detailedCatalogPromise = this.loadAllDetailedCharacters().catch((error: unknown) => {
      if (this.detailedCatalogOverrideRevision === overrideRevision) {
        this.detailedCatalogPromise = undefined;
        this.detailedCatalogOverrideRevision = -1;
      }

      throw error;
    });

    return this.detailedCatalogPromise;
  }

  public async getAvailableCharacterTags(): Promise<string[]> {
    await this.characterOverrides.ready();
    const overrideRevision = this.characterOverrides.revision();

    if (
      this.availableCharacterTagsPromise &&
      this.availableCharacterTagsOverrideRevision === overrideRevision
    ) {
      return this.availableCharacterTagsPromise;
    }

    this.availableCharacterTagsOverrideRevision = overrideRevision;
    this.availableCharacterTagsPromise = this.getDetailedCharacterCatalog()
      .then((records) => {
        const tags = records.flatMap((record) => record.detail.characterTags ?? []);
        const tagByKey = new Map<string, string>();

        for (const tag of tags) {
          const normalizedTag = tag.trim().replace(/\s+/g, ' ');
          const key = normalizedTag.toLowerCase();

          if (normalizedTag.length > 0 && !tagByKey.has(key)) {
            tagByKey.set(key, normalizedTag);
          }
        }

        return [...tagByKey.values()].sort((left, right) => left.localeCompare(right));
      })
      .catch((error: unknown) => {
        if (this.availableCharacterTagsOverrideRevision === overrideRevision) {
          this.availableCharacterTagsPromise = undefined;
          this.availableCharacterTagsOverrideRevision = -1;
        }

        throw error;
      });

    return this.availableCharacterTagsPromise;
  }

  /**
   * `tag key -> character ids`, memoised against the character-override revision
   * exactly like `getAvailableCharacterTags()` and sharing the same
   * `getDetailedCharacterCatalog()` pass, so a host that loads both pays for one
   * JSON.parse sweep over the detail rows rather than two.
   */
  public async getCharacterTagMatchIndex(): Promise<CharacterTagMatchIndex> {
    await this.characterOverrides.ready();
    const overrideRevision = this.characterOverrides.revision();

    if (
      this.characterTagMatchIndexPromise &&
      this.characterTagMatchIndexOverrideRevision === overrideRevision
    ) {
      return this.characterTagMatchIndexPromise;
    }

    this.characterTagMatchIndexOverrideRevision = overrideRevision;
    this.characterTagMatchIndexPromise = this.getDetailedCharacterCatalog()
      .then((records) => buildCharacterTagMatchIndex(records))
      .catch((error: unknown) => {
        if (this.characterTagMatchIndexOverrideRevision === overrideRevision) {
          this.characterTagMatchIndexPromise = undefined;
          this.characterTagMatchIndexOverrideRevision = -1;
        }

        throw error;
      });

    return this.characterTagMatchIndexPromise;
  }

  public async searchDetailedCharacters(
    query: DetailedCharacterSearchQuery,
  ): Promise<CharacterDetailRecord[]> {
    await this.characterOverrides.ready();
    const overridesByCharacterId = this.characterOverrides.overridesByCharacterId();
    // Built ONCE, above the branch, so the SQL path and the in-memory override
    // path are provably driven by the same normalized facets. The query-layer
    // default stays `all` for an omitted mode — back-compat for existing callers.
    const typeFacet = normalizeCharacterFacetSelection('type', {
      values: query.selectedTypes,
      matchMode: query.selectedTypesMatchMode ?? 'all',
    });
    const classFacet = normalizeCharacterFacetSelection('class', {
      values: query.selectedClasses,
      matchMode: query.selectedClassesMatchMode ?? 'all',
    });
    // 869f13282. Normalized above the branch for the same reason the facets are: the SQL path and
    // the in-memory override path must be driven by one value, or a reader with a single character
    // override gets a different roster from one without.
    const regionPreference = normalizeCharacterRegionPreference(
      query.regionPreference ?? this.userState.activeRegionFilter(),
    );

    if (overridesByCharacterId.size === 0) {
      const normalizedSearchTerm = query.searchTerm.trim().toLowerCase();
      const allowedCharacterIds = [
        ...new Set(
          (query.allowedCharacterIds ?? []).filter(
            (characterId) => Number.isInteger(characterId) && characterId > 0,
          ),
        ),
      ];
      const excludedCharacterIds = [
        ...new Set(
          (query.excludedCharacterIds ?? []).filter(
            (characterId) => Number.isInteger(characterId) && characterId > 0,
          ),
        ),
      ];
      const whereClauses: string[] = [];
      const queryParams: Array<string | number> = [];
      const costRange = normalizeDetailedCharacterCostRange(query.costRange);

      if (normalizedSearchTerm.length > 0) {
        whereClauses.push(`c.search_text LIKE '%' || ? || '%'`);
        queryParams.push(normalizedSearchTerm);
      }

      for (const facetClause of [
        buildCharacterFacetSqlClause('type', typeFacet),
        buildCharacterFacetSqlClause('class', classFacet),
      ]) {
        if (facetClause) {
          whereClauses.push(facetClause.clause);
          queryParams.push(...facetClause.params);
        }
      }

      const regionClause = buildCharacterRegionSqlClause(regionPreference, 'c.region_release_json');

      if (regionClause) {
        whereClauses.push(regionClause);
      }

      if (allowedCharacterIds.length > 0) {
        whereClauses.push(`c.id IN (${allowedCharacterIds.map(() => '?').join(',')})`);
        queryParams.push(...allowedCharacterIds);
      } else if (query.allowedCharacterIds !== undefined) {
        whereClauses.push('1 = 0');
      }

      if (excludedCharacterIds.length > 0) {
        whereClauses.push(`c.id NOT IN (${excludedCharacterIds.map(() => '?').join(',')})`);
        queryParams.push(...excludedCharacterIds);
      }

      if (costRange.min !== null) {
        whereClauses.push('c.cost >= ?');
        queryParams.push(costRange.min);
      }

      if (costRange.max !== null) {
        whereClauses.push('c.cost <= ?');
        queryParams.push(costRange.max);
      }

      const orderByClause = buildDetailedCharacterOrderByClause(
        'c',
        query.sortMode ?? 'catalog',
        query.idOrder,
      );
      const whereClause =
        whereClauses.length > 0 ? `WHERE ${whereClauses.join('\n          AND ')}` : '';
      const rows = await this.selectAll(
        `
          SELECT
            c.id,
            c.name,
            c.is_incomplete,
            c.type,
            c.primary_class,
            c.secondary_class,
            c.classes_json,
            c.stars,
            c.stars_label,
            c.cost,
            c.combo,
            c.min_hp,
            c.min_atk,
            c.min_rcv,
            c.max_hp,
            c.max_atk,
            c.max_rcv,
            c.growth,
            c.captain_hp_boost,
            c.captain_atk_boost,
            c.captain_average_boost,
            c.region_json,
            c.region_release_json,
            c.assets_json,
            c.search_text,
            d.detail_json
          FROM characters c
          LEFT JOIN character_details d ON d.character_id = c.id
          ${whereClause}
          ORDER BY ${orderByClause}
          LIMIT ? OFFSET ?
        `,
        [...queryParams, query.limit, query.offset],
      );

      return this.decorateCharacterDetailRows(rows);
    }

    const records = await this.getDetailedCharacterCatalog();
    const allowedCharacterIdSet =
      query.allowedCharacterIds === undefined
        ? null
        : new Set(
            query.allowedCharacterIds.filter(
              (characterId) => Number.isInteger(characterId) && characterId > 0,
            ),
          );
    const excludedCharacterIdSet = new Set(
      (query.excludedCharacterIds ?? []).filter(
        (characterId) => Number.isInteger(characterId) && characterId > 0,
      ),
    );
    const costRange = normalizeDetailedCharacterCostRange(query.costRange);
    const filteredRecords = this.sortDetailedRecords(
      records.filter((record) => {
        if (allowedCharacterIdSet && !allowedCharacterIdSet.has(record.id)) {
          return false;
        }

        if (excludedCharacterIdSet.has(record.id)) {
          return false;
        }

        if (!this.matchesSearchTerm(record, query.searchTerm)) {
          return false;
        }

        if (!this.matchesTypes(record, typeFacet.values, typeFacet.matchMode)) {
          return false;
        }

        if (!this.matchesClasses(record, classFacet.values, classFacet.matchMode)) {
          return false;
        }

        if (!recordMatchesCandidateCostRange(record, costRange)) {
          return false;
        }

        if (!isCharacterAvailableInRegion(record.regionRelease, regionPreference)) {
          return false;
        }

        return true;
      }),
      query.sortMode ?? 'catalog',
      query.idOrder,
    );

    return filteredRecords.slice(query.offset, query.offset + query.limit);
  }

  public async getCharacterById(characterId: number): Promise<CharacterDetailRecord | null> {
    const rows = await this.selectAll(
      `
        SELECT
          c.id,
          c.name,
          c.is_incomplete,
          c.type,
          c.primary_class,
          c.secondary_class,
          c.classes_json,
          c.stars,
          c.stars_label,
          c.cost,
          c.combo,
          c.min_hp,
          c.min_atk,
          c.min_rcv,
          c.max_hp,
          c.max_atk,
          c.max_rcv,
          c.growth,
          c.captain_hp_boost,
          c.captain_atk_boost,
          c.captain_average_boost,
          c.region_json,
          c.region_release_json,
          c.assets_json,
          c.search_text,
          d.detail_json
        FROM characters c
        LEFT JOIN character_details d ON d.character_id = c.id
        WHERE c.id = ?
      `,
      [characterId],
    );

    if (!rows.length) {
      return null;
    }

    const [record] = await this.decorateCharacterDetailRows(rows);

    return record ?? null;
  }

  /**
   * 869f1935z. One character's progression: socket slots, special cooldown, both evolution
   * directions and every drop source.
   *
   * A separate query on purpose. `getCharacterById` is also used to resolve a Rumble `basedOn`
   * unit and runs in list contexts; these payloads are per-character arrays that nothing but the
   * detail surface reads.
   *
   * A missing `character_evolutions` or `character_drops` row means the upstream graph does not
   * mention this character - "nothing recorded", NOT "not farmable". The difference is the whole
   * point: a confident "there is no way to get this" is as wrong as a bad stage recommendation.
   */
  public async getCharacterProgression(characterId: number): Promise<CharacterProgression | null> {
    const rows = await this.selectAll(
      `
        SELECT
          c.id,
          c.max_sockets,
          c.special_cooldown_max,
          c.special_cooldown_min,
          e.evolves_to_json,
          e.evolves_from_json,
          p.sources_json
        FROM characters c
        LEFT JOIN character_evolutions e ON e.character_id = c.id
        LEFT JOIN character_drops p ON p.character_id = c.id
        WHERE c.id = ?
      `,
      [characterId],
    );

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      characterId,
      maxSockets: parseNullableNumber(row['max_sockets']),
      specialCooldownMax: parseNullableNumber(row['special_cooldown_max']),
      specialCooldownMin: parseNullableNumber(row['special_cooldown_min']),
      evolvesTo: parseJsonArray<CharacterEvolutionBranch>(row['evolves_to_json']),
      evolvesFrom: parseJsonArray<number>(row['evolves_from_json']),
      dropSources: parseJsonArray<CharacterDropSource>(row['sources_json']),
    };
  }

  /**
   * 869f1k107. Just the two cooldown columns, for a handful of characters at once.
   *
   * `getCharacterProgression` above answers the same question but joins evolutions and drops,
   * which a turn timeline never looks at - and it answers for one character at a time, so a
   * six-slot team would be six queries for two integers each.
   */
  public async getSpecialCooldownsByIds(
    ids: number[],
  ): Promise<{ characterId: number; baseTurns: number | null; maxLevelTurns: number | null }[]> {
    const uniqueIds = [...new Set(ids)].filter((id) => Number.isFinite(id));

    if (uniqueIds.length === 0) {
      return [];
    }

    const placeholders = uniqueIds.map(() => '?').join(', ');
    const rows = await this.selectAll(
      `
        SELECT id, special_cooldown_max, special_cooldown_min
        FROM characters
        WHERE id IN (${placeholders})
      `,
      uniqueIds,
    );

    return rows.map((row) => ({
      characterId: Number(row['id']),
      baseTurns: parseNullableNumber(row['special_cooldown_max']),
      maxLevelTurns: parseNullableNumber(row['special_cooldown_min']),
    }));
  }

  public async getAutoBuilderCandidates(
    typeFilters: string[],
    limit: number | null = DEFAULT_AUTO_TEAM_CANDIDATE_LIMIT,
    options: AutoBuildCandidateQueryOptions = {},
  ): Promise<CharacterDetailRecord[]> {
    if (!typeFilters.length) {
      return [];
    }

    const lockedCharacterIds = [
      ...new Set(
        (options.lockedCharacterIds ?? []).filter(
          (characterId) => Number.isInteger(characterId) && characterId > 0,
        ),
      ),
    ];
    const allowedCharacterIds = [
      ...new Set(
        (options.allowedCharacterIds ?? []).filter(
          (characterId) => Number.isInteger(characterId) && characterId > 0,
        ),
      ),
    ];
    const selectedClasses = [
      ...new Set(
        (options.selectedClasses ?? [])
          .map((selectedClass) => selectedClass.trim())
          .filter((selectedClass) => selectedClass.length > 0),
      ),
    ];
    const excludedCharacterIds = [
      ...new Set(
        (options.excludedCharacterIds ?? []).filter(
          (characterId) => Number.isInteger(characterId) && characterId > 0,
        ),
      ),
    ];
    // Candidate pools are always OR across types and OR across classes: this is
    // "any of these", never "simultaneously STR and QCK".
    const typeFacet = normalizeCharacterFacetSelection('type', {
      values: typeFilters,
      matchMode: 'any',
    });
    const classFacet = normalizeCharacterFacetSelection('class', {
      values: selectedClasses,
      matchMode: 'any',
    });

    if (!typeFacet.values.length) {
      return [];
    }

    const costRange = normalizeCandidateCostRange(options.costRange);
    await this.characterOverrides.ready();
    const overridesByCharacterId = this.characterOverrides.overridesByCharacterId();
    const allowedCharacterIdSet = allowedCharacterIds.length ? new Set(allowedCharacterIds) : null;
    const excludedCharacterIdSet = new Set(excludedCharacterIds);
    const lockedCharacterIdSet = new Set(lockedCharacterIds);

    let filteredRecords: CharacterDetailRecord[];

    if (overridesByCharacterId.size === 0) {
      const typeClause = buildCharacterFacetSqlClause('type', typeFacet);
      const classClause = buildCharacterFacetSqlClause('class', classFacet);
      const queryParams: Array<string | number> = [...(typeClause?.params ?? [])];
      let whereClause = typeClause?.clause ?? '1 = 1';

      if (classClause) {
        whereClause = `(${whereClause} AND ${classClause.clause})`;
        queryParams.push(...classClause.params);
      }

      if (costRange.min !== null) {
        whereClause = `(${whereClause} AND c.cost >= ?)`;
        queryParams.push(costRange.min);
      }

      if (costRange.max !== null) {
        whereClause = `(${whereClause} AND c.cost <= ?)`;
        queryParams.push(costRange.max);
      }

      if (lockedCharacterIds.length > 0) {
        whereClause = `(${whereClause} OR c.id IN (${lockedCharacterIds.map(() => '?').join(',')}))`;
        queryParams.push(...lockedCharacterIds);
      }

      if (allowedCharacterIds.length > 0) {
        const scopedIds = [...new Set([...allowedCharacterIds, ...lockedCharacterIds])];

        whereClause = `(${whereClause}) AND c.id IN (${scopedIds.map(() => '?').join(',')})`;
        queryParams.push(...scopedIds);
      }

      if (excludedCharacterIds.length > 0) {
        whereClause = `(${whereClause}) AND c.id NOT IN (${excludedCharacterIds
          .map(() => '?')
          .join(',')})`;
        queryParams.push(...excludedCharacterIds);
      }

      const rows = await this.selectAll(
        `
          SELECT
            c.id,
            c.name,
            c.is_incomplete,
            c.type,
            c.primary_class,
            c.secondary_class,
            c.classes_json,
            c.stars,
            c.stars_label,
            c.cost,
            c.combo,
            c.min_hp,
            c.min_atk,
            c.min_rcv,
            c.max_hp,
            c.max_atk,
            c.max_rcv,
            c.growth,
            c.captain_hp_boost,
            c.captain_atk_boost,
            c.captain_average_boost,
            c.region_json,
            c.region_release_json,
            c.assets_json,
            c.search_text,
            d.detail_json
          FROM characters c
          LEFT JOIN character_details d ON d.character_id = c.id
          WHERE ${whereClause}
          ORDER BY ${buildCharacterPowerFirstOrderByClause('c')}
        `,
        queryParams,
      );

      const decoratedRows = await this.decorateCharacterDetailRows(rows);
      const scopedAllowedCharacterIdSet = allowedCharacterIdSet
        ? new Set([...allowedCharacterIds, ...lockedCharacterIds])
        : null;

      filteredRecords = this.sortDetailedRecords(decoratedRows, 'powerFirst').filter((record) => {
        if (excludedCharacterIdSet.has(record.id)) {
          return false;
        }

        if (
          !lockedCharacterIdSet.has(record.id) &&
          !recordMatchesCandidateCostRange(record, costRange)
        ) {
          return false;
        }

        return !scopedAllowedCharacterIdSet || scopedAllowedCharacterIdSet.has(record.id);
      });
    } else {
      const detailedRecords = this.sortDetailedRecords(
        await this.getDetailedCharacterCatalog(),
        'powerFirst',
      );
      filteredRecords = detailedRecords.filter((record) => {
        if (excludedCharacterIdSet.has(record.id)) {
          return false;
        }

        if (
          allowedCharacterIdSet &&
          !allowedCharacterIdSet.has(record.id) &&
          !lockedCharacterIdSet.has(record.id)
        ) {
          return false;
        }

        if (
          !lockedCharacterIdSet.has(record.id) &&
          !this.matchesTypes(record, typeFacet.values, typeFacet.matchMode)
        ) {
          return false;
        }

        if (
          !lockedCharacterIdSet.has(record.id) &&
          classFacet.values.length > 0 &&
          !this.matchesClasses(record, classFacet.values, classFacet.matchMode)
        ) {
          return false;
        }

        if (
          !lockedCharacterIdSet.has(record.id) &&
          !recordMatchesCandidateCostRange(record, costRange)
        ) {
          return false;
        }

        return true;
      });
    }
    if (limit === null) {
      return filteredRecords;
    }

    return filteredRecords.filter(
      (record, index) => index < limit || lockedCharacterIdSet.has(record.id),
    );
  }

  public async getCharactersByIds(ids: number[]): Promise<CharacterListItem[]> {
    if (!ids.length) {
      return [];
    }

    const placeholders = ids.map(() => '?').join(',');
    const rows = await this.selectAll(
      `
        SELECT
          id,
          name,
          is_incomplete,
          type,
          primary_class,
          secondary_class,
          classes_json,
          stars,
          stars_label,
          cost,
          combo,
          min_hp,
          min_atk,
          min_rcv,
          max_hp,
          max_atk,
          max_rcv,
          growth,
          captain_hp_boost,
          captain_atk_boost,
          captain_average_boost,
          region_json,
          region_release_json,
          assets_json,
          search_text
        FROM characters
        WHERE id IN (${placeholders})
      `,
      ids,
    );

    const decorated = await this.decorateCharacterRows(rows);
    const order = new Map(ids.map((id, index) => [id, index]));

    return decorated.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
  }

  public async getDetailedCharactersByIds(ids: number[]): Promise<CharacterDetailRecord[]> {
    if (!ids.length) {
      return [];
    }

    const placeholders = ids.map(() => '?').join(',');
    const rows = await this.selectAll(
      `
        SELECT
          c.id,
          c.name,
          c.is_incomplete,
          c.type,
          c.primary_class,
          c.secondary_class,
          c.classes_json,
          c.stars,
          c.stars_label,
          c.cost,
          c.combo,
          c.min_hp,
          c.min_atk,
          c.min_rcv,
          c.max_hp,
          c.max_atk,
          c.max_rcv,
          c.growth,
          c.captain_hp_boost,
          c.captain_atk_boost,
          c.captain_average_boost,
          c.region_json,
          c.region_release_json,
          c.assets_json,
          c.search_text,
          d.detail_json
        FROM characters c
        LEFT JOIN character_details d ON d.character_id = c.id
        WHERE c.id IN (${placeholders})
      `,
      ids,
    );

    const decorated = await this.decorateCharacterDetailRows(rows);
    const order = new Map(ids.map((id, index) => [id, index]));

    return decorated.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
  }

  public async getRumbleBuilderCandidates(): Promise<CharacterDetailRecord[]> {
    await this.characterOverrides.ready();
    const overrideRevision = this.characterOverrides.revision();

    if (
      this.rumbleBuilderCandidatesPromise &&
      this.rumbleBuilderCandidatesOverrideRevision === overrideRevision
    ) {
      return this.rumbleBuilderCandidatesPromise;
    }

    this.rumbleBuilderCandidatesOverrideRevision = overrideRevision;
    this.rumbleBuilderCandidatesPromise = this.getDetailedCharacterCatalog()
      .then((records) =>
        records.filter((record) => this.hasUsableRumbleData(record.detail.rumbleData)),
      )
      .catch((error: unknown) => {
        if (this.rumbleBuilderCandidatesOverrideRevision === overrideRevision) {
          this.rumbleBuilderCandidatesPromise = undefined;
          this.rumbleBuilderCandidatesOverrideRevision = -1;
        }

        throw error;
      });

    return this.rumbleBuilderCandidatesPromise;
  }

  public async getShips(): Promise<ShipRecord[]> {
    const manifest = await this.getDatasetManifest();
    const installedPacks = new Map(manifest.packs.map((pack) => [pack.key, pack]));

    const rows = await this.selectAll(
      `
        SELECT id, name, thumb, description
        FROM ships
        ORDER BY id ASC
      `,
    );

    return rows.map((row) => ({
      id: Number(row['id']),
      name: String(row['name']),
      thumb: row['thumb'] ? String(row['thumb']) : null,
      thumbUrl: this.resolveShipThumbUrl(
        row['thumb'] ? String(row['thumb']) : null,
        installedPacks,
      ),
      description: String(row['description']),
    }));
  }

  /**
   * 869f138pm. How far the dataset download has got, or null when nothing is downloading.
   *
   * Exposed so the first visit can say what it is waiting for. On every visit after the first the
   * service worker answers from cache and this stays null for the whole load, which is correct:
   * there is no download to report, and a progress bar that flashes and vanishes is noise.
   */
  private readonly datasetDownloadSignal = signal<DatasetDownloadProgress | null>(null);

  public readonly datasetDownload: Signal<DatasetDownloadProgress | null> =
    this.datasetDownloadSignal.asReadonly();

  private async createDatabase(): Promise<Database> {
    const sql = await this.sqlPromise;
    const { database, source } = await loadDatasetDatabase({
      sql,
      fetch: (path) => fetch(path),
      decompressionStream:
        typeof DecompressionStream === 'function' ? DecompressionStream : undefined,
      yieldToMainThread,
      warn: (code, detail) => console.warn(code, detail),
      onProgress: (progress) => this.datasetDownloadSignal.set(progress),
    });

    markDatasetReady(source);
    /* 869f138pm. The download is over; anything still waiting is the open, which is milliseconds. */
    this.datasetDownloadSignal.set(null);

    return database;
  }

  private async selectAll(query: string, params: Array<string | number> = []): Promise<SqlRow[]> {
    const database = await this.databasePromise;
    const result = database.exec(query, params);

    const statement = result[0];

    if (!statement) {
      return [];
    }

    return (statement.values as Array<Array<string | number | null>>).map((valueRow) =>
      (statement.columns as string[]).reduce<SqlRow>((row, column, index) => {
        row[column] = valueRow[index] ?? null;
        return row;
      }, {}),
    );
  }

  private async decorateCharacterRows(rows: SqlRow[]): Promise<CharacterListItem[]> {
    await this.characterOverrides.ready();
    const manifest = await this.getDatasetManifest();
    const installedPacks = new Map(manifest.packs.map((pack) => [pack.key, pack]));
    const overridesByCharacterId = this.characterOverrides.overridesByCharacterId();

    const decoratedRows: CharacterListItem[] = [];

    for (const [index, row] of rows.entries()) {
      if (index > 0 && index % CHARACTER_DECORATION_YIELD_INTERVAL === 0) {
        await yieldToMainThread();
      }

      const assets = this.parseJson<CharacterAssets>(row['assets_json'], {
        exactLocal: null,
        thumbnailLocal: null,
        thumbnailGlobal: null,
        thumbnailJapan: null,
      });

      const regionArtwork = this.parseJson<CharacterRegionArtwork>(row['region_json'], {
        exactLocal: false,
        thumbnailGlobal: false,
        thumbnailJapan: false,
      });

      /*
       * 869f13284 / 869f1328r. The default is `null`, not `false`. A seed written before this
       * column existed has no release data at all, and "we have no row" must not render as
       * "not available on Global".
       */
      const regionRelease = this.parseJson<CharacterRegionRelease>(row['region_release_json'], {
        availableOnGlobal: null,
      });

      const record: CharacterListItem = {
        id: Number(row['id']),
        name: String(row['name']),
        searchText: this.resolveSearchText(row),
        isIncomplete: Number(row['is_incomplete']) === 1,
        type: String(row['type']),
        primaryClass: String(row['primary_class']),
        secondaryClass: row['secondary_class'] ? String(row['secondary_class']) : null,
        classes: this.parseJson<string[]>(row['classes_json'], []),
        stars: Number(row['stars']),
        starsLabel: String(row['stars_label'] ?? row['stars']),
        cost: Number(row['cost']),
        combo: Number(row['combo']),
        captainHpBoost: parseBoostNumber(row['captain_hp_boost']),
        captainAtkBoost: parseBoostNumber(row['captain_atk_boost']),
        captainAverageBoost: parseBoostNumber(row['captain_average_boost']),
        stats: {
          min: {
            hp: parseNullableNumber(row['min_hp']),
            atk: parseNullableNumber(row['min_atk']),
            rcv: parseNullableNumber(row['min_rcv']),
          },
          max: {
            hp: parseNullableNumber(row['max_hp']),
            atk: parseNullableNumber(row['max_atk']),
            rcv: parseNullableNumber(row['max_rcv']),
          },
          growth: parseNullableNumber(row['growth']),
        },
        regionArtwork,
        regionRelease,
        assets,
        imageUrl: this.resolveImageUrl(assets, { preferExactLocal: false, installedPacks }),
      };

      decoratedRows.push(
        applyOverrideToCharacterListItem(record, overridesByCharacterId.get(record.id) ?? null),
      );
    }

    return decoratedRows;
  }

  private async decorateCharacterDetailRows(rows: SqlRow[]): Promise<CharacterDetailRecord[]> {
    const records = await this.decorateCharacterRows(rows);
    const manifest = await this.getDatasetManifest();
    const installedPacks = new Map(manifest.packs.map((pack) => [pack.key, pack]));
    const overridesByCharacterId = this.characterOverrides.overridesByCharacterId();

    const decoratedRows: CharacterDetailRecord[] = [];

    for (const [index, record] of records.entries()) {
      if (index > 0 && index % DETAIL_DECORATION_YIELD_INTERVAL === 0) {
        await yieldToMainThread();
      }

      decoratedRows.push(
        applyOverrideToCharacterDetailRecord(
          {
            ...record,
            detail: this.normalizeCharacterDetail(
              this.parseJson<CharacterDetail>(
                rows[index]?.['detail_json'] ?? null,
                this.emptyDetail(record.id),
              ),
              record.id,
            ),
            detailImageUrl: this.resolveImageUrl(record.assets, {
              preferExactLocal: true,
              installedPacks,
            }),
          },
          overridesByCharacterId.get(record.id) ?? null,
        ),
      );
    }

    return decoratedRows;
  }

  private async loadAllDetailedCharacters(): Promise<CharacterDetailRecord[]> {
    const rows = await this.selectAll(
      `
        SELECT
          c.id,
          c.name,
          c.is_incomplete,
          c.type,
          c.primary_class,
          c.secondary_class,
          c.classes_json,
          c.stars,
          c.stars_label,
          c.cost,
          c.combo,
          c.min_hp,
          c.min_atk,
          c.min_rcv,
          c.max_hp,
          c.max_atk,
          c.max_rcv,
          c.growth,
          c.captain_hp_boost,
          c.captain_atk_boost,
          c.captain_average_boost,
          c.region_json,
          c.region_release_json,
          c.assets_json,
          c.search_text,
          d.detail_json
        FROM characters c
        LEFT JOIN character_details d ON d.character_id = c.id
        ORDER BY c.stars DESC, c.id DESC
      `,
    );

    return this.decorateCharacterDetailRows(rows);
  }

  private sortDetailedRecords(
    records: CharacterDetailRecord[],
    sortMode: DetailedCharacterSearchQuery['sortMode'] | 'catalog',
    idOrder: CharacterIdOrder | undefined = 'newest',
  ): CharacterDetailRecord[] {
    return [...records].sort((left, right) => {
      if (sortMode === 'captainHpBoost') {
        return compareBoostSortedCharacters(left, right, 'captainHpBoost', idOrder);
      }

      if (sortMode === 'captainAtkBoost') {
        return compareBoostSortedCharacters(left, right, 'captainAtkBoost', idOrder);
      }

      if (sortMode === 'captainAverageBoost') {
        return compareBoostSortedCharacters(left, right, 'captainAverageBoost', idOrder);
      }

      if (sortMode === 'newest') {
        return right.id - left.id;
      }

      if (sortMode === 'powerFirst' || sortMode === 'idDesc') {
        return compareCharactersByPowerFirst(left, right);
      }

      if (sortMode === 'idAsc') {
        return left.id - right.id;
      }

      if (sortMode === 'nameAsc') {
        const nameDifference = left.name.localeCompare(right.name, undefined, {
          sensitivity: 'base',
        });

        return nameDifference || compareCharacterIds(left.id, right.id, idOrder);
      }

      if (sortMode === 'nameDesc') {
        const nameDifference = right.name.localeCompare(left.name, undefined, {
          sensitivity: 'base',
        });

        return nameDifference || compareCharacterIds(left.id, right.id, idOrder);
      }

      return compareCharacterIds(left.id, right.id, idOrder);
    });
  }

  private matchesSearchTerm(record: CharacterRecord, searchTerm: string): boolean {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();

    if (!normalizedSearchTerm.length) {
      return true;
    }

    return this.buildSearchableRecordText(record).includes(normalizedSearchTerm);
  }

  /**
   * Thin wrapper over the shared predicate. Kept as a private method purely so
   * `getAutoBuilderCandidates` keeps its existing call shape.
   */
  private matchesTypes(
    record: CharacterRecord,
    selectedTypes: string[],
    matchMode: CharacterFacetMatchMode,
  ): boolean {
    return matchesCharacterFacet('type', record, { values: selectedTypes, matchMode });
  }

  /** Thin wrapper over the shared predicate — see `matchesTypes`. */
  private matchesClasses(
    record: CharacterRecord,
    selectedClasses: string[],
    matchMode: CharacterFacetMatchMode,
  ): boolean {
    return matchesCharacterFacet('class', record, { values: selectedClasses, matchMode });
  }

  private hasUsableRumbleData(rumbleData: Record<string, unknown> | null): boolean {
    if (!rumbleData || typeof rumbleData !== 'object' || Array.isArray(rumbleData)) {
      return false;
    }

    if (typeof rumbleData['basedOn'] === 'number') {
      return true;
    }

    return [
      'ability',
      'special',
      'llbability',
      'llbspecial',
      'gpability',
      'gpspecial',
      'resilience',
      'llbresilience',
    ].some((key) => Array.isArray(rumbleData[key]) && rumbleData[key].length > 0);
  }

  /**
   * Which image a character card shows, in order.
   *
   * 869f135u6. There are FIVE image precedence orders in this app and none of
   * them was written down. `docs/character-image-precedence.md` holds all five
   * side by side; this comment is the one the next reader of this file needs.
   *
   * Two orders live here, and `preferExactLocal` is the switch. List rows call it
   * `false` (`:1753`), detail rows call it `true` (`:1788-1789`):
   *
   *   preferExactLocal: false   thumbnailLocal -> exactLocal -> glo if installed
   *                             -> jap if installed -> placeholder
   *   preferExactLocal: true    exactLocal -> thumbnailLocal -> ... the same tail
   *
   * So a locally corrected portrait wins on the detail page and loses on the list
   * - deliberately, because the exact image is the large one.
   *
   * Two things this order does NOT decide:
   *
   *   - The reader's own override outranks all of it, applied afterwards in
   *     `character-overrides.utils.ts` (`:466-467`, `:484`): a stored
   *     `thumbnailDataUrl` or `detailDataUrl` replaces whatever this returns.
   *   - Nothing here handles an image that 404s. There is no `(error)` handler on
   *     any of the 63 `<img>` sites in the app, so a manifest claiming a pack is
   *     installed against a device where the file is gone renders a broken image
   *     rather than reaching `FALLBACK_CHARACTER_IMAGE`. The placeholder is the
   *     fallback for "no path recorded", never for "the path did not load".
   *
   * `thumbnailGlobal: false` does not mean "no thumbnail is installed" - it means
   * no path was found in the upstream pack listing at import time. Installedness
   * is the separate `.pack-ready` -> `manifest.installed` fact read above.
   */
  private resolveImageUrl(
    assets: CharacterAssets,
    options: {
      preferExactLocal: boolean;
      installedPacks?: Map<string, OfflinePackSummary>;
    },
  ): string {
    const packMap = options.installedPacks ?? new Map();
    const thumbnailGloInstalled = packMap.get('thumbnailsGlo')?.installed ?? false;
    const thumbnailJapanInstalled = packMap.get('thumbnailsJapan')?.installed ?? false;

    if (options.preferExactLocal && assets.exactLocal) {
      return this.normalizeAssetUrl(assets.exactLocal);
    }

    if (assets.thumbnailLocal) {
      return this.normalizeAssetUrl(assets.thumbnailLocal);
    }

    if (assets.exactLocal) {
      return this.normalizeAssetUrl(assets.exactLocal);
    }

    if (thumbnailGloInstalled && assets.thumbnailGlobal) {
      return this.toLocalAssetPath('thumbnails-glo', assets.thumbnailGlobal);
    }

    if (thumbnailJapanInstalled && assets.thumbnailJapan) {
      return this.toLocalAssetPath('thumbnails-jap', assets.thumbnailJapan);
    }

    return FALLBACK_CHARACTER_IMAGE;
  }

  private toLocalAssetPath(packId: string, relativePath: string): string {
    return `assets/offline-packs/${packId}/${relativePath}`;
  }

  private normalizeAssetUrl(assetUrl: string): string {
    return assetUrl.startsWith('/assets/') ? assetUrl.slice(1) : assetUrl;
  }

  private resolveShipThumbUrl(
    thumb: string | null,
    installedPacks?: Map<string, OfflinePackSummary>,
  ): string | null {
    const trimmedThumb = thumb?.trim() ?? '';

    if (!trimmedThumb.length) {
      return null;
    }

    if (
      trimmedThumb.startsWith('assets/') ||
      trimmedThumb.startsWith('/assets/') ||
      trimmedThumb.startsWith('http://') ||
      trimmedThumb.startsWith('https://') ||
      trimmedThumb.startsWith('data:')
    ) {
      return this.normalizeAssetUrl(trimmedThumb);
    }

    const shipThumbnailsInstalled =
      (installedPacks ?? new Map()).get(SHIP_THUMBNAIL_PACK_KEY)?.installed ?? false;

    return shipThumbnailsInstalled
      ? this.toLocalAssetPath(SHIP_THUMBNAIL_PACK_ID, trimmedThumb)
      : null;
  }

  private emptyDetail(characterId: number): CharacterDetail {
    return {
      characterId,
      captainAbility: null,
      captainAbilityVariants: [],
      captainAbilityCoverage: { entries: [] },
      captainNotes: null,
      specialName: null,
      specialText: null,
      specialNotes: null,
      superSpecialText: null,
      superSpecialCriteriaText: null,
      superSpecialNotes: null,
      superSpecialCriteria: null,
      partyConflictKeys: [],
      characterTags: [],
      builderAbilities: [],
      sailorAbilities: [],
      sailorNotes: null,
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      exSuperData: null,
      superType: null,
      superTandemData: null,
      finalTapData: null,
      rushSugoSpecialData: null,
      superClass: null,
      switchEffectData: null,
      captainShiftData: null,
      rumbleData: null,
    };
  }

  private normalizeCharacterDetail(detail: CharacterDetail, characterId: number): CharacterDetail {
    const normalizedDetail = {
      ...(detail as CharacterDetail & {
        limitBreak?: unknown;
      }),
    } as CharacterDetail & {
      specialAbilities?: CharacterDetail['builderAbilities'];
      limitBreak?: unknown;
    };
    delete normalizedDetail.limitBreak;

    return {
      ...this.emptyDetail(characterId),
      ...normalizedDetail,
      characterId,
      captainAbilityVariants: Array.isArray(normalizedDetail.captainAbilityVariants)
        ? normalizedDetail.captainAbilityVariants
            .map((entry) => {
              if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                return null;
              }

              const key = String(entry.key ?? '').trim();
              const label = String(entry.label ?? '').trim();
              const text = String(entry.text ?? '').trim();

              if (!key.length || !label.length || !text.length) {
                return null;
              }

              return { key, label, text };
            })
            .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        : [],
      captainAbilityCoverage: normalizeCaptainAbilityCoverage(
        normalizedDetail.captainAbilityCoverage,
      ),
      captainNotes:
        typeof normalizedDetail.captainNotes === 'string' &&
        normalizedDetail.captainNotes.trim().length
          ? normalizedDetail.captainNotes.trim()
          : null,
      supportData: normalizeSupportData(normalizedDetail.supportData),
      exSuperData:
        normalizedDetail.exSuperData &&
        typeof normalizedDetail.exSuperData === 'object' &&
        !Array.isArray(normalizedDetail.exSuperData)
          ? normalizedDetail.exSuperData
          : null,
      superSpecialCriteria: normalizeSuperSpecialCriteria(normalizedDetail.superSpecialCriteria),
      partyConflictKeys: Array.isArray(normalizedDetail.partyConflictKeys)
        ? normalizedDetail.partyConflictKeys
            .map((value) => String(value ?? '').trim())
            .filter((value) => value.length > 0)
        : [],
      characterTags: Array.isArray(normalizedDetail.characterTags)
        ? normalizedDetail.characterTags
            .map((value) => String(value ?? '').trim())
            .filter((value) => value.length > 0)
        : [],
      superTandemData: normalizeSuperTandemData(normalizedDetail.superTandemData),
      finalTapData:
        normalizedDetail.finalTapData &&
        typeof normalizedDetail.finalTapData === 'object' &&
        !Array.isArray(normalizedDetail.finalTapData)
          ? normalizedDetail.finalTapData
          : null,
      rushSugoSpecialData:
        normalizedDetail.rushSugoSpecialData &&
        typeof normalizedDetail.rushSugoSpecialData === 'object' &&
        !Array.isArray(normalizedDetail.rushSugoSpecialData)
          ? normalizedDetail.rushSugoSpecialData
          : null,
      switchEffectData:
        normalizedDetail.switchEffectData &&
        typeof normalizedDetail.switchEffectData === 'object' &&
        !Array.isArray(normalizedDetail.switchEffectData)
          ? normalizedDetail.switchEffectData
          : null,
      captainShiftData:
        normalizedDetail.captainShiftData &&
        typeof normalizedDetail.captainShiftData === 'object' &&
        !Array.isArray(normalizedDetail.captainShiftData)
          ? normalizedDetail.captainShiftData
          : null,
      builderAbilities:
        normalizedDetail.builderAbilities ?? normalizedDetail.specialAbilities ?? [],
    };
  }

  private parseJson<T>(value: string | number | null | undefined, fallback: T): T {
    if (typeof value !== 'string' || !value.length) {
      return fallback;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(path);

    if (!response.ok) {
      throw new Error(`Failed to fetch ${path}: ${response.status}`);
    }

    return (await response.json()) as T;
  }
  private normalizeManifest(manifest: DatasetManifest): DatasetManifest {
    return {
      ...manifest,
      schemaVersion: Number.isInteger(Number(manifest.schemaVersion))
        ? Number(manifest.schemaVersion)
        : 1,
      availableTypes: this.normalizeManifestValues(manifest.availableTypes),
      availableClasses: this.normalizeManifestValues(
        manifest.availableClasses,
        INVALID_CLASS_PATTERN,
      ),
    };
  }

  private normalizeManifestValues(values: unknown[], excludePattern?: RegExp): string[] {
    return [...new Set(this.flattenValues(values))]
      .map((value) => String(value ?? '').trim())
      .filter((value) => value.length > 0)
      .filter((value) => !excludePattern?.test(value))
      .sort((left, right) => left.localeCompare(right));
  }

  private flattenValues(values: unknown): unknown[] {
    if (!Array.isArray(values)) {
      return [values];
    }

    return values.flatMap((value) => this.flattenValues(value));
  }

  private resolveSearchText(row: SqlRow): string {
    if (typeof row['search_text'] === 'string' && row['search_text'].trim().length > 0) {
      return row['search_text'].trim().toLowerCase();
    }

    return [
      row['id'],
      row['name'],
      row['type'],
      row['primary_class'],
      row['secondary_class'] ?? '',
      ...this.parseJson<string[]>(row['classes_json'], []),
    ]
      .join(' ')
      .toLowerCase();
  }

  private buildSearchableRecordText(record: CharacterRecord): string {
    return [
      record.searchText ?? '',
      record.id,
      record.name,
      record.type,
      record.primaryClass,
      record.secondaryClass ?? '',
      ...record.classes,
    ]
      .join(' ')
      .toLowerCase();
  }
}
