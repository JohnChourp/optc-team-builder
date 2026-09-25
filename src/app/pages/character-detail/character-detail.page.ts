import { CommonModule } from '@angular/common';
import {
  buildFailureLines,
  resolveFailureFamily,
} from '../../core/services/failure-message.utils';
import { Component, type OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { IonButton } from '@ionic/angular/ion-button';
import { IonContent } from '@ionic/angular/ion-content';
import { IonHeader } from '@ionic/angular/ion-header';
import { IonSpinner } from '@ionic/angular/ion-spinner';
import { IonTitle } from '@ionic/angular/ion-title';
import { IonToolbar } from '@ionic/angular/ion-toolbar';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { heart, heartOutline } from 'ionicons/icons';

import {
  type AutoBuildAbilityCatalog,
  type NormalizedBuilderAbility,
} from '../../core/models/auto-team-builder-ability.models';
import {
  type CharacterDetailRecord,
  type DatasetManifest,
} from '../../core/models/optc.models';
import { CharacterOverridesService } from '../../core/services/character-overrides.service';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { createLocalCharacterOverrideFromRecord } from '../../core/services/character-overrides.utils';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { APP_VERSION } from '../../core/data/app-version.data';
import { copyTextToClipboard } from '../../shared/clipboard/clipboard-copy.utils';
import { buildDisagreementReport } from '../../shared/disagreement/disagreement-report.utils';
import {
  buildProgressionCards,
  collectProgressionCharacterIds,
  type ProgressionDisplayCard,
} from './character-progression.presenter';
import { UserStateService } from '../../core/services/user-state.service';
import { resolveCharacterRegionStatus } from '../../core/services/character-region.utils';
import { isSupportOnlyCharacter } from '../../core/grammar/support-only-character';
import {
  buildCharacterOverridesTransferPayload,
  downloadCharacterOverridesExport,
  parseCharacterOverridesImportPayload,
  sanitizeCharacterOverridesImportPayload,
} from './character-overrides-transfer.utils';
import {
  buildCharacterDetailViewModel,
  resolveRumbleBasedOnId,
} from './character-detail.presenter';
import { CharacterAbilityGroupsComponent } from '../../shared/character-ability-groups/character-ability-groups.component';
import { ToolbarBackButtonComponent } from '../../shared/toolbar-back-button/toolbar-back-button.component';
import { CharacterDetailStylePanelsComponent } from './character-detail-style-panels.component';
import { resolveCharacterBridge } from './character-detail-bridge.utils';
import { countSavedTeamsWithCharacter } from './character-detail-saved-teams.utils';

/**
 * A transfer failure the reader is allowed to see, named by translation key.
 *
 * The catch used to render `error.message`, so whatever a parser or the
 * platform threw reached the reader verbatim - always English, on a screen that
 * is otherwise fully bilingual. Carrying a key instead means the message is
 * translated at the point it is shown, and an unexpected error falls back to a
 * translated generic rather than leaking its internals.
 */
class CharacterOverrideTransferError extends Error {
  public constructor(public readonly key: string) {
    super(key);
    this.name = 'CharacterOverrideTransferError';
  }
}

@Component({
  selector: 'app-character-detail-page',
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonSpinner,
    IonTitle,
    IonToolbar,
    RouterLink,
    CharacterAbilityGroupsComponent,
    CharacterDetailStylePanelsComponent,
    ToolbarBackButtonComponent,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './character-detail.page.html',
  styleUrl: './character-detail.page.scss',
})
export class CharacterDetailPage implements OnInit {
  public readonly character = signal<CharacterDetailRecord | null>(null);
  /**
   * 869f1327j. The out-of-region label, or null when there is nothing honest to say - see the
   * identical rule on the catalogue card. Null when the reader has named no version, and null when
   * upstream holds no release row for this unit.
   */
  public readonly regionBadgeLabel = computed<string | null>(() =>
    resolveCharacterRegionStatus(
      this.character()?.regionRelease,
      this.userState.gameRegionPreference(),
    ) === 'out-of-region'
      ? this.i18n.translate('region.japanOnly', undefined, 'character-detail')
      : null,
  );
  public readonly abilityCatalog = signal<AutoBuildAbilityCatalog | null>(null);
  public readonly rumbleBasedOnName = signal<string | null>(null);
  /** 869f1935z. Sockets, cooldown, evolution chain and drop sources for the character on screen. */
  public readonly progressionCards = signal<ProgressionDisplayCard[]>([]);
  public readonly loading = signal(true);
  public readonly transferFeedback = signal<{ tone: 'error' | 'success'; message: string } | null>(
    null,
  );
  public readonly favoriteIds;
  public readonly heroImageUrl = computed(() => {
    const currentCharacter = this.character();

    return currentCharacter?.imageUrl ?? currentCharacter?.detailImageUrl ?? '';
  });
  public readonly hasLocalOverride = computed(() => {
    const currentCharacter = this.character();

    return currentCharacter ? this.characterOverrides.hasOverride(currentCharacter.id) : false;
  });
  /** 869f13c5c. The page's one primary action - see `character-detail-bridge.utils.ts`. */
  public readonly bridge = computed(() => {
    const currentCharacter = this.character();

    return currentCharacter ? resolveCharacterBridge(currentCharacter) : null;
  });
  /**
   * 869f13c5c. Edit, export, import and reset are for a reader keeping their own copy of the data,
   * not for a visitor deciding what to do with this character, so they wait behind a toggle - unless
   * this character already has local changes, when they stay out and "Reset" is never hidden.
   */
  public readonly localToolsOpen = signal(false);
  /**
   * 869f6td4p. A character that can only go in a Support slot says so here, where a reader looks it
   * up; every team screen refuses it in a crew slot and names the same reason.
   */
  public readonly supportOnly = computed(() => isSupportOnlyCharacter(this.character()));
  /** 869f13c8r. How many of this reader's saved teams use this character; the line hides at 0. */
  public readonly savedTeamCount = computed(() => {
    const currentCharacter = this.character();

    return currentCharacter
      ? countSavedTeamsWithCharacter(this.userState.savedTeams(), currentCharacter.id)
      : 0;
  });
  public readonly viewModel = computed(() => {
    const currentCharacter = this.character();

    return currentCharacter
      ? buildCharacterDetailViewModel(currentCharacter, this.rumbleBasedOnName())
      : null;
  });

  public readonly favoriteIcon = heart;
  public readonly favoriteOutlineIcon = heartOutline;

  /**
   * 869f13gb3. The dataset the reader is on, for the disagreement report.
   *
   * Nullable throughout: the manifest may not have loaded, and a report that quotes
   * a version it does not have is worse than one that says `unknown` - the
   * maintainer's first question is whether the reader already had the fix.
   */
  public readonly datasetManifest = signal<DatasetManifest | null>(null);

  public constructor(
    private readonly route: ActivatedRoute,
    private readonly repository: OptcRepositoryService,
    private readonly userState: UserStateService,
    private readonly characterOverrides: CharacterOverridesService,
    private readonly i18n: AppI18nService,
  ) {
    this.favoriteIds = this.userState.favoriteCharacterIds;
  }

  /**
   * 869f13gb3. One action turns "this is wrong" into something a maintainer can act
   * on without a reply.
   *
   * Everything the app knows is assembled rather than transcribed - the character,
   * what the parser derived for it, the app version, the dataset version. Only the
   * expectation is left blank, because that is the one thing the app genuinely does
   * not know.
   *
   * Reuses `copyTextToClipboard` and the page's existing `transferFeedback` banner
   * rather than adding an overlay: the clipboard can fail for four different reasons
   * and that utility already names them, so a failure here tells the reader to copy
   * it themselves instead of appearing to do nothing.
   */
  public async copyDisagreementReport(character: CharacterDetailRecord): Promise<void> {
    const manifest = this.datasetManifest();
    const report = buildDisagreementReport({
      characterId: character.id,
      characterName: character.name,
      derivedTags: character.detail.builderAbilities.map(
        (ability) => `${ability.label} [${ability.source}]`,
      ),
      appVersion: APP_VERSION,
      datasetSourceVersion: manifest?.sourceVersion ?? null,
      datasetGeneratedOn: manifest?.generatedAt ? String(manifest.generatedAt).slice(0, 10) : null,
      language: this.i18n.activeLanguage(),
      generatedAt: new Date().toISOString(),
    });

    const failure = await copyTextToClipboard(report);

    this.transferFeedback.set(
      failure
        ? { tone: 'error', message: this.text('report.copyFailed') }
        : { tone: 'success', message: this.text('report.copied') },
    );
  }

  /** Translates within this page's own scope, so call sites carry only the key. */
  private text(key: string): string {
    return this.i18n.translate(key, undefined, 'character-detail');
  }

  public async ngOnInit(): Promise<void> {
    const characterId = Number(this.route.snapshot.paramMap.get('id'));

    if (!Number.isFinite(characterId)) {
      this.loading.set(false);
      return;
    }

    // Not awaited: the saved-team count is a footnote, so the character never waits for it, and a
    // storage failure leaves the count at 0 instead of failing the page.
    void this.userState.readySavedTeams().catch(() => undefined);
    await Promise.all([
      this.userState.readyFavoriteCharacterIds(),
      this.userState.readyGameRegionPreference(),
    ]);
    const [abilityCatalog, datasetManifest] = await Promise.all([
      this.repository.getAutoBuilderAbilityCatalog().catch(() => null),
      this.repository.getDatasetManifest().catch(() => null),
      this.loadCharacter(characterId, true),
    ]);

    this.abilityCatalog.set(abilityCatalog);
    this.datasetManifest.set(datasetManifest);
    this.loading.set(false);
  }

  public async toggleFavorite(characterId: number): Promise<void> {
    await this.userState.toggleFavorite(characterId);
  }

  public toggleLocalTools(): void {
    this.localToolsOpen.update((open) => !open);
  }

  public isFavorite(characterId: number): boolean {
    return this.favoriteIds().includes(characterId);
  }

  public displayBuilderAbilities(character: CharacterDetailRecord): NormalizedBuilderAbility[] {
    return character.detail.builderAbilities.filter(
      (ability) => ability.source !== 'captainAbility',
    );
  }

  public exportCharacterOverride(character: CharacterDetailRecord): void {
    const override =
      this.characterOverrides.getOverrideByCharacterId(character.id) ??
      createLocalCharacterOverrideFromRecord(character);

    downloadCharacterOverridesExport(buildCharacterOverridesTransferPayload([override]));
  }

  public async onCharacterOverrideFileSelected(
    event: Event,
    input: HTMLInputElement,
    character: CharacterDetailRecord,
  ): Promise<void> {
    const target = event.target as HTMLInputElement;
    const [file] = Array.from(target.files ?? []);

    input.value = '';

    if (!file) {
      return;
    }

    try {
      const payload = parseCharacterOverridesImportPayload(await file.text());
      const sanitizedImport = sanitizeCharacterOverridesImportPayload(payload);

      if (sanitizedImport.invalidOverrideCount > 0) {
        throw new CharacterOverrideTransferError('transfer.errors.invalidEntries');
      }

      if (
        sanitizedImport.overrides.length !== 1 ||
        sanitizedImport.overrides[0]?.characterId !== character.id
      ) {
        throw new CharacterOverrideTransferError('transfer.errors.characterMismatch');
      }

      await this.characterOverrides.saveOverride(sanitizedImport.overrides[0]!);
      await this.loadCharacter(character.id, false);
      this.transferFeedback.set({
        tone: 'success',
        message: this.text('transfer.importSuccess'),
      });
    } catch (error) {
      /*
       * Translate the error's KEY, never its `message`. Surfacing
       * `error.message` put whatever a parser or the platform happened to throw
       * in front of the reader - always English, sometimes a stack-shaped
       * internal string - on a screen that is otherwise fully bilingual.
       */
      this.transferFeedback.set({
        tone: 'error',
        message: this.failureMessageText(
          'invalidFile',
          this.text(
            error instanceof CharacterOverrideTransferError
              ? error.key
              : 'transfer.errors.importFailed',
          ),
        ),
      });
    }
  }

  public async resetLocalChanges(characterId: number): Promise<void> {
    if (
      !this.hasLocalOverride() ||
      (typeof globalThis.confirm === 'function' &&
        !globalThis.confirm(this.text('transfer.confirmReset')))
    ) {
      return;
    }

    await this.characterOverrides.deleteOverride(characterId);
    await this.loadCharacter(characterId, false);
    this.transferFeedback.set({
      tone: 'success',
      message: this.text('transfer.removed'),
    });
  }

  private async loadCharacter(characterId: number, markRecent: boolean): Promise<void> {
    this.transferFeedback.set(null);
    const character = await this.repository.getCharacterById(characterId);

    this.character.set(character);
    await this.loadRumbleReferenceName(character);
    await this.loadProgression(character);

    if (markRecent) {
      await this.userState.markRecent(characterId);
    }
  }

  /**
   * 869f1935z. The evolution chain names other characters, so their names are resolved in ONE
   * query rather than per entry - a branching evolution with materials can reference five units,
   * and the detail page already pays for two round trips before this one.
   */
  private async loadProgression(character: CharacterDetailRecord | null): Promise<void> {
    this.progressionCards.set([]);

    if (!character) {
      return;
    }

    const progression = await this.repository.getCharacterProgression(character.id);

    if (!progression) {
      return;
    }

    const relatedIds = collectProgressionCharacterIds(progression);
    const related = relatedIds.length
      ? await this.repository.getCharactersByIds(relatedIds)
      : [];
    const namesById = new Map(related.map((entry) => [entry.id, entry.name]));

    this.progressionCards.set(
      buildProgressionCards(progression, (characterId) => namesById.get(characterId) ?? null),
    );
  }

  private async loadRumbleReferenceName(character: CharacterDetailRecord | null): Promise<void> {
    this.rumbleBasedOnName.set(null);

    const basedOnId = resolveRumbleBasedOnId(character?.detail.rumbleData ?? null);

    if (!basedOnId) {
      return;
    }

    const basedOnCharacter = await this.repository.getCharacterById(basedOnId);
    this.rumbleBasedOnName.set(basedOnCharacter?.name ?? null);
  }

  /*
   * 869f135ra. This screen's feedback surface takes ONE string rather than a
   * list, so the three sentences arrive as one paragraph. The order is the same
   * and so are the words - what happened, whether the reader's data is safe, and
   * the one thing to try.
   *
   * The comment above this call site already refused to show `error.message`,
   * for the same reason the vocabulary exists. This keeps that and adds the two
   * sentences the reader still was not getting.
   */
  private failureMessageText(familyId: string, extra?: string | null, error?: unknown): string {
    return buildFailureLines(
      resolveFailureFamily(error, familyId),
      (key, params, scope) => this.i18n.translate(key, params, scope),
      extra ?? null,
    ).join(' ');
  }

}
