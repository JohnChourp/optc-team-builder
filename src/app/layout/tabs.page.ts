import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from "@ionic/angular/standalone";
import { TranslocoPipe } from "@jsverse/transloco";
import { albumsOutline, cogOutline, flashOutline, gridOutline, peopleOutline } from "ionicons/icons";

@Component({
  selector: "app-tabs-page",
  standalone: true,
  imports: [IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs, RouterLink, TranslocoPipe],
  templateUrl: "./tabs.page.html",
  styleUrl: "./tabs.page.scss",
})
export class TabsPage {
  public readonly charactersIcon = gridOutline;
  public readonly teamIcon = peopleOutline;
  public readonly autoTeamIcon = flashOutline;
  public readonly savedTeamsIcon = albumsOutline;
  public readonly settingsIcon = cogOutline;

  public ionViewDidEnter(): void {
    console.log("TabsPage component");
  }
}
