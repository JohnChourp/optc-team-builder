import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import { IonContent, IonHeader, IonSpinner, IonTitle, IonToolbar } from "@ionic/angular/standalone";

import { UserStateService } from "../../core/services/user-state.service";

@Component({
  selector: "app-saved-teams-page",
  standalone: true,
  imports: [CommonModule, IonContent, IonHeader, IonSpinner, IonTitle, IonToolbar],
  templateUrl: "./saved-teams.page.html",
  styleUrl: "./saved-teams.page.scss",
})
export class SavedTeamsPage implements OnInit {
  public readonly loading = signal(true);
  public readonly savedTeams;

  public constructor(private readonly userState: UserStateService) {
    this.savedTeams = this.userState.savedTeams;
  }

  public async ngOnInit(): Promise<void> {
    await this.userState.ready();
    this.loading.set(false);
  }
}
