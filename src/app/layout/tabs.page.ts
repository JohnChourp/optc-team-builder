import { Component, inject } from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenu,
  IonMenuToggle,
  IonRouterOutlet,
  IonTitle,
  IonToolbar,
} from "@ionic/angular/standalone";
import { TranslocoPipe } from "@jsverse/transloco";
import {
  albumsOutline,
  archiveOutline,
  cogOutline,
  constructOutline,
  flashOutline,
  gridOutline,
  peopleOutline,
  saveOutline,
} from "ionicons/icons";

interface NavigationItem {
  icon: string | readonly string[];
  labelKey: string;
  route: string;
}

@Component({
  selector: "app-tabs-page",
  standalone: true,
  imports: [
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonMenu,
    IonMenuToggle,
    IonRouterOutlet,
    IonTitle,
    IonToolbar,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: "./tabs.page.html",
  styleUrl: "./tabs.page.scss",
})
export class TabsPage {
  private readonly router = inject(Router);

  public readonly navigationItems: NavigationItem[] = [
    {
      icon: gridOutline,
      labelKey: "tabs.characters",
      route: "/tabs/characters",
    },
    {
      icon: peopleOutline,
      labelKey: "tabs.team",
      route: "/tabs/team-builder",
    },
    {
      icon: flashOutline,
      labelKey: "tabs.auto",
      route: "/tabs/auto-team-builder",
    },
    {
      icon: constructOutline,
      labelKey: "tabs.crewForge",
      route: "/tabs/crew-forge",
    },
    {
      icon: albumsOutline,
      labelKey: "tabs.savedTeams",
      route: "/tabs/saved-teams",
    },
    {
      icon: archiveOutline,
      labelKey: "tabs.characterBoxes",
      route: "/tabs/character-boxes",
    },
    {
      icon: saveOutline,
      labelKey: "tabs.savedEnemies",
      route: "/tabs/saved-enemies",
    },
    {
      icon: cogOutline,
      labelKey: "tabs.settings",
      route: "/tabs/settings",
    },
  ];

  public isRouteActive(item: NavigationItem): boolean {
    return this.router.url === item.route || this.router.url.startsWith(`${item.route}?`);
  }
}
