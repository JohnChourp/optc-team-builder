import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/tabs.page').then((module) => module.TabsPage),
    children: [
      {
        path: '',
        pathMatch: 'full',
        data: {
          seo: {
            title: 'OPTC Team Builder | One Piece Treasure Cruise Tools',
            description:
              'Plan One Piece Treasure Cruise crews with character search, team building, enemy mechanics, saved teams, screenshots, and offline-friendly tools.',
            canonicalPath: '',
          },
        },
        loadComponent: () => import('./pages/home/home.page').then((module) => module.HomePage),
      },
      {
        path: 'tabs',
        children: [
          {
            path: '',
            pathMatch: 'full',
            redirectTo: 'characters',
          },
          {
            path: 'characters',
            data: {
              seo: {
                title: 'OPTC Characters | OPTC Team Builder',
                description:
                  'Browse the One Piece Treasure Cruise character catalog with stats, classes, abilities, and team-building data.',
                canonicalPath: 'tabs/characters',
              },
            },
            loadComponent: () =>
              import('./pages/characters/characters.page').then((module) => module.CharactersPage),
          },
          {
            path: 'team-builder',
            data: {
              seo: {
                title: 'Team Builder | OPTC Team Builder',
                description:
                  'Build and review One Piece Treasure Cruise teams with character slots, ships, favorites, and offline catalog data.',
                canonicalPath: 'tabs/team-builder',
              },
            },
            loadComponent: () =>
              import('./pages/team-builder/team-builder.page').then(
                (module) => module.TeamBuilderPage,
              ),
          },
          {
            path: 'auto-team-builder',
            data: {
              seo: {
                title: 'Auto Team Builder | OPTC Team Builder',
                description:
                  'Find OPTC team candidates by enemy mechanics, character abilities, type filters, and team-building requirements.',
                canonicalPath: 'tabs/auto-team-builder',
              },
            },
            loadComponent: () =>
              import('./pages/auto-team-builder/auto-team-builder.page').then(
                (module) => module.AutoTeamBuilderPage,
              ),
          },
          {
            path: 'auto-team-builder-rumble',
            data: {
              seo: {
                title: 'Auto Rumble Builder | OPTC Team Builder',
                description:
                  'Build a Pirate Rumble team from local OPTC rumble data with deterministic scoring and synergy ranking.',
                canonicalPath: 'tabs/auto-team-builder-rumble',
              },
            },
            loadComponent: () =>
              import('./pages/auto-team-builder-rumble/auto-team-builder-rumble.page').then(
                (module) => module.AutoTeamBuilderRumblePage,
              ),
          },
          {
            path: 'crew-forge',
            data: {
              seo: {
                title: 'Crew Forge | OPTC Team Builder',
                description:
                  'Import crew screenshots and match recognized slots against the OPTC character catalog.',
                canonicalPath: 'tabs/crew-forge',
              },
            },
            loadComponent: () =>
              import('./pages/crew-forge/crew-forge.page').then((module) => module.CrewForgePage),
          },
          {
            path: 'character-boxes',
            loadComponent: () =>
              import('./pages/character-boxes/character-boxes.page').then(
                (module) => module.CharacterBoxesPage,
              ),
          },
          {
            path: 'saved-teams',
            loadComponent: () =>
              import('./pages/saved-teams/saved-teams.page').then(
                (module) => module.SavedTeamsPage,
              ),
          },
          {
            path: 'saved-rumble-teams',
            loadComponent: () =>
              import('./pages/saved-rumble-teams/saved-rumble-teams.page').then(
                (module) => module.SavedRumbleTeamsPage,
              ),
          },
          {
            path: 'saved-enemies',
            loadComponent: () =>
              import('./pages/saved-enemies/saved-enemies.page').then(
                (module) => module.SavedEnemiesPage,
              ),
          },
          {
            path: 'collection',
            pathMatch: 'full',
            redirectTo: 'saved-teams',
          },
          {
            path: 'settings',
            loadComponent: () =>
              import('./pages/settings/settings.page').then((module) => module.SettingsPage),
          },
          {
            path: 'drive-sync',
            data: {
              seo: {
                title: 'Google Drive Sync | OPTC Team Builder',
                description:
                  'Review, merge, replace, and back up OPTC Team Builder device data with a visible Google Drive backup.',
                canonicalPath: 'tabs/drive-sync',
              },
            },
            loadComponent: () =>
              import('./pages/drive-sync/drive-sync.page').then((module) => module.DriveSyncPage),
          },
          {
            path: 'privacy',
            data: {
              seo: {
                title: 'Privacy Policy | OPTC Team Builder',
                description: 'Read the privacy policy for OPTC Team Builder.',
                canonicalPath: 'privacy',
              },
            },
            loadComponent: () =>
              import('./pages/privacy-policy/privacy-policy.page').then(
                (module) => module.PrivacyPolicyPage,
              ),
          },
          {
            path: 'cookies',
            data: {
              seo: {
                title: 'Cookie Policy | OPTC Team Builder',
                description: 'Read the cookie policy for OPTC Team Builder.',
                canonicalPath: 'cookies',
              },
            },
            loadComponent: () =>
              import('./pages/cookie-policy/cookie-policy.page').then(
                (module) => module.CookiePolicyPage,
              ),
          },
          {
            path: 'terms',
            data: {
              seo: {
                title: 'Terms of Service | OPTC Team Builder',
                description: 'Read the terms of service for OPTC Team Builder.',
                canonicalPath: 'terms',
              },
            },
            loadComponent: () =>
              import('./pages/terms-of-service/terms-of-service.page').then(
                (module) => module.TermsOfServicePage,
              ),
          },
        ],
      },
    ],
  },
  {
    path: 'characters/:id',
    loadComponent: () =>
      import('./pages/character-detail/character-detail.page').then(
        (module) => module.CharacterDetailPage,
      ),
  },
  {
    path: 'characters/:id/edit',
    loadComponent: () =>
      import('./pages/character-edit/character-edit.page').then(
        (module) => module.CharacterEditPage,
      ),
  },
  {
    path: 'privacy',
    pathMatch: 'full',
    redirectTo: 'tabs/privacy',
  },
  {
    path: 'cookies',
    pathMatch: 'full',
    redirectTo: 'tabs/cookies',
  },
  {
    path: 'terms',
    pathMatch: 'full',
    redirectTo: 'tabs/terms',
  },
  {
    path: '**',
    redirectTo: 'tabs/characters',
  },
];
