import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'tabs/characters',
  },
  {
    path: 'tabs',
    loadComponent: () => import('./layout/tabs.page').then((module) => module.TabsPage),
    children: [
      {
        path: 'characters',
        loadComponent: () =>
          import('./pages/characters/characters.page').then((module) => module.CharactersPage),
      },
      {
        path: 'team-builder',
        loadComponent: () =>
          import('./pages/team-builder/team-builder.page').then((module) => module.TeamBuilderPage),
      },
      {
        path: 'auto-team-builder',
        loadComponent: () =>
          import('./pages/auto-team-builder/auto-team-builder.page').then(
            (module) => module.AutoTeamBuilderPage,
          ),
      },
      {
        path: 'crew-forge',
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
          import('./pages/saved-teams/saved-teams.page').then((module) => module.SavedTeamsPage),
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
        path: 'privacy',
        loadComponent: () =>
          import('./pages/privacy-policy/privacy-policy.page').then(
            (module) => module.PrivacyPolicyPage,
          ),
      },
      {
        path: 'cookies',
        loadComponent: () =>
          import('./pages/cookie-policy/cookie-policy.page').then(
            (module) => module.CookiePolicyPage,
          ),
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'characters',
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
    path: '**',
    redirectTo: 'tabs/characters',
  },
];
