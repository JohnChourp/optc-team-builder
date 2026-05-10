import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, type IsActiveMatchOptions } from '@angular/router';
import {
  IonAccordion,
  IonAccordionGroup,
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
} from '@ionic/angular/standalone';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  albumsOutline,
  archiveOutline,
  cogOutline,
  constructOutline,
  flashOutline,
  gridOutline,
  homeOutline,
  logInOutline,
  peopleOutline,
  personCircleOutline,
  saveOutline,
  shieldCheckmarkOutline,
  shieldHalfOutline,
} from 'ionicons/icons';
import { type SupportedLanguage } from '../core/i18n/app-i18n.types';
import { AppI18nService } from '../core/services/app-i18n.service';
import { GoogleAccountService } from '../core/services/google-account.service';

interface NavigationItem {
  icon: string | readonly string[];
  labelKey: string;
  route: string;
}

interface LanguageItem {
  flag: string;
  id: SupportedLanguage;
}

interface NavigationGroup {
  icon: string | readonly string[];
  id: string;
  items: readonly NavigationItem[];
  labelKey: string;
}

@Component({
  selector: 'app-tabs-page',
  standalone: true,
  imports: [
    IonAccordion,
    IonAccordionGroup,
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
  templateUrl: './tabs.page.html',
  styleUrl: './tabs.page.scss',
})
export class TabsPage {
  private readonly i18n = inject(AppI18nService);
  private readonly googleAccount = inject(GoogleAccountService);

  public readonly accountIcon = personCircleOutline;
  public readonly accountRoute = '/tabs/account';
  public readonly activeLanguage = this.i18n.activeLanguage;
  public readonly googleAccountAvailable = this.googleAccount.isAvailable;
  public readonly googleAccountProfile = this.googleAccount.profile;
  public readonly googleAccountSignedIn = this.googleAccount.isSignedIn;
  public readonly googleAccountStatus = this.googleAccount.status;
  public readonly loginIcon = logInOutline;
  public readonly navItemActiveMatchOptions: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'subset',
    fragment: 'ignored',
    matrixParams: 'ignored',
  };
  public readonly availableLanguages: readonly LanguageItem[] = [
    { id: 'en', flag: '🇬🇧' },
    { id: 'el', flag: '🇬🇷' },
  ];
  public readonly navigationGroups: readonly NavigationGroup[] = [
    {
      icon: gridOutline,
      id: 'browse',
      labelKey: 'tabs.groups.browse',
      items: [
        {
          icon: homeOutline,
          labelKey: 'tabs.home',
          route: '/',
        },
        {
          icon: gridOutline,
          labelKey: 'tabs.characters',
          route: '/tabs/characters',
        },
        {
          icon: shieldHalfOutline,
          labelKey: 'tabs.rumbleCharacters',
          route: '/tabs/rumble-characters',
        },
      ],
    },
    {
      icon: constructOutline,
      id: 'build',
      labelKey: 'tabs.groups.build',
      items: [
        {
          icon: flashOutline,
          labelKey: 'tabs.auto',
          route: '/tabs/auto-team-builder',
        },
        {
          icon: peopleOutline,
          labelKey: 'tabs.manualTeamBuilder',
          route: '/tabs/manual-team-builder',
        },
        {
          icon: shieldCheckmarkOutline,
          labelKey: 'tabs.captainCoverage',
          route: '/tabs/captain-coverage',
        },
        {
          icon: shieldHalfOutline,
          labelKey: 'tabs.autoRumble',
          route: '/tabs/auto-team-builder-rumble',
        },
        {
          icon: constructOutline,
          labelKey: 'tabs.crewForge',
          route: '/tabs/crew-forge',
        },
      ],
    },
    {
      icon: saveOutline,
      id: 'saved-sync',
      labelKey: 'tabs.groups.savedSync',
      items: [
        {
          icon: archiveOutline,
          labelKey: 'tabs.characterBoxes',
          route: '/tabs/character-boxes',
        },
        {
          icon: albumsOutline,
          labelKey: 'tabs.savedTeams',
          route: '/tabs/saved-teams',
        },
        {
          icon: shieldHalfOutline,
          labelKey: 'tabs.savedRumbleTeams',
          route: '/tabs/saved-rumble-teams',
        },
        {
          icon: saveOutline,
          labelKey: 'tabs.savedEnemies',
          route: '/tabs/saved-enemies',
        },
      ],
    },
  ];
  public readonly settingsNavItem: NavigationItem = {
    icon: cogOutline,
    labelKey: 'tabs.settings',
    route: '/tabs/settings',
  };
  public readonly accountDisplayName = computed(() => {
    const profile = this.googleAccountProfile();

    return profile?.name ?? profile?.email ?? '';
  });

  public async onLanguageSelect(language: SupportedLanguage): Promise<void> {
    if (language === this.activeLanguage()) {
      return;
    }

    await this.i18n.setLanguage(language);
  }

  public async signInWithGoogle(): Promise<void> {
    if (!this.googleAccountAvailable()) {
      return;
    }

    try {
      await this.googleAccount.signIn(false);
    } catch {
      return;
    }
  }
}
