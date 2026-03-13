import { CommonModule } from "@angular/common";
import { Component, OnInit, computed, signal } from "@angular/core";
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from "@ionic/angular/standalone";
import { layersOutline, shieldHalfOutline, sparklesOutline } from "ionicons/icons";

import {
  AUTO_TEAM_BUILDER_DEFAULT_TYPE,
  AUTO_TEAM_BUILDER_TYPES,
  type AutoBuildResult,
  type AutoTeamBuilderType,
} from "../../core/models/auto-team-builder.models";
import { type DatasetManifest } from "../../core/models/optc.models";
import { AutoTeamBuilderService } from "../../core/services/auto-team-builder.service";
import { OptcRepositoryService } from "../../core/services/optc-repository.service";

@Component({
  selector: "app-auto-team-builder-page",
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
  templateUrl: "./auto-team-builder.page.html",
  styleUrl: "./auto-team-builder.page.scss",
})
export class AutoTeamBuilderPage implements OnInit {
  public readonly summary = signal<DatasetManifest | null>(null);
  public readonly selectedType = signal<AutoTeamBuilderType>(AUTO_TEAM_BUILDER_DEFAULT_TYPE);
  public readonly selectedClass = signal("");
  public readonly building = signal(false);
  public readonly result = signal<AutoBuildResult | null>(null);
  public readonly errorMessage = signal("");

  public readonly availableTypes = AUTO_TEAM_BUILDER_TYPES;
  public readonly typeSupportLabel = `${AUTO_TEAM_BUILDER_DEFAULT_TYPE} default, με support και για ${AUTO_TEAM_BUILDER_TYPES.filter((type) => type !== AUTO_TEAM_BUILDER_DEFAULT_TYPE).join(" / ")}`;
  public readonly availableClasses = computed(() => this.summary()?.availableClasses ?? []);
  public readonly builderLabel = computed(() => `Generic ${this.selectedType()} burst builder`);
  public readonly titleLabel = computed(() => `Διάλεξε class και χτίσε αυτόματα ένα δυνατό ${this.selectedType()} team.`);
  public readonly descriptionLabel = computed(
    () =>
      `Το v1 χρησιμοποιεί recent usable ${this.selectedType()} units με readable captain, special, και sailor texts για να φτιάξει ένα generic high-damage team με soft class matching.`,
  );
  public readonly buildButtonLabel = computed(() => `Build best ${this.selectedType()} team`);
  public readonly loadingLabel = computed(
    () => `Γίνεται scoring των πιο πρόσφατων usable ${this.selectedType()} χαρακτήρων...`,
  );
  public readonly candidatePoolLabel = computed(() => `recent usable ${this.selectedType()} records`);
  public readonly teamSlots = computed(() =>
    this.result()?.slots.map((slot) => ({
      ...slot,
      roleLabel: this.resolveRoleLabel(slot.role),
      snippet:
        slot.role === "sub"
          ? slot.character.detail.specialText || slot.character.detail.captainAbility || "No detail snippet available."
          : slot.character.detail.captainAbility || slot.character.detail.specialText || "No detail snippet available.",
    })) ?? [],
  );

  public readonly sparklesIcon = sparklesOutline;
  public readonly layersIcon = layersOutline;
  public readonly coverageIcon = shieldHalfOutline;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly autoTeamBuilder: AutoTeamBuilderService,
  ) {}

  public async ngOnInit(): Promise<void> {
    this.summary.set(await this.repository.getDatasetManifest());
  }

  public async onClassChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.selectedClass.set(String(event.detail.value ?? ""));
    this.result.set(null);
    this.errorMessage.set("");
  }

  public async onTypeChange(event: CustomEvent<{ value?: AutoTeamBuilderType | null }>): Promise<void> {
    this.selectedType.set((event.detail.value as AutoTeamBuilderType | null) ?? AUTO_TEAM_BUILDER_DEFAULT_TYPE);
    this.result.set(null);
    this.errorMessage.set("");
  }

  public async buildTeam(): Promise<void> {
    if (!this.selectedClass().trim().length || this.building()) {
      return;
    }

    this.building.set(true);
    this.result.set(null);
    this.errorMessage.set("");

    try {
      const nextResult = await this.autoTeamBuilder.buildTeam(this.selectedClass(), this.selectedType());

      if (!nextResult) {
        this.errorMessage.set(
          `Δεν βρέθηκαν αρκετοί usable ${this.selectedType()} χαρακτήρες για να χτιστεί ομάδα για αυτή την class.`,
        );
      }

      this.result.set(nextResult);
    } catch (error) {
      console.error(error);
      this.errorMessage.set("Κάτι πήγε στραβά όσο γινόταν το auto build.");
    } finally {
      this.building.set(false);
    }
  }

  private resolveRoleLabel(role: "captain" | "friendCaptain" | "sub"): string {
    switch (role) {
      case "captain":
        return "Captain";
      case "friendCaptain":
        return "Friend Captain";
      default:
        return "Sub";
    }
  }
}
