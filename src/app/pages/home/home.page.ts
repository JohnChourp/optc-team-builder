import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { IonButton } from '@ionic/angular/ion-button';
import { IonButtons } from '@ionic/angular/ion-buttons';
import { IonContent } from '@ionic/angular/ion-content';
import { IonHeader } from '@ionic/angular/ion-header';
import { IonMenuButton } from '@ionic/angular/ion-menu-button';
import { IonTitle } from '@ionic/angular/ion-title';
import { IonToolbar } from '@ionic/angular/ion-toolbar';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  albumsOutline,
  archiveOutline,
  cameraOutline,
  checkmarkCircleOutline,
  cogOutline,
  flashOutline,
  gridOutline,
  logInOutline,
  saveOutline,
  searchOutline,
  shieldCheckmarkOutline,
  shieldHalfOutline,
  sparklesOutline,
  personCircleOutline,
} from 'ionicons/icons';
import {
  GoogleAccountService,
  type GoogleAccountProfile,
} from '../../core/services/google-account.service';
import { HomeStylePanelsComponent } from './home-style-panels.component';
import { UserDataTransferService } from '../../core/services/user-data-transfer.service';
import {
  FIRST_RUN_TRANSFER_DISMISSED_KEY,
  shouldShowFirstRunTransferNotice,
} from './first-run-transfer.utils';

interface HomeAction {
  color: 'light' | 'warning';
  fill: 'outline' | 'solid';
  labelKey: string;
  route: string;
}

interface HomeFeature {
  icon: string | readonly string[];
  titleKey: string;
  copyKey: string;
  route: string;
}

