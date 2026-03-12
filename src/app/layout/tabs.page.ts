import { Component } from "@angular/core";
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from "@ionic/angular/standalone";
import { albumsOutline, cogOutline, gridOutline, peopleOutline } from "ionicons/icons";

@Component({
  selector: "app-tabs-page",
  standalone: true,
  imports: [IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs],
  templateUrl: "./tabs.page.html",
  styleUrl: "./tabs.page.scss",
})
export class TabsPage {
  public readonly charactersIcon = gridOutline;
  public readonly teamIcon = peopleOutline;
  public readonly collectionIcon = albumsOutline;
  public readonly settingsIcon = cogOutline;
}
