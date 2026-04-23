import { Component, inject } from "@angular/core";
import { RouterLink, RouterLinkActive, type IsActiveMatchOptions } from "@angular/router";
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
import { type SupportedLanguage } from "../core/i18n/app-i18n.types";
import { AppI18nService } from "../core/services/app-i18n.service";

interface NavigationItem {
  icon: string | readonly string[];
  labelKey: string;
  route: string;
}

interface LanguageItem {
  flag: string;
  id: SupportedLanguage;
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
    RouterLinkActive,
    TranslocoPipe,
  ],
  templateUrl: "./tabs.page.html",
  styleUrl: "./tabs.page.scss",
})
export class TabsPage {
  private readonly i18n = inject(AppI18nService);

  public readonly activeLanguage = this.i18n.activeLanguage;
  public readonly navItemActiveMatchOptions: IsActiveMatchOptions = {
    paths: "exact",
    queryParams: "subset",
    fragment: "ignored",
    matrixParams: "ignored",
  };
  public readonly availableLanguages: readonly LanguageItem[] = [
    { id: "en", flag: "🇬🇧" },
    { id: "el", flag: "🇬🇷" },
  ];
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

  public async onLanguageSelect(language: SupportedLanguage): Promise<void> {
    if (language === this.activeLanguage()) {
      return;
    }

    await this.i18n.setLanguage(language);
  }
}
