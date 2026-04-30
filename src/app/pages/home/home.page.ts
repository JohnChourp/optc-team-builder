import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  albumsOutline,
  archiveOutline,
  cameraOutline,
  checkmarkCircleOutline,
  cloudDoneOutline,
  cogOutline,
  flashOutline,
  gridOutline,
  peopleOutline,
  saveOutline,
  searchOutline,
  shieldCheckmarkOutline,
  shieldHalfOutline,
  sparklesOutline,
} from 'ionicons/icons';

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
    RouterLink,
    TranslocoDirective,
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage {
  public readonly sparklesIcon = sparklesOutline;
  public readonly searchIcon = searchOutline;
  public readonly shieldIcon = shieldCheckmarkOutline;
  public readonly heroCharacters: readonly HomeHeroCharacter[] = [
    {
      alt: 'Kozuki Hiyori - Graveside Prayer character artwork',
      src: 'assets/exact-character-images/4208.png',
    },
    {
      alt: 'Kozuki Hiyori - Resounding Shamisen character artwork',
      src: 'assets/exact-character-images/4209.png',
    },
    {
      alt: 'Kid & Killer DEX character artwork',
      src: 'assets/exact-character-images/5601.png',
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
      labelKey: 'actions.teamBuilder',
      route: '/tabs/team-builder',
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
    {
      color: 'light',
      fill: 'outline',
      labelKey: 'actions.driveSync',
      route: '/tabs/drive-sync',
    },
  ];
  public readonly highlights = ['highlights.offline', 'highlights.planning', 'highlights.localData'];
  public readonly featureGroups: readonly HomeFeature[] = [
    {
      icon: gridOutline,
      titleKey: 'features.characters.title',
      copyKey: 'features.characters.copy',
      route: '/tabs/characters',
    },
    {
      icon: peopleOutline,
      titleKey: 'features.teamBuilder.title',
      copyKey: 'features.teamBuilder.copy',
      route: '/tabs/team-builder',
    },
    {
      icon: flashOutline,
      titleKey: 'features.autoBuilder.title',
      copyKey: 'features.autoBuilder.copy',
      route: '/tabs/auto-team-builder',
    },
    {
      icon: shieldHalfOutline,
      titleKey: 'features.autoRumble.title',
      copyKey: 'features.autoRumble.copy',
      route: '/tabs/auto-team-builder-rumble',
    },
    {
      icon: cameraOutline,
      titleKey: 'features.crewForge.title',
      copyKey: 'features.crewForge.copy',
      route: '/tabs/crew-forge',
    },
    {
      icon: albumsOutline,
      titleKey: 'features.savedTeams.title',
      copyKey: 'features.savedTeams.copy',
      route: '/tabs/saved-teams',
    },
    {
      icon: archiveOutline,
      titleKey: 'features.characterBoxes.title',
      copyKey: 'features.characterBoxes.copy',
      route: '/tabs/character-boxes',
    },
    {
      icon: saveOutline,
      titleKey: 'features.savedEnemies.title',
      copyKey: 'features.savedEnemies.copy',
      route: '/tabs/saved-enemies',
    },
    {
      icon: cloudDoneOutline,
      titleKey: 'features.driveSync.title',
      copyKey: 'features.driveSync.copy',
      route: '/tabs/drive-sync',
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
}
