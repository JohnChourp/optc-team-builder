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
  public readonly selectedTypes = signal<AutoTeamBuilderType[]>([AUTO_TEAM_BUILDER_DEFAULT_TYPE]);
  public readonly selectedClass = signal("");
  public readonly building = signal(false);
  public readonly result = signal<AutoBuildResult | null>(null);
  public readonly errorMessage = signal("");

  public readonly availableTypes = AUTO_TEAM_BUILDER_TYPES;
  public readonly typeSupportLabel = "Μπορείς να διαλέξεις ένα ή περισσότερα types για mixed build.";
  public readonly availableClasses = computed(() => this.summary()?.availableClasses ?? []);
  public readonly hasSelectedTypes = computed(() => this.selectedTypes().length > 0);
  public readonly allTypesSelected = computed(() => this.selectedTypes().length === this.availableTypes.length);
  public readonly selectedTypesLabel = computed(() => this.formatSelectedTypes(this.selectedTypes()));
  public readonly builderLabel = computed(() =>
    this.hasSelectedTypes() ? `Generic ${this.selectedTypesLabel()} burst builder` : "Generic burst builder",
  );
  public readonly titleLabel = computed(
    () =>
      this.hasSelectedTypes()
        ? `Διάλεξε class και χτίσε αυτόματα ένα δυνατό ${this.selectedTypesLabel()} team.`
        : "Διάλεξε types και class για να χτίσεις αυτόματα ένα δυνατό team.",
  );
  public readonly descriptionLabel = computed(
    () =>
      this.hasSelectedTypes()
        ? `Το v1 χρησιμοποιεί recent usable ${this.selectedTypesLabel()} units με readable captain, special, και sailor texts για να φτιάξει ένα generic high-damage team με soft class matching.`
        : "Το v1 χρησιμοποιεί recent usable units με readable captain, special, και sailor texts για να φτιάξει ένα generic high-damage team με soft class matching.",
  );
  public readonly buildButtonLabel = computed(() =>
    this.hasSelectedTypes() ? `Build best ${this.selectedTypesLabel()} team` : "Select types to build team",
  );
  public readonly loadingLabel = computed(
    () =>
      this.hasSelectedTypes()
        ? `Γίνεται scoring των πιο πρόσφατων usable ${this.selectedTypesLabel()} χαρακτήρων...`
        : "Γίνεται scoring των πιο πρόσφατων usable χαρακτήρων...",
  );
  public readonly candidatePoolLabel = computed(() =>
    this.hasSelectedTypes() ? `recent usable ${this.selectedTypesLabel()} records` : "recent usable records",
  );
  public readonly selectedClassSummaryLabel = computed(
    () =>
      this.hasSelectedTypes()
        ? `${this.selectedTypesLabel()} • ${this.result()?.coverage.selectedClassMatches ?? 0} / 6 class matches`
        : `${this.result()?.coverage.selectedClassMatches ?? 0} / 6 class matches`,
  );
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

  public async onTypeChange(event: CustomEvent<{ value?: AutoTeamBuilderType[] | AutoTeamBuilderType | null }>): Promise<void> {
    this.selectedTypes.set(this.resolveSelectedTypes(event.detail.value));
    this.result.set(null);
    this.errorMessage.set("");
  }

  public selectAllTypes(): void {
    if (this.allTypesSelected()) {
      return;
    }

    this.selectedTypes.set([...this.availableTypes]);
    this.result.set(null);
    this.errorMessage.set("");
  }

  public async buildTeam(): Promise<void> {
    if (!this.selectedClass().trim().length || !this.selectedTypes().length || this.building()) {
      return;
    }

    this.building.set(true);
    this.result.set(null);
    this.errorMessage.set("");

    try {
      const nextResult = await this.autoTeamBuilder.buildTeam(this.selectedClass(), this.selectedTypes());

      if (!nextResult) {
        this.errorMessage.set(
          `Δεν βρέθηκαν αρκετοί usable ${this.selectedTypesLabel()} χαρακτήρες για να χτιστεί ομάδα για αυτή την class.`,
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

  private resolveSelectedTypes(
    value: AutoTeamBuilderType[] | AutoTeamBuilderType | null | undefined,
  ): AutoTeamBuilderType[] {
    const nextValues = Array.isArray(value) ? value : value ? [value] : [];

    return this.availableTypes.filter((type, index) => nextValues.includes(type) && nextValues.indexOf(type) === index);
  }

  private formatSelectedTypes(types: AutoTeamBuilderType[]): string {
    return types.join(" / ");
  }
}
