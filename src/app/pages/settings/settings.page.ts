import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import {
  IonContent,
  IonHeader,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
} from "@ionic/angular/standalone";
import { TranslocoDirective, TranslocoPipe } from "@jsverse/transloco";

import { type DatasetManifest } from "../../core/models/optc.models";
import { OptcRepositoryService } from "../../core/services/optc-repository.service";
import { type SupportedLanguage } from "../../core/i18n/app-i18n.types";
import { AppI18nService } from "../../core/services/app-i18n.service";

@Component({
  selector: "app-settings-page",
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonHeader,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonToolbar,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: "./settings.page.html",
  styleUrl: "./settings.page.scss",
})
export class SettingsPage implements OnInit {
  public readonly manifest = signal<DatasetManifest | null>(null);
  public readonly activeLanguage;
  public readonly availableLanguages;

  public readonly commands = [
    "npm run data:import",
    "npm run data:import:glo-thumbs",
    "npm run data:import:all",
  ];

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly i18n: AppI18nService,
  ) {
    this.activeLanguage = this.i18n.activeLanguage;
    this.availableLanguages = this.i18n.availableLanguages;
  }

  public async ngOnInit(): Promise<void> {
    this.manifest.set(await this.repository.getDatasetManifest());
  }

  public async onLanguageChange(
    event: CustomEvent<{ value?: SupportedLanguage | null }>,
  ): Promise<void> {
    const language = event.detail.value;

    if (!language) {
      return;
    }

    await this.i18n.setLanguage(language);
  }
}
