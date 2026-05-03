import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
import { albumsOutline, flashOutline, gridOutline, shieldHalfOutline } from 'ionicons/icons';

interface SeoContentLink {
  label: string;
  route: string;
}

interface SeoContentSection {
  title: string;
  copy: string;
}

interface SeoContentPageData {
  eyebrow: string;
  title: string;
  summary: string;
  sections: readonly SeoContentSection[];
  links: readonly SeoContentLink[];
}

const defaultPage: SeoContentPageData = {
  eyebrow: 'Fan-made OPTC tools',
  title: 'OPTC Team Builder',
  summary:
    'Plan One Piece Treasure Cruise crews with searchable character data, automatic team-building tools, Pirate Rumble scoring, and screenshot import helpers.',
  sections: [
    {
      title: 'Built for planning',
      copy: 'Use the app to find characters, compare abilities, check captain coverage, and move from search to team planning without leaving the OPTC workspace.',
    },
  ],
  links: [
    { label: 'Browse OPTC characters', route: '/tabs/characters' },
    { label: 'Open Auto Team Builder', route: '/tabs/auto-team-builder' },
  ],
};

@Component({
  selector: 'app-seo-content-page',
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
  ],
  templateUrl: './seo-content.page.html',
  styleUrl: './seo-content.page.scss',
})
export class SeoContentPage {
  private readonly route = inject(ActivatedRoute);

  public readonly page: SeoContentPageData =
    (this.route.snapshot.data['content'] as SeoContentPageData | undefined) ?? defaultPage;
  public readonly primaryIcon = resolveIcon(this.route.snapshot.data['contentIcon']);
}

function resolveIcon(value: unknown): string {
  switch (value) {
    case 'flash':
      return flashOutline;
    case 'rumble':
      return shieldHalfOutline;
    case 'catalog':
      return gridOutline;
    default:
      return albumsOutline;
  }
}
