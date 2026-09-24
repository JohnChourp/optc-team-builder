import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  type CharacterCaptainAbilityCoverage,
  type CharacterDetailRecord,
  type SavedTeam,
} from '../models/optc.models';
import { buildAutoTeamCompareSnapshotFromSavedTeam } from '../../pages/auto-team-builder/auto-team-builder-team-compare.utils';
import { TeamCoverageSummaryComponent } from '../../shared/team-coverage-summary/team-coverage-summary.component';
import { resolveCaptainTeamConditionStatus } from './captain-team-condition-status.utils';
import { resolveTeamCoverageSummary } from './team-coverage-summary.utils';

/*
 * 869f6td4c. Every "is this team complete?" answer honours the optional Friend Captain.
 *
 * The owner's rule (2026-09-08): a team does not require a Friend Captain, and an empty seat boosts
 * nothing. 869exmkr2 applied it to the status line, Captain Coverage's messages and Saved Teams. It
 * did not reach the team coverage panel, whose summary still counted to six - so Captain + four subs
 * got no panel at all, on every screen that shows it. That is the SECOND site of one defect class,
 * which is what earns this guard.
 *
 * "Every" was found, not assumed: across src/app the only functions that answer it are the two
 * below (`isComplete` on the status line and on the coverage summary), and the only seat-count
 * test was the summary's `=== 6`. The panel component and Compare's `captainTierCoverage` read the
 * summary, so they are pinned too. A new completeness answer belongs in this file.
 *
 * Seats are Captain, Friend Captain, then four subs - the order every caller already passes.
 */
describe('a team with no Friend Captain is complete everywhere', () => {
  const captain = createCharacter(1001, 'DEX', 'Boosts ATK of all characters by 2x.', allCharactersCoverage());
  const subs = [2001, 2002, 2003, 2004].map((id) => createCharacter(id, 'STR'));
  const friendless = [captain, null, ...subs];
  const missingASub = [captain, null, ...subs.slice(0, 3), null];
  const withFriendCaptain = [captain, captain, ...subs];

  it('reads complete on the status line, as the hosts ask it', () => {
    expect(statusLine(friendless)).toMatchObject({ isComplete: true, state: 'full', filledSlotCount: 5 });
    expect(statusLine(withFriendCaptain).isComplete).toBe(true);
    expect(statusLine(missingASub)).toMatchObject({ isComplete: false, state: 'pending' });
  });

  it('reads complete in the team coverage summary, with the tiers the Captain covers', () => {
    const summary = resolveTeamCoverageSummary({ captain, friendCaptain: null, members: friendless });

    expect(summary.isComplete).toBe(true);
    expect(summary.tiers.map((tier) => tier.captureSource)).toEqual(['captain-only']);

    expect(
      resolveTeamCoverageSummary({ captain, friendCaptain: captain, members: withFriendCaptain }).tiers.map(
        (tier) => tier.captureSource,
      ),
    ).toEqual(['both']);
    expect(
      resolveTeamCoverageSummary({ captain, friendCaptain: null, members: missingASub }),
    ).toMatchObject({ isComplete: false, tiers: [{ captureSource: 'none' }] });
  });

  it('shows the team coverage panel, fed the way the four screens feed it', () => {
    const panel = new TeamCoverageSummaryComponent();

    panel.captain = friendless[0];
    panel.friendCaptain = friendless[1];
    panel.members = friendless;

    expect(panel.summary().isComplete && panel.hasAnyTiers()).toBe(true);

    panel.members = missingASub;
    expect(panel.summary().isComplete).toBe(false);

    const template = readFileSync(
      resolve(process.cwd(), 'src/app/shared/team-coverage-summary/team-coverage-summary.component.html'),
      'utf8',
    );

    // What the two assertions above stand for: the panel renders on exactly this condition.
    expect(template).toContain('@if (summary().isComplete && hasAnyTiers())');
  });

  it("counts the Captain's tiers in Compare for a saved team with no Friend Captain", () => {
    const characters = new Map([captain, ...subs].map((character) => [character.id, character]));
    const tierCoverage = (slots: SavedTeam['slots']) =>
      buildAutoTeamCompareSnapshotFromSavedTeam(savedTeam(slots), characters, null, []).metrics.find(
        (metric) => metric.key === 'captainTierCoverage',
      )?.value;

    expect(tierCoverage([1001, null, 2001, 2002, 2003, 2004])).toBe(1);
    expect(tierCoverage([1001, 1001, 2001, 2002, 2003, 2004])).toBe(1);
    expect(tierCoverage([1001, null, 2001, 2002, 2003, null])).toBe(0);
  });
});

function statusLine(slots: ReadonlyArray<CharacterDetailRecord | null>) {
  // The options Manual Team Builder, Captain Coverage and Saved Teams pass.
  return resolveCaptainTeamConditionStatus({
    expectedSlotCount: 6,
    optionalSlotIndexes: [1],
    coverageMode: 'simpleBoostScope',
    leaders: [
      { role: 'captain', label: 'Captain', character: slots[0] ?? null },
      { role: 'friendCaptain', label: 'Friend Captain', character: slots[1] ?? null },
    ],
    slotLabels: ['Captain', 'Friend Captain', 'Slot 3', 'Slot 4', 'Slot 5', 'Slot 6'],
    slots,
  });
}

function savedTeam(slots: SavedTeam['slots']): SavedTeam {
  return {
    id: 'team-1',
    name: 'Friendless',
    slots,
    shipId: null,
    notes: '',
    createdAt: '2026-09-25T00:00:00.000Z',
    updatedAt: '2026-09-25T00:00:00.000Z',
  };
}

function allCharactersCoverage(): CharacterCaptainAbilityCoverage {
  return {
    entries: [
      {
        key: 'captain',
        label: 'Captain Ability',
        tiers: [
          {
            tier: 1,
            kind: 'baseline',
            scope: 'crew-wide',
            characterConditions: {
              universal: true,
              fallbackOther: false,
              selfOnly: false,
              types: [],
              classes: [],
              characterTags: [],
            },
            teamConditions: [],
            fieldConditions: [],
            triggerConditions: [],
            clauses: ['Boosts ATK of all characters by 2x'],
            atkBoost: 2,
          },
        ],
      },
    ],
  };
}

function createCharacter(
  id: number,
  type: string,
  captainAbility: string | null = null,
  captainAbilityCoverage?: CharacterCaptainAbilityCoverage,
): CharacterDetailRecord {
  return {
    id,
    name: `Character ${id}`,
    searchText: '',
    isIncomplete: false,
    type,
    classes: ['Fighter'],
    primaryClass: 'Fighter',
    secondaryClass: null,
    stars: 5,
    cost: 30,
    combo: 4,
    captainHpBoost: 0,
    captainAtkBoost: 0,
    captainAverageBoost: 0,
    stats: {
      min: { hp: null, atk: null, rcv: null },
      max: { hp: null, atk: null, rcv: null },
      growth: null,
    },
    regionArtwork: { exactLocal: false, thumbnailGlobal: false, thumbnailJapan: false },
    regionRelease: { availableOnGlobal: null },
    assets: { exactLocal: null, thumbnailGlobal: null, thumbnailJapan: null },
    imageUrl: 'assets/placeholders/character-card.svg',
    detailImageUrl: 'assets/placeholders/character-card.svg',
    detail: {
      characterId: id,
      captainAbility,
      captainAbilityVariants: [],
      captainAbilityCoverage,
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
      superType: null,
      superTandemData: null,
      superClass: null,
      captainShiftData: null,
      rumbleData: null,
    },
  } satisfies CharacterDetailRecord;
}
