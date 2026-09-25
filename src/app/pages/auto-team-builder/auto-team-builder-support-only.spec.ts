import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  AUTO_BUILD_MANUAL_SLOT_ROLES,
  type AutoBuildManualSlotRole,
  type AutoBuildManualSlotSelection,
  createEmptyAutoBuildManualSlots,
} from '../../core/models/auto-team-builder.models';
import { type CharacterDetailRecord, type CharacterDetail } from '../../core/models/optc.models';
import {
  buildAutoTeamSelectionExportPayload,
  parseAutoTeamSelectionImportPayload,
  sanitizeAutoTeamSelectionImportPayload,
} from './auto-team-builder-export.utils';
import { AutoTeamBuilderPage } from './auto-team-builder.page';

vi.mock('@ionic/angular', () => ({
  AlertController: class {},
  IonCheckbox: class {},
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSegment: class {},
  IonSelect: class {},
  IonTextarea: class {},
  IonToggle: class {},
}));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-footer', () => ({ IonFooter: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-menu-button', () => ({ IonMenuButton: class {} }));
vi.mock('@ionic/angular/ion-segment-button', () => ({ IonSegmentButton: class {} }));
vi.mock('@ionic/angular/ion-select-option', () => ({ IonSelectOption: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

/*
 * 869f6td4p. The Auto Team Builder never picks a Support-only character by itself - its candidate
 * pool keeps only units with Captain, special or sailor text - so the way one reached a crew here
 * was a manual pick, and a REQUIRED pick, which forces the unit into the pool. Every manual slot now
 * refuses one and says why; a pick that arrives with a saved team or a preset is marked and can
 * never be required.
 */

const SUPPORT = [{ supportedCharactersText: 'Blade', levelDescriptions: ['Reduces Poison.'] }];
const BIBLO = createRecord(4645, 'Biblo', { supportData: SUPPORT });
const LUFFY = createRecord(1, 'Monkey D. Luffy', {
  captainAbility: 'Boosts ATK of all characters by 2x',
  specialText: 'Deals 5x damage',
});

/** `key|param|param`, so an assertion reads the key and the values it was given. */
function translate(key: string, parameters?: Record<string, unknown>): string {
  return [key, ...Object.values(parameters ?? {})].join('|');
}

interface PageProbe {
  canAssignCharacterToManualSlot(
    role: AutoBuildManualSlotRole,
    character: CharacterDetailRecord,
  ): boolean;
  toggleRequiredManualSlotCharacter(role: AutoBuildManualSlotRole, characterId: number): void;
  requiredManualPickButtonLabel(
    role: AutoBuildManualSlotRole,
    character: Pick<CharacterDetailRecord, 'id' | 'name'>,
  ): string;
  manualCandidateThumbLabel(card: {
    character: CharacterDetailRecord;
    isSelectedInActiveSlot: boolean;
    isSelectableInActiveSlot: boolean;
    selectionSupportLabel: string | null;
  }): string;
  buildManualCharacterCards(
    characters: CharacterDetailRecord[],
    highlightedRequirements: [],
  ): Array<{
    character: CharacterDetailRecord;
    isSelectableInActiveSlot: boolean;
    selectionSupportLabel: string | null;
  }>;
  manualSlots: ReturnType<typeof signal<AutoBuildManualSlotSelection[]>>;
}

function createPage(
  slots: AutoBuildManualSlotSelection[] = createEmptyAutoBuildManualSlots(),
  activeRole: AutoBuildManualSlotRole = 'sub1',
): PageProbe {
  const page = Object.create(AutoTeamBuilderPage.prototype) as AutoTeamBuilderPage;

  Object.assign(page, {
    i18n: { translate },
    manualSlots: signal(slots),
    lockedCharacterRecords: () => ({ [BIBLO.id]: BIBLO, [LUFFY.id]: LUFFY }),
    effectiveExcludedCharacterIds: () => [],
    favoriteCharacterIds: () => [],
    activeManualSlotRole: () => activeRole,
    building: () => false,
    resetBuildState: () => undefined,
  });

  return page as unknown as PageProbe;
}

function withPick(
  role: AutoBuildManualSlotRole,
  characterId: number,
  requiredCharacterId: number | null = null,
): AutoBuildManualSlotSelection[] {
  return createEmptyAutoBuildManualSlots().map((slot) =>
    slot.role === role ? { ...slot, characterIds: [characterId], requiredCharacterId } : slot,
  );
}

describe('Auto Team Builder - a Support-only character in the manual picks', () => {
  it('is refused by every manual slot, the two leader slots included', () => {
    const page = createPage();

    expect(AUTO_BUILD_MANUAL_SLOT_ROLES.length).toBe(6);

    for (const role of AUTO_BUILD_MANUAL_SLOT_ROLES) {
      expect(page.canAssignCharacterToManualSlot(role, BIBLO), role).toBe(false);
      // The control: an ordinary unit is still accepted by the same slot.
      expect(page.canAssignCharacterToManualSlot(role, LUFFY), role).toBe(true);
    }
  });

  it('stays in the picker and says why it cannot be picked', () => {
    for (const role of ['captain', 'sub1'] as const) {
      const cards = createPage(createEmptyAutoBuildManualSlots(), role).buildManualCharacterCards(
        [BIBLO, LUFFY],
        [],
      );

      expect(cards.map((card) => card.character.id)).toEqual([BIBLO.id, LUFFY.id]);
      expect(cards[0]?.isSelectableInActiveSlot).toBe(false);
      expect(cards[0]?.selectionSupportLabel).toBe('manual.slotSelection.supportOnly');
      expect(cards[1]?.isSelectableInActiveSlot).toBe(true);
      expect(cards[1]?.selectionSupportLabel).toBeNull();
    }
  });

  it('puts the reason on the compact thumb, where the picture alone said nothing', () => {
    const page = createPage();
    const refused = {
      character: BIBLO,
      isSelectedInActiveSlot: false,
      isSelectableInActiveSlot: false,
      selectionSupportLabel: 'Support only.',
    };

    expect(page.manualCandidateThumbLabel(refused)).toBe('Biblo - Support only.');
    expect(
      page.manualCandidateThumbLabel({
        ...refused,
        character: LUFFY,
        isSelectableInActiveSlot: true,
      }),
    ).toBe('Monkey D. Luffy');
  });

  it('is never made a required pick, which would force it into the crew', () => {
    const page = createPage(withPick('sub1', BIBLO.id));

    page.toggleRequiredManualSlotCharacter('sub1', BIBLO.id);

    expect(page.manualSlots().find((slot) => slot.role === 'sub1')?.requiredCharacterId).toBeNull();
    expect(page.requiredManualPickButtonLabel('sub1', BIBLO)).toBe(
      'manual.slotSelection.supportOnly',
    );

    // The control: the same toggle still requires an ordinary pick.
    const control = createPage(withPick('sub1', LUFFY.id));

    control.toggleRequiredManualSlotCharacter('sub1', LUFFY.id);

    expect(control.manualSlots().find((slot) => slot.role === 'sub1')?.requiredCharacterId).toBe(
      LUFFY.id,
    );
  });

  it('arrives from an imported preset as a choice, never as a required pick', () => {
    const manualSlots = createEmptyAutoBuildManualSlots().map((slot) =>
      slot.role === 'captain'
        ? { ...slot, characterIds: [LUFFY.id], requiredCharacterId: LUFFY.id }
        : slot.role === 'sub1'
          ? { ...slot, characterIds: [BIBLO.id], requiredCharacterId: BIBLO.id }
          : slot,
    );
    const { state } = sanitizeAutoTeamSelectionImportPayload(
      parseAutoTeamSelectionImportPayload(JSON.stringify(buildPayload(manualSlots))),
      {
        availableTypes: [],
        availableClasses: [],
        abilityCatalogItems: [],
        availableLockedCharacters: [LUFFY, BIBLO],
      },
    );
    const slot = (role: AutoBuildManualSlotRole) =>
      state.manualSlots.find((entry) => entry.role === role);

    expect(slot('sub1')?.characterIds).toEqual([BIBLO.id]);
    expect(slot('sub1')?.requiredCharacterId).toBeNull();
    expect(slot('captain')?.requiredCharacterId).toBe(LUFFY.id);
  });

  it('is marked on the slot chips it arrived in, in both chip lists', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/auto-team-builder/auto-team-builder.page.html'),
      'utf8',
    );
    const marks = template.match(
      /@if \(character\.supportOnly\) \{\s*<small\s+class="manual-lock-chip__branch"\s*>\s*\{\{ t\('manual\.slotSelection\.supportOnly'\) \}\}/gu,
    );

    expect(marks?.length).toBe(2);
    expect(template).toContain('[title]="manualCandidateThumbLabel(candidateCard)"');
  });
});

function buildPayload(manualSlots: AutoBuildManualSlotSelection[]) {
  return buildAutoTeamSelectionExportPayload({
    selectedTypes: [],
    selectedClasses: [],
    characterTagSets: { operator: 'all', sets: [] },
    requiredAbilities: [],
    enemyMechanics: [],
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    requireAllSlotsInLeaderSuperEffectScope: false,
    requireUniqueBaseCharacterNames: true,
    favoritesOnly: false,
    favoriteCount: 0,
    manualSlots,
    lockedCharacterIds: [LUFFY.id, BIBLO.id],
    lockedCharacters: [],
    excludedCharacters: [],
    selectedLeaderIds: [],
    captainLeaderId: null,
    friendCaptainLeaderId: null,
    exportedAt: '2026-09-25T00:00:00.000Z',
  });
}

function createRecord(
  id: number,
  name: string,
  detail: Partial<CharacterDetail>,
): CharacterDetailRecord {
  return {
    id,
    name,
    searchText: name.toLowerCase(),
    isIncomplete: false,
    type: 'DEX',
    classes: ['Fighter'],
    primaryClass: 'Fighter',
    secondaryClass: null,
    stars: 5,
    cost: 1,
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
      captainAbility: null,
      captainAbilityVariants: [],
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
      superClass: null,
      rumbleData: null,
      ...detail,
    },
  } satisfies CharacterDetailRecord;
}
