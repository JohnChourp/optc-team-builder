import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { CrewForgePage } from './crew-forge.page';

vi.mock('@ionic/angular', () => ({
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSelect: class {},
}));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-footer', () => ({ IonFooter: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-menu-button', () => ({ IonMenuButton: class {} }));
vi.mock('@ionic/angular/ion-select-option', () => ({ IonSelectOption: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

/*
 * 869f6td1j. A build publishes teams only for the roster still on screen.
 *
 * Replace is deliberately NOT disabled while a build runs, and neither is correcting a slot. So a
 * build started from screenshot A could finish after the reader had replaced it with B, and its
 * teams - made entirely of A's units - landed under B's roster: "5 of 5 units in the shown team
 * are NOT in the screenshot on screen", measured on the real page. A build whose roster changed
 * while it ran is now dropped, and the reader builds again for what they see.
 *
 * The build is held open by hand, the way a real one takes seconds on workers, so each case can act
 * in the middle of it. The rest of the page lives in `crew-forge.page.spec.ts`; this harness is a
 * trimmed copy on purpose (a new topic gets its own file).
 */
describe('Crew Forge build that outlives its roster', () => {
  const SCREENSHOT_A = [101, 102, 103, 104, 105];
  const SCREENSHOT_B = [111, 112, 113, 114, 115];

  it('drops teams built from a screenshot the reader replaced mid-build', async () => {
    const { page, builds, importScreenshot } = await createPage();

    await importScreenshot(SCREENSHOT_A);
    const build = page.buildTeams();

    expect(page.building()).toBe(true);

    await importScreenshot(SCREENSHOT_B);
    builds.finish(0);
    await build;

    expect(page.recognizedRosterCharacterIds()).toEqual(SCREENSHOT_B);
    expect(page.results()).toEqual([]);
    expect(page.building()).toBe(false);
    // Nothing failed: the reader is not told "no teams" for a roster nobody built from.
    expect(page.errorMessage()).toBe('');
    expect(page.emptyStateVisible()).toBe(true);

    // Building again answers for the screenshot on screen.
    const rebuild = page.buildTeams();

    builds.finish(1);
    await rebuild;

    expect(builds.rosters).toEqual([SCREENSHOT_A, SCREENSHOT_B]);
    expect(unitsOnShownTeams(page)).toEqual(SCREENSHOT_B);
  });

  it('drops teams built before a slot was corrected mid-build', async () => {
    const { page, builds, importScreenshot } = await createPage();

    await importScreenshot(SCREENSHOT_A);
    const build = page.buildTeams();

    page.applyRecognitionCandidate('sub-1', 120, 1);
    builds.finish(0);
    await build;

    expect(page.recognizedRosterCharacterIds()).toEqual([101, 102, 120, 104, 105]);
    expect(page.results()).toEqual([]);
    expect(page.building()).toBe(false);
  });

  it('keeps the teams when nothing on screen changed while it built', async () => {
    const { page, builds, importScreenshot } = await createPage();

    await importScreenshot(SCREENSHOT_A);
    const build = page.buildTeams();

    builds.finish(0);
    await build;

    expect(unitsOnShownTeams(page)).toEqual(SCREENSHOT_A);
    expect(page.building()).toBe(false);
  });

  it('keeps the teams when the replacement shows the same units in another order', async () => {
    const { page, builds, importScreenshot } = await createPage();

    await importScreenshot(SCREENSHOT_A);
    const build = page.buildTeams();

    await importScreenshot([105, 104, 103, 102, 101]);
    builds.finish(0);
    await build;

    expect(unitsOnShownTeams(page)).toEqual(SCREENSHOT_A);
  });

  it('does not say "no teams" for a replaced screenshot when the old build found none', async () => {
    const { page, builds, importScreenshot } = await createPage();

    await importScreenshot(SCREENSHOT_A);
    const build = page.buildTeams();

    await importScreenshot(SCREENSHOT_B);
    builds.finishEmpty(0);
    await build;

    expect(page.errorMessage()).toBe('');
    expect(page.noResultStateVisible()).toBe(false);
  });
});

function unitsOnShownTeams(page: CrewForgePage): number[] {
  return page.visibleResults().flatMap((result) => result.slots.map((slot) => slot.character.id));
}

async function createPage() {
  const catalog = Array.from({ length: 30 }, (_, index) => ({
    id: 101 + index,
    name: `Character ${101 + index}`,
    imageUrl: `character-${101 + index}.png`,
    type: 'DEX',
    primaryClass: 'Fighter',
    secondaryClass: null,
  }));
  const pending: Array<{ roster: number[]; resolve: (value: unknown) => void }> = [];
  const builds = {
    get rosters() {
      return pending.map((build) => build.roster);
    },
    finish(index: number) {
      const build = pending[index]!;

      build.resolve({ totalResults: 1, limit: 50, results: [createRankedResult(build.roster)] });
    },
    finishEmpty(index: number) {
      pending[index]!.resolve({ totalResults: 0, limit: 50, results: [] });
    },
  };
  const autoTeamBuilder = {
    buildRankedTeamsFromRoster: vi.fn(
      (input: { rosterCharacterIds: number[] }) =>
        new Promise((resolve) => {
          pending.push({ roster: [...input.rosterCharacterIds], resolve });
        }),
    ),
  };
  let nextRoster: number[] = [];
  const crewForgeImageImport = {
    loadImageFile: vi.fn(async (file: { name: string }) => ({
      dataUrl: `data:image/png;base64,${file.name}`,
      width: 1080,
      height: 1920,
      name: file.name,
    })),
    resolveProfile: vi.fn((profiles: Array<{ id: string }>) => profiles[0] ?? null),
    recognizeImage: vi.fn(async () => createRecognitionResult(nextRoster)),
    applyManualSelection: vi.fn(
      (
        result: ReturnType<typeof createRecognitionResult>,
        slotKey: string,
        characterId: number | null,
      ) => ({
        ...result,
        slots: result.slots.map((slot) =>
          slot.slotKey === slotKey ? { ...slot, characterId, manuallyEdited: true } : slot,
        ),
      }),
    ),
  };
  const userState = {
    readyCrewForgeImageProfiles: vi.fn().mockResolvedValue(undefined),
    readyAutoTeamBuilderWorkerPreference: vi.fn().mockResolvedValue(undefined),
    crewForgeImageProfiles: signal([createProfile()]),
    crewForgeLastImageProfileId: signal<string | null>('profile-1'),
    resolveAutoTeamBuilderWorkerCount: vi.fn().mockReturnValue(3),
    setCrewForgeLastImageProfileId: vi.fn().mockResolvedValue(undefined),
  };
  const page = new CrewForgePage(
    {
      ensureLoaded: vi.fn().mockResolvedValue(undefined),
      catalog: signal(catalog),
      getCharactersByIds: vi.fn((ids: number[]) => catalog.filter((item) => ids.includes(item.id))),
    } as never,
    autoTeamBuilder as never,
    userState as never,
    { translate: vi.fn((key: string) => key) } as never,
    crewForgeImageImport as never,
  );
  const input = { value: '', click: vi.fn() };
  let screenshotCount = 0;
  const importScreenshot = async (roster: number[]) => {
    nextRoster = roster;
    screenshotCount += 1;
    await page.onImageImportSelected(
      { target: { files: [{ name: `screenshot-${screenshotCount}.png`, type: 'image/png' }] } } as never,
      input as never,
    );
  };

  await page.ngOnInit();

  return { page, builds, importScreenshot };
}

function createRecognitionResult(characterIds: number[]) {
  return {
    profileId: 'profile-1',
    imageWidth: 1080,
    imageHeight: 1920,
    reason: 'matched' as const,
    slots: characterIds.map((characterId, index) => {
      const slotKey = index < 2 ? `leader-${index + 1}` : `sub-${index - 1}`;

      return {
        slotKey,
        label: slotKey,
        role: index < 2 ? 'leader' : 'sub',
        characterId,
        confidence: 0.96,
        status: 'matched',
        cropDataUrl: 'data:image/png;base64,Y3JvcA==',
        candidates: [{ characterId, confidence: 0.96, source: 'catalog' as const }],
        manuallyEdited: false,
      };
    }),
  };
}

/** A team made of exactly the roster it was built from, so a stale one is recognisable. */
function createRankedResult(roster: number[]) {
  return {
    teamKey: `built-from-${roster.join('-')}`,
    candidateCount: roster.length,
    input: {} as never,
    coverage: { utility: [], burst: [], consistency: [] },
    slots: roster.map((id, index) => ({
      role: index === 0 ? 'captain' : index === 1 ? 'friendCaptain' : 'sub',
      reasonChips: [],
      character: { id, name: `Character ${id}`, imageUrl: `character-${id}.png`, detail: { builderAbilities: [] } },
    })),
    abilityBreakdown: {
      distinctAbilityCount: 0,
      allAbilities: [],
      uniqueAbilities: [],
      duplicateAbilities: [],
    },
    ranking: {
      distinctAbilityCount: 0,
      utilityCoverageCount: 0,
      burstCoverageCount: 0,
      consistencyCoverageCount: 0,
      powerScore: 0,
      recencyScore: 0,
    },
  };
}

function createProfile() {
  return {
    id: 'profile-1',
    name: 'Main Profile',
    source: 'user' as const,
    imageWidth: 1080,
    imageHeight: 1920,
    slotDefinitions: [],
    preprocess: {
      fingerprintSize: 16,
      contrast: 1,
      brightness: 0,
      grayscale: true,
      invert: false,
      blurRadius: 0,
      matchThreshold: 0.92,
      emptyVarianceThreshold: 0.005,
    },
    examples: [],
    exemplars: [],
    createdAt: '2026-04-20T10:00:00.000Z',
    updatedAt: '2026-04-20T10:00:00.000Z',
  };
}