interface HomeHeroCharacter {
  alt: string;
  src: string;
}

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonMenuButton,
    IonTitle,
    IonToolbar,
    HomeStylePanelsComponent,
    RouterLink,
    TranslocoDirective,
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage {
  private readonly googleAccount = inject(GoogleAccountService);
  private readonly userDataTransfer = inject(UserDataTransferService);

  /**
   * 869f13d6j. Shown only on an installation that holds nothing of the reader's.
   *
   * It detects nothing about other installations - reading another origin's storage is
   * impossible by design - so it states the one fact it has, names the two routes that
   * work, and goes away when dismissed.
   */
  private readonly transferNoticeDismissed = signal(this.readTransferNoticeDismissed());

  public readonly showFirstRunTransferNotice = computed(() =>
    shouldShowFirstRunTransferNotice({
      summary: this.userDataTransfer.getSyncScopeSummary(),
      dismissed: this.transferNoticeDismissed(),
      signedIn: this.googleAccountSignedIn(),
    }),
  );

  public dismissFirstRunTransferNotice(): void {
    this.transferNoticeDismissed.set(true);

    try {
      globalThis.localStorage?.setItem(FIRST_RUN_TRANSFER_DISMISSED_KEY, 'true');
    } catch {
      // A reader who cannot persist the dismissal still gets it dismissed for this visit.
      // Nagging them again next launch is a smaller harm than an error out of a click.
    }
  }

  private readTransferNoticeDismissed(): boolean {
    try {
      return globalThis.localStorage?.getItem(FIRST_RUN_TRANSFER_DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  }

  public readonly accountIcon = personCircleOutline;
  public readonly accountRoute = '/tabs/account';
  public readonly googleAccountAvailable = this.googleAccount.isAvailable;
  public readonly googleAccountProfile = this.googleAccount.profile;
  public readonly googleAccountSignedIn = this.googleAccount.isSignedIn;
  public readonly googleAccountStatus = this.googleAccount.status;
  public readonly loginIcon = logInOutline;
  public readonly sparklesIcon = sparklesOutline;
  public readonly searchIcon = searchOutline;
  public readonly shieldIcon = shieldCheckmarkOutline;
  public readonly heroCharacters: readonly HomeHeroCharacter[] = [
    {
      alt: 'Portgas D. Ace - The Man Who Came for an Emperor of the Sea',
      src: 'assets/offline-packs/thumbnails-glo/4/500/4556.png',
    },
    {
      alt: 'Dr. Vegapunk - Intense Worldwide Broadcast',
      src: 'assets/offline-packs/thumbnails-glo/4/500/4554.png',
    },
    {
      alt: 'Burgess & Shiryu - Leading Might and Invisibility',
      src: 'assets/offline-packs/thumbnails-glo/4/500/4551.png',
    },
  ];
  public readonly actions: readonly HomeAction[] = [
    {
      color: 'warning',
      fill: 'solid',
      labelKey: 'actions.characters',
      route: '/tabs/characters',
    },
    {
      color: 'light',
      fill: 'outline',
      labelKey: 'actions.autoBuilder',
      route: '/tabs/auto-team-builder',
    },
    {
      color: 'light',
      fill: 'outline',
      labelKey: 'actions.autoRumble',
      route: '/tabs/auto-team-builder-rumble',
    },
    {
      color: 'light',
      fill: 'outline',
      labelKey: 'actions.crewForge',
      route: '/tabs/crew-forge',
    },
  ];
  public readonly highlights = [
    'highlights.offline',
    'highlights.planning',
    'highlights.localData',
  ];
  public readonly featureGroups: readonly HomeFeature[] = [
    {
      icon: gridOutline,
      titleKey: 'features.characters.title',
      copyKey: 'features.characters.copy',
      route: '/tabs/characters',
    },
    {
      icon: shieldHalfOutline,
      titleKey: 'features.rumbleCharacters.title',
      copyKey: 'features.rumbleCharacters.copy',
      route: '/tabs/rumble-characters',
    },
    {
      icon: archiveOutline,
      titleKey: 'features.characterBoxes.title',
      copyKey: 'features.characterBoxes.copy',
      route: '/tabs/character-boxes',
    },
    {
      icon: flashOutline,
      titleKey: 'features.autoBuilder.title',
      copyKey: 'features.autoBuilder.copy',
      route: '/tabs/auto-team-builder',
    },
    {
      icon: shieldCheckmarkOutline,
      titleKey: 'features.captainCoverage.title',
      copyKey: 'features.captainCoverage.copy',
      route: '/tabs/captain-coverage',
    },
    {
      icon: shieldHalfOutline,
      titleKey: 'features.autoRumble.title',
      copyKey: 'features.autoRumble.copy',
      route: '/tabs/auto-team-builder-rumble',
    },
    {
      icon: albumsOutline,
      titleKey: 'features.savedTeams.title',
      copyKey: 'features.savedTeams.copy',
      route: '/tabs/saved-teams',
    },
    {
      icon: shieldHalfOutline,
      titleKey: 'features.savedRumbleTeams.title',
      copyKey: 'features.savedRumbleTeams.copy',
      route: '/tabs/saved-rumble-teams',
    },
    {
      icon: saveOutline,
      titleKey: 'features.savedEnemies.title',
      copyKey: 'features.savedEnemies.copy',
      route: '/tabs/saved-enemies',
    },
    {
      icon: cameraOutline,
      titleKey: 'features.crewForge.title',
      copyKey: 'features.crewForge.copy',
      route: '/tabs/crew-forge',
    },
    {
      icon: cogOutline,
      titleKey: 'features.settings.title',
      copyKey: 'features.settings.copy',
      route: '/tabs/settings',
    },
  ];
  public readonly workflowSteps = [
    'workflow.steps.find',
    'workflow.steps.plan',
    'workflow.steps.save',
  ];
  public readonly checkIcon = checkmarkCircleOutline;

  public getProfileDisplayName(profile: GoogleAccountProfile): string {
    return profile.name ?? profile.email ?? profile.id;
  }

  public getProfileInitials(profile: GoogleAccountProfile): string {
    const source = this.getProfileDisplayName(profile);
    const initials = source
      .split(/[\s@._-]+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toLocaleUpperCase())
      .join('');

    return initials || '?';
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
