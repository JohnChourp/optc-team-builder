import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import { IonContent, IonHeader, IonTitle, IonToolbar } from "@ionic/angular/standalone";

import { type DatasetManifest } from "../../core/models/optc.models";
import { OptcRepositoryService } from "../../core/services/optc-repository.service";

@Component({
  selector: "app-settings-page",
  standalone: true,
  imports: [CommonModule, IonContent, IonHeader, IonTitle, IonToolbar],
  templateUrl: "./settings.page.html",
  styleUrl: "./settings.page.scss",
})
export class SettingsPage implements OnInit {
  public readonly manifest = signal<DatasetManifest | null>(null);

  public readonly commands = [
    "npm run data:import",
    "npm run data:import:glo-thumbs",
    "npm run data:import:all",
  ];

  public constructor(private readonly repository: OptcRepositoryService) {}

  public async ngOnInit(): Promise<void> {
    this.manifest.set(await this.repository.getDatasetManifest());
  }
}
