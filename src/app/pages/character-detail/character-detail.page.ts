import { CommonModule } from '@angular/common';
import { Component, type OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';
import { heart, heartOutline } from 'ionicons/icons';

import {
  type AutoBuildAbilityCatalog,
  type NormalizedBuilderAbility,
} from '../../core/models/auto-team-builder-ability.models';
import { type CharacterDetailRecord } from '../../core/models/optc.models';
import { CharacterOverridesService } from '../../core/services/character-overrides.service';
import { createLocalCharacterOverrideFromRecord } from '../../core/services/character-overrides.utils';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';
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
  ],
  templateUrl: './character-detail.page.html',
  styleUrl: './character-detail.page.scss',
})
export class CharacterDetailPage implements OnInit {
  public readonly character = signal<CharacterDetailRecord | null>(null);
  public readonly abilityCatalog = signal<AutoBuildAbilityCatalog | null>(null);
  public readonly rumbleBasedOnName = signal<string | null>(null);
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
  public readonly viewModel = computed(() => {
    const currentCharacter = this.character();

    return currentCharacter
      ? buildCharacterDetailViewModel(currentCharacter, this.rumbleBasedOnName())
      : null;
  });

  public readonly favoriteIcon = heart;
  public readonly favoriteOutlineIcon = heartOutline;

  public constructor(
    private readonly route: ActivatedRoute,
    private readonly repository: OptcRepositoryService,
    private readonly userState: UserStateService,
    private readonly characterOverrides: CharacterOverridesService,
  ) {
    this.favoriteIds = this.userState.favoriteCharacterIds;
  }

  public async ngOnInit(): Promise<void> {
    const characterId = Number(this.route.snapshot.paramMap.get('id'));

    if (!Number.isFinite(characterId)) {
      this.loading.set(false);
      return;
    }

    await this.userState.readyFavoriteCharacterIds();
    const [abilityCatalog] = await Promise.all([
      this.repository.getAutoBuilderAbilityCatalog().catch(() => null),
      this.loadCharacter(characterId, true),
    ]);

    this.abilityCatalog.set(abilityCatalog);
    this.loading.set(false);
  }

  public async toggleFavorite(characterId: number): Promise<void> {
    await this.userState.toggleFavorite(characterId);
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
        throw new Error('The selected override file contains invalid character override entries.');
      }

      if (
        sanitizedImport.overrides.length !== 1 ||
        sanitizedImport.overrides[0]?.characterId !== character.id
      ) {
        throw new Error('The selected override file does not match this character.');
      }

      await this.characterOverrides.saveOverride(sanitizedImport.overrides[0]!);
      await this.loadCharacter(character.id, false);
      this.transferFeedback.set({
        tone: 'success',
        message: 'Local character override imported successfully.',
      });
    } catch (error) {
      this.transferFeedback.set({
        tone: 'error',
        message:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : 'Character override import failed.',
      });
    }
  }

  public async resetLocalChanges(characterId: number): Promise<void> {
    if (
      !this.hasLocalOverride() ||
      (typeof globalThis.confirm === 'function' &&
        !globalThis.confirm('Delete the current local override for this character?'))
    ) {
      return;
    }

    await this.characterOverrides.deleteOverride(characterId);
    await this.loadCharacter(characterId, false);
    this.transferFeedback.set({
      tone: 'success',
      message: 'Local character override removed.',
    });
  }

  private async loadCharacter(characterId: number, markRecent: boolean): Promise<void> {
    this.transferFeedback.set(null);
    const character = await this.repository.getCharacterById(characterId);

    this.character.set(character);
    await this.loadRumbleReferenceName(character);

    if (markRecent) {
      await this.userState.markRecent(characterId);
    }
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
}
