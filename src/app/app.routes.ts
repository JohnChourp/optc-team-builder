import { type Routes } from '@angular/router';

import { publicRouteSeo } from './core/data/public-routes.data';

// 869f13c5t. The seven tool and guide pages carry no text here: it lives once, in
// pages/seo-content/seo-content.data.ts, and ships with this lazy chunk rather than the entry script.
const loadSeoContentPage = () =>
  import('./pages/seo-content/seo-content.page').then((module) => module.SeoContentPage);

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/tabs.page').then((module) => module.TabsPage),
    children: [
      {
        path: '',
        pathMatch: 'full',
        data: {
          seo: publicRouteSeo(''),
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
              seo: publicRouteSeo('tabs/characters'),
            },
            loadComponent: () =>
              import('./pages/characters/characters.page').then((module) => module.CharactersPage),
          },
          {
            path: 'auto-team-builder',
            data: {
              seo: publicRouteSeo('tabs/auto-team-builder'),
            },
            loadComponent: () =>
              import('./pages/auto-team-builder/auto-team-builder.page').then(
                (module) => module.AutoTeamBuilderPage,
              ),
          },
          {
            path: 'manual-team-builder',
            data: {
              seo: publicRouteSeo('tabs/manual-team-builder'),
            },
            loadComponent: () =>
              import('./pages/manual-team-builder/manual-team-builder.page').then(
                (module) => module.ManualTeamBuilderPage,
              ),
          },
          {
            path: 'captain-coverage',
            data: {
              seo: publicRouteSeo('tabs/captain-coverage'),
            },
            loadComponent: () =>
              import('./pages/captain-coverage/captain-coverage.page').then(
                (module) => module.CaptainCoveragePage,
              ),
          },
          {
            path: 'auto-team-builder-rumble',
            data: {
              seo: publicRouteSeo('tabs/auto-team-builder-rumble'),
            },
            loadComponent: () =>
              import('./pages/auto-team-builder-rumble/auto-team-builder-rumble.page').then(
                (module) => module.AutoTeamBuilderRumblePage,
              ),
          },
          {
            path: 'rumble-characters',
            data: {
              seo: publicRouteSeo('tabs/rumble-characters'),
            },
            loadComponent: () =>
              import('./pages/rumble-characters/rumble-characters.page').then(
                (module) => module.RumbleCharactersPage,
              ),
          },
          {
            path: 'crew-forge',
            data: {
              seo: publicRouteSeo('tabs/crew-forge'),
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
            path: 'account',
            data: {
              seo: publicRouteSeo('tabs/account'),
            },
            loadComponent: () =>
              import('./pages/account/account.page').then((module) => module.AccountPage),
          },
          {
            path: 'drive-sync',
            pathMatch: 'full',
            redirectTo: 'account',
          },
          {
            path: 'faq',
            /*
             * 869f12x57. A route with no `data.seo` is private as far as the app
             * is concerned: `findSeoDataForUrl` falls back to `defaultSeo`,
             * whose `indexable` is false, so `AppComponent` writes
             * `noindex,follow` and rewrites the canonical to the home page.
             *
             * That is what `/faq` did. 869f12x4k put it in the generated sitemap
             * and the static page carried `index,follow`, but measured against
             * production on 2026-09-14 the hydrated page served `noindex,follow`
             * with `canonical=https://optcteambuilder.com/` - advertising a URL
             * and then disowning it. Googlebot runs the JS, so the runtime tag
             * is the one that counts.
             */
            data: {
              seo: publicRouteSeo('tabs/faq'),
            },
            loadComponent: () => import('./pages/faq/faq.page').then((module) => module.FaqPage),
          },
          {
            /*
             * 869f17h3g. Deliberately private - no `data.seo`, so it stays out of
             * the sitemap and carries `noindex,follow` like Settings does.
             *
             * It answers "should I trust this tool" for someone who already has
             * it open, not for a search result. Publishing it would add a page to
             * the generated set whose claims are checked against this repo's own
             * configuration, and the check that keeps it honest is a lane, not a
             * crawler.
             */
            path: 'supported',
            loadComponent: () =>
              import('./pages/supported/supported.page').then((module) => module.SupportedPage),
          },
          {
            path: 'privacy',
            data: {
              seo: publicRouteSeo('tabs/privacy'),
            },
            loadComponent: () =>
              import('./pages/privacy-policy/privacy-policy.page').then(
                (module) => module.PrivacyPolicyPage,
              ),
          },
          {
            path: 'cookies',
            data: {
              seo: publicRouteSeo('tabs/cookies'),
            },
            loadComponent: () =>
              import('./pages/cookie-policy/cookie-policy.page').then(
                (module) => module.CookiePolicyPage,
              ),
          },
          {
            path: 'terms',
            data: {
              seo: publicRouteSeo('tabs/terms'),
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
    path: 'tools/optc-team-builder',
    data: {
      contentIcon: 'tools',
      seo: publicRouteSeo('tools/optc-team-builder'),
    },
    loadComponent: loadSeoContentPage,
  },
  {
    path: 'tools/optc-auto-team-builder',
    data: {
      contentIcon: 'flash',
      seo: publicRouteSeo('tools/optc-auto-team-builder'),
    },
    loadComponent: loadSeoContentPage,
  },
  {
    path: 'tools/optc-rumble-team-builder',
    data: {
      contentIcon: 'rumble',
      seo: publicRouteSeo('tools/optc-rumble-team-builder'),
    },
    loadComponent: loadSeoContentPage,
  },
  {
    path: 'tools/optc-character-database',
    data: {
      contentIcon: 'catalog',
      seo: publicRouteSeo('tools/optc-character-database'),
    },
    loadComponent: loadSeoContentPage,
  },
  {
    path: 'guides/how-to-build-an-optc-team',
    data: {
      contentIcon: 'tools',
      seo: publicRouteSeo('guides/how-to-build-an-optc-team'),
    },
    loadComponent: loadSeoContentPage,
  },
  {
    path: 'guides/guided-build-compare-team-sharing',
    data: {
      contentIcon: 'flash',
      seo: publicRouteSeo('guides/guided-build-compare-team-sharing'),
    },
    loadComponent: loadSeoContentPage,
  },
  {
    path: 'guides/optc-pirate-rumble-team-building',
    data: {
      contentIcon: 'rumble',
      seo: publicRouteSeo('guides/optc-pirate-rumble-team-building'),
    },
    loadComponent: loadSeoContentPage,
  },
  {
    path: 'faq',
    pathMatch: 'full',
    redirectTo: 'tabs/faq',
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
