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
  public readonly selectedClasses = signal<string[]>([]);
  public readonly building = signal(false);
  public readonly result = signal<AutoBuildResult | null>(null);
  public readonly errorMessage = signal("");

  public readonly availableTypes = AUTO_TEAM_BUILDER_TYPES;
  public readonly typeSupportLabel = "Μπορείς να διαλέξεις ένα ή περισσότερα types για mixed build.";
  public readonly classSupportLabel = "Μπορείς να διαλέξεις ένα ή περισσότερα classes για strict mixed build.";
  public readonly availableClasses = computed(() => this.summary()?.availableClasses ?? []);
  public readonly hasSelectedClasses = computed(() => this.selectedClasses().length > 0);
  public readonly hasSelectedTypes = computed(() => this.selectedTypes().length > 0);
  public readonly allClassesSelected = computed(
    () => this.availableClasses().length > 0 && this.selectedClasses().length === this.availableClasses().length,
  );
  public readonly allTypesSelected = computed(() => this.selectedTypes().length === this.availableTypes.length);
  public readonly selectedClassesLabel = computed(() => this.formatSelectedValues(this.selectedClasses()));
  public readonly selectedTypesLabel = computed(() => this.formatSelectedTypes(this.selectedTypes()));
  public readonly builderLabel = computed(() =>
    this.hasSelectedTypes() ? `Generic ${this.selectedTypesLabel()} burst builder` : "Generic burst builder",
  );
  public readonly titleLabel = computed(
    () =>
      this.hasSelectedClasses() && this.hasSelectedTypes()
        ? `Διάλεξε classes και χτίσε αυτόματα ένα strict ${this.selectedTypesLabel()} mixed team.`
        : "Διάλεξε types και classes για να χτίσεις αυτόματα ένα strict mixed team.",
  );
  public readonly descriptionLabel = computed(
    () =>
      this.hasSelectedClasses() && this.hasSelectedTypes()
        ? `Το v1 χρησιμοποιεί recent usable ${this.selectedTypesLabel()} units με readable captain, special, και sailor texts για να φτιάξει ένα generic high-damage team με strict coverage στα selected classes και types.`
        : "Το v1 χρησιμοποιεί recent usable units με readable captain, special, και sailor texts για να φτιάξει ένα generic high-damage team με strict coverage στα selected classes και types.",
  );
  public readonly buildButtonLabel = computed(() =>
    this.hasSelectedTypes() ? `Build strict ${this.selectedTypesLabel()} mixed team` : "Select types to build team",
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
  public readonly selectedClassSummaryLabel = computed(() => {
    const current = this.result();

    if (!current) {
      return "Select classes to enforce class coverage.";
    }

    return `${current.coverage.coveredSelectedClasses.length} / ${current.input.selectedClasses.length} classes covered • ${current.coverage.selectedClassMatches} / 6 matching slots`;
  });
  public readonly selectedTypeSummaryLabel = computed(() => {
    const current = this.result();

    if (!current) {
      return "Select types to enforce type coverage.";
    }

    return `${current.coverage.coveredSelectedTypes.length} / ${current.input.types.length} types covered • ${current.coverage.selectedTypeMatches} / 6 matching slots`;
  });
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

  public async onClassChange(event: CustomEvent<{ value?: string[] | string | null }>): Promise<void> {
    this.selectedClasses.set(this.resolveSelectedClasses(event.detail.value));
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

  public selectAllClasses(): void {
    if (this.allClassesSelected()) {
      return;
    }

    this.selectedClasses.set([...this.availableClasses()]);
    this.result.set(null);
    this.errorMessage.set("");
  }

  public async buildTeam(): Promise<void> {
    if (!this.selectedClasses().length || !this.selectedTypes().length || this.building()) {
      return;
    }

    this.building.set(true);
    this.result.set(null);
    this.errorMessage.set("");

    try {
      const nextResult = await this.autoTeamBuilder.buildTeam(this.selectedClasses(), this.selectedTypes());

      if (!nextResult) {
        this.errorMessage.set(
          `Δεν βρέθηκαν αρκετοί usable ${this.selectedTypesLabel()} χαρακτήρες για πλήρη κάλυψη των επιλεγμένων classes και types.`,
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

  private resolveSelectedClasses(value: string[] | string | null | undefined): string[] {
    const nextValues = Array.isArray(value) ? value : value ? [value] : [];

    return this.availableClasses().filter(
      (characterClass, index) => nextValues.includes(characterClass) && nextValues.indexOf(characterClass) === index,
    );
  }

  private resolveSelectedTypes(
    value: AutoTeamBuilderType[] | AutoTeamBuilderType | null | undefined,
  ): AutoTeamBuilderType[] {
    const nextValues = Array.isArray(value) ? value : value ? [value] : [];

    return this.availableTypes.filter((type, index) => nextValues.includes(type) && nextValues.indexOf(type) === index);
  }

  private formatSelectedTypes(types: AutoTeamBuilderType[]): string {
    return this.formatSelectedValues(types);
  }

  private formatSelectedValues(values: readonly string[]): string {
    return values.join(" / ");
  }
}
