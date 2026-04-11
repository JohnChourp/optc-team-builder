import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, computed, signal } from "@angular/core";
import { TranslocoDirective, TranslocoPipe } from "@jsverse/transloco";
import {
  IonButton,
  IonButtons,
  IonFooter,
  IonIcon,
  IonModal,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonToolbar,
} from "@ionic/angular/standalone";
import { closeOutline, imagesOutline } from "ionicons/icons";

import { type CharacterListItem, type DatasetManifest } from "../../core/models/optc.models";
import { OptcRepositoryService } from "../../core/services/optc-repository.service";

const PAGE_SIZE = 24;

@Component({
  selector: "app-character-image-picker",
  standalone: true,
  imports: [
    IonButton,
    IonButtons,
    IonFooter,
    IonIcon,
    IonModal,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonToolbar,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: "./character-image-picker.component.html",
  styleUrl: "./character-image-picker.component.scss",
})
export class CharacterImagePickerComponent implements OnChanges {
  @Input({ required: true }) public isOpen = false;
  @Input({ required: true }) public title = "";
  @Input({ required: true }) public copy = "";
  @Input() public applyingSelection = false;
  @Output() public readonly dismiss = new EventEmitter<void>();
  @Output() public readonly saveSelection = new EventEmitter<CharacterListItem>();

  public readonly closeIcon = closeOutline;
  public readonly pickerIcon = imagesOutline;
  public readonly loading = signal(false);
  public readonly loadingMore = signal(false);
  public readonly hasMore = signal(true);
  public readonly searchTerm = signal("");
  public readonly selectedType = signal("");
  public readonly selectedClass = signal("");
  public readonly summary = signal<DatasetManifest | null>(null);
  public readonly characters = signal<CharacterListItem[]>([]);
  public readonly selectedCharacter = signal<CharacterListItem | null>(null);
  public readonly selectedCharacterId = computed(() => this.selectedCharacter()?.id ?? null);
  public readonly availableTypes = computed(() =>
    this.normalizeOptions(this.summary()?.availableTypes ?? []),
  );
  public readonly availableClasses = computed(() =>
    this.normalizeOptions(this.summary()?.availableClasses ?? []),
  );
  public readonly selectedCharacterClassesLabel = computed(() => {
    const character = this.selectedCharacter();

    if (!character) {
      return "";
    }

    return [character.primaryClass, character.secondaryClass].filter(Boolean).join(" / ");
  });

  private dismissReason: "save" | "cancel" | null = null;

  public constructor(private readonly repository: OptcRepositoryService) {}

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes["isOpen"] && this.isOpen) {
      console.log("CharacterImagePickerComponent component");
      this.dismissReason = null;
      this.resetState();
      void this.initializePicker();
    }
  }

  public async onSearchChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    if (this.applyingSelection) {
      return;
    }

    this.searchTerm.set((event.detail.value ?? "").trimStart());
    await this.loadCharacters(true);
  }

  public async onTypeChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    if (this.applyingSelection) {
      return;
    }

    this.selectedType.set(typeof event.detail.value === "string" ? event.detail.value : "");
    await this.loadCharacters(true);
  }

  public async onClassChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    if (this.applyingSelection) {
      return;
    }

    this.selectedClass.set(typeof event.detail.value === "string" ? event.detail.value : "");
    await this.loadCharacters(true);
  }

  public async loadMore(): Promise<void> {
    if (this.applyingSelection || this.loading() || this.loadingMore() || !this.hasMore()) {
      return;
    }

    await this.loadCharacters(false);
  }

  public selectCharacter(character: CharacterListItem): void {
    if (this.applyingSelection) {
      return;
    }

    this.selectedCharacter.set(character);
  }

  public save(): void {
    const selectedCharacter = this.selectedCharacter();

    if (!selectedCharacter || this.applyingSelection) {
      return;
    }

    this.dismissReason = "save";
    this.saveSelection.emit(selectedCharacter);
  }

  public cancel(): void {
    if (this.applyingSelection) {
      return;
    }

    this.dismissReason = "cancel";
    this.dismiss.emit();
  }

  public onModalDidDismiss(): void {
    if (this.dismissReason !== null) {
      this.dismissReason = null;
      return;
    }

    this.dismiss.emit();
  }

  private async initializePicker(): Promise<void> {
    this.loading.set(true);

    try {
      const [summary, characters] = await Promise.all([
        this.repository.getDatasetManifest(),
        this.repository.searchCharacters({
          searchTerm: "",
          typeFilter: "",
          classFilter: "",
          limit: PAGE_SIZE,
          offset: 0,
        }),
      ]);

      this.summary.set(summary);
      this.characters.set(characters);
      this.hasMore.set(characters.length === PAGE_SIZE);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadCharacters(reset: boolean): Promise<void> {
    if (reset) {
      this.loading.set(true);
    } else {
      this.loadingMore.set(true);
    }

    try {
      const nextOffset = reset ? 0 : this.characters().length;
      const nextPage = await this.repository.searchCharacters({
        searchTerm: this.searchTerm().trim(),
        typeFilter: this.selectedType(),
        classFilter: this.selectedClass(),
        limit: PAGE_SIZE,
        offset: nextOffset,
      });

      this.characters.set(reset ? nextPage : [...this.characters(), ...nextPage]);
      this.hasMore.set(nextPage.length === PAGE_SIZE);

      const selectedCharacterId = this.selectedCharacterId();

      if (!selectedCharacterId) {
        return;
      }

      const refreshedSelectedCharacter = nextPage.find(
        (character) => character.id === selectedCharacterId,
      );

      if (refreshedSelectedCharacter) {
        this.selectedCharacter.set(refreshedSelectedCharacter);
      }
    } finally {
      if (reset) {
        this.loading.set(false);
      } else {
        this.loadingMore.set(false);
      }
    }
  }

  private resetState(): void {
    this.loading.set(false);
    this.loadingMore.set(false);
    this.hasMore.set(true);
    this.searchTerm.set("");
    this.selectedType.set("");
    this.selectedClass.set("");
    this.characters.set([]);
    this.selectedCharacter.set(null);
  }

  private normalizeOptions(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right),
    );
  }
}
