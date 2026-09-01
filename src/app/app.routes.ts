import { type Routes } from '@angular/router';

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
          seo: {
            title: 'OPTC Team Builder | One Piece Treasure Cruise Tools',
            description:
              'Plan OPTC crews with character search, Rumble rankings, captain coverage, auto team building, Crew Forge, saved teams, enemies, boxes, Drive sync, and offline tools.',
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
            path: 'manual-team-builder',
            data: {
              seo: {
                title: 'Manual Team Builder | OPTC Team Builder',
                description:
                  'Build and save fixed OPTC crews manually with character slots, an optional ship, and a local cost budget.',
                canonicalPath: 'tabs/manual-team-builder',
              },
            },
            loadComponent: () =>
              import('./pages/manual-team-builder/manual-team-builder.page').then(
                (module) => module.ManualTeamBuilderPage,
              ),
          },
          {
            path: 'captain-coverage',
            data: {
              seo: {
                title: 'Captain Coverage | OPTC Team Builder',
                description:
                  'Pick an OPTC Captain and see which characters that Captain Ability boosts, with the full catalogue still listed and only your own filters narrowing it.',
                canonicalPath: 'tabs/captain-coverage',
              },
            },
            loadComponent: () =>
              import('./pages/captain-coverage/captain-coverage.page').then(
                (module) => module.CaptainCoveragePage,
              ),
          },
          {
            path: 'auto-team-builder-rumble',
            data: {
              seo: {
                title: 'Auto Team Rumble Builder | OPTC Team Builder',
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
            path: 'rumble-characters',
            data: {
              seo: {
                title: 'Rumble Characters | OPTC Team Builder',
                description:
                  'Rank One Piece Treasure Cruise Pirate Rumble characters by full Rumble score, favorites, core filters, and custom stat focus.',
                canonicalPath: 'tabs/rumble-characters',
              },
            },
            loadComponent: () =>
              import('./pages/rumble-characters/rumble-characters.page').then(
                (module) => module.RumbleCharactersPage,
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
            path: 'account',
            data: {
              seo: {
                title: 'Account | OPTC Team Builder',
                description:
                  'Manage your optional Google account connection and Google Drive backup for OPTC Team Builder.',
                canonicalPath: 'tabs/account',
              },
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
    path: 'tools/optc-team-builder',
    data: {
      contentIcon: 'tools',
      seo: {
        title: 'OPTC Team Builder Tool | One Piece Treasure Cruise Crew Planner',
        description:
          'Use OPTC Team Builder to search One Piece Treasure Cruise characters, compare abilities, plan crews, and jump into auto team-building tools.',
        canonicalPath: 'tools/optc-team-builder',
      },
      content: {
        eyebrow: 'OPTC tool',
        title: 'OPTC Team Builder Tool',
        summary:
          'A fan-made One Piece Treasure Cruise crew planner for searching characters, checking ability coverage, and moving quickly from a unit idea to a playable team.',
        sections: [
          {
            title: 'Search before you build',
            copy: 'Start from the character catalog when you need names, ids, types, classes, specials, supports, and captain ability context before choosing crew slots.',
          },
          {
            title: 'Move into real tools',
            copy: 'Use the live Characters, Captain Coverage, Auto Team Builder, and Crew Forge screens instead of copying data between separate spreadsheets.',
          },
          {
            title: 'Keep planning data local',
            copy: 'Saved teams, saved enemies, character boxes, and backups stay in your browser unless you choose to use Drive sync.',
          },
        ],
        links: [
          { label: 'Browse OPTC characters', route: '/tabs/characters' },
          { label: 'Open Auto Team Builder', route: '/tabs/auto-team-builder' },
        ],
      },
    },
    loadComponent: loadSeoContentPage,
  },
  {
    path: 'tools/optc-auto-team-builder',
    data: {
      contentIcon: 'flash',
      seo: {
        title: 'OPTC Auto Team Builder | Enemy Mechanics and Ability Filters',
        description:
          'Build One Piece Treasure Cruise teams by enemy mechanics, ability requirements, manual slots, type filters, class filters, and character candidates.',
        canonicalPath: 'tools/optc-auto-team-builder',
      },
      content: {
        eyebrow: 'Auto builder',
        title: 'OPTC Auto Team Builder',
        summary:
          'Find One Piece Treasure Cruise crew candidates by describing the mechanics and ability coverage your team needs.',
        sections: [
          {
            title: 'Mechanic-first planning',
            copy: 'Enter bind, despair, paralysis, barriers, damage reduction, orb problems, interrupts, and other enemy requirements to narrow the character pool.',
          },
          {
            title: 'Manual slots stay useful',
            copy: 'Lock known captains or key subs first, then let the builder search around the characters you already want to use.',
          },
          {
            title: 'Readable candidate results',
            copy: 'Generated teams and fallback candidates are ranked with coverage details so you can understand why a unit was selected.',
          },
        ],
        links: [
          { label: 'Open Auto Team Builder', route: '/tabs/auto-team-builder' },
          { label: 'Check captain coverage', route: '/tabs/captain-coverage' },
        ],
      },
    },
    loadComponent: loadSeoContentPage,
  },
  {
    path: 'tools/optc-rumble-team-builder',
    data: {
      contentIcon: 'rumble',
      seo: {
        title: 'OPTC Pirate Rumble Team Builder | Rumble Rankings and Synergy',
        description:
          'Build Pirate Rumble teams in OPTC with local Rumble data, active and bench slots, score ranking, type focus, and synergy checks.',
        canonicalPath: 'tools/optc-rumble-team-builder',
      },
      content: {
        eyebrow: 'Pirate Rumble',
        title: 'OPTC Pirate Rumble Team Builder',
        summary:
          'Compare Pirate Rumble units and build active and bench slots from local One Piece Treasure Cruise Rumble data.',
        sections: [
          {
            title: 'Rumble-specific scoring',
            copy: 'The Rumble tools prioritize passive effects, special effects, stats, roles, type focus, and synergy instead of regular quest-only ability text.',
          },
          {
            title: 'Active and bench slots',
            copy: 'Build around the slots you care about, review suggested teams, and inspect dropped or resolved type choices.',
          },
          {
            title: 'Useful for tier-list research',
            copy: 'Rumble Characters gives a searchable ranking surface for players comparing OPTC Pirate Rumble units before building a team.',
          },
        ],
        links: [
          { label: 'Build a Rumble team', route: '/tabs/auto-team-builder-rumble' },
          { label: 'Rank Rumble characters', route: '/tabs/rumble-characters' },
        ],
      },
    },
    loadComponent: loadSeoContentPage,
  },
  {
    path: 'tools/optc-character-database',
    data: {
      contentIcon: 'catalog',
      seo: {
        title: 'OPTC Character Database | One Piece Treasure Cruise Search',
        description:
          'Search the OPTC character database by id, name, type, class, specials, captain abilities, support effects, and Pirate Rumble data.',
        canonicalPath: 'tools/optc-character-database',
      },
      content: {
        eyebrow: 'Character database',
        title: 'OPTC Character Database',
        summary:
          'Search One Piece Treasure Cruise character data and open generated detail pages with stats, abilities, supports, and Rumble information.',
        sections: [
          {
            title: 'Character search',
            copy: 'Use names, ids, types, classes, and ability text to find the units you need for a crew or Rumble setup.',
          },
          {
            title: 'Detail pages',
            copy: 'Generated character pages expose crawlable summaries for captain ability, special, support, and Pirate Rumble data where available.',
          },
          {
            title: 'Connected planning',
            copy: 'Character pages link back into the app tools so search and team planning stay connected.',
          },
        ],
        links: [
          { label: 'Open Characters', route: '/tabs/characters' },
          { label: 'Open Rumble Characters', route: '/tabs/rumble-characters' },
        ],
      },
    },
    loadComponent: loadSeoContentPage,
  },
  {
    path: 'guides/how-to-build-an-optc-team',
    data: {
      contentIcon: 'tools',
      seo: {
        title: 'How to Build an OPTC Team | One Piece Treasure Cruise Guide',
        description:
          'Learn a practical OPTC team-building workflow: pick captains, cover enemy mechanics, choose utility, lock manual slots, and compare candidates.',
        canonicalPath: 'guides/how-to-build-an-optc-team',
      },
      content: {
        eyebrow: 'Team-building guide',
        title: 'How to Build an OPTC Team',
        summary:
          'A practical workflow for One Piece Treasure Cruise players who need to turn enemy mechanics and available units into a working crew.',
        sections: [
          {
            title: 'Start with the captain',
            copy: 'Pick a captain that covers the key characters you want to use, then verify type, class, cost, universal, and self-scope coverage.',
          },
          {
            title: 'Map the mechanics',
            copy: 'List the enemy mechanics that must be handled, including bind, despair, paralysis, barriers, damage reduction, orb problems, and interrupts.',
          },
          {
            title: 'Lock and search',
            copy: 'Place known units in manual slots, then use ability filters and generated candidates to fill missing utility and damage roles.',
          },
        ],
        links: [
          { label: 'Check captain coverage', route: '/tabs/captain-coverage' },
          { label: 'Open Auto Team Builder', route: '/tabs/auto-team-builder' },
        ],
      },
    },
    loadComponent: loadSeoContentPage,
  },
  {
    path: 'guides/guided-build-compare-team-sharing',
    data: {
      contentIcon: 'flash',
      seo: {
        title: 'Guided Build, Compare Mode, and Team Sharing | OPTC Team Builder',
        description:
          'Learn how to use guided Auto Team Builder, compare current, saved, and imported teams, and move saved teams with JSON, share links, and share codes.',
        canonicalPath: 'guides/guided-build-compare-team-sharing',
      },
      content: {
        eyebrow: 'Feature guide',
        title: 'Guided Build, Compare Mode, and Team Sharing',
        summary:
          'Use guided auto build to fill one crew slot at a time, compare team sources side by side, and move saved teams between devices with supported local transfer formats.',
        sections: [
          {
            title: 'Guided auto build',
            copy: 'Turn on Guided auto build when you want the builder to fill and lock only the next empty slot. It starts with Captain, then advances through subs while keeping earlier picks locked; when all manual slots are filled, the next build validates the locked team.',
          },
          {
            title: 'Compare mode sources',
            copy: 'Compare mode can use the current generated team, a team already saved on this device, or an imported payload. Use it to check changed slots, filled slots, ability counts, Captain Ability tier coverage, and ship differences before saving or rebuilding.',
          },
          {
            title: 'Supported transfer formats',
            copy: 'Saved Teams import accepts schema v1 saved-teams JSON, a saved-team share link, or a raw saved-team share code. Stable-id v1 team records can be repaired when optional fields are missing or stale; unsupported schemas, malformed share codes, and teams without a stable id are rejected.',
          },
          {
            title: 'Example flows',
            copy: 'Build a team with guided mode, save it, share it from Saved Teams, then open the share link on another device to preload Manual Team Builder as an unsaved draft. You can also paste the same share code into Saved Teams import or Compare mode.',
          },
          {
            title: 'Current limits',
            copy: 'Saved teams are local to the current browser or app install unless you export, share, import, or sync them. Corrupted local saved-team storage is repaired in place when possible, and unrecoverable records are removed with a warning instead of breaking the page.',
          },
        ],
        links: [
          { label: 'Open Auto Team Builder', route: '/tabs/auto-team-builder' },
          { label: 'Open Saved Teams', route: '/tabs/saved-teams' },
        ],
      },
    },
    loadComponent: loadSeoContentPage,
  },
  {
    path: 'guides/optc-pirate-rumble-team-building',
    data: {
      contentIcon: 'rumble',
      seo: {
        title: 'OPTC Pirate Rumble Team Building Guide | Rumble Builder',
        description:
          'Build better OPTC Pirate Rumble teams by comparing Rumble passives, specials, stats, roles, active slots, bench slots, and type synergy.',
        canonicalPath: 'guides/optc-pirate-rumble-team-building',
      },
      content: {
        eyebrow: 'Pirate Rumble guide',
        title: 'OPTC Pirate Rumble Team Building',
        summary:
          'Use Rumble-specific data to compare units, shape active and bench slots, and understand team synergy before saving a setup.',
        sections: [
          {
            title: 'Use Rumble data',
            copy: 'Regular specials and captain abilities do not describe the whole Rumble picture. Compare passive effects, special effects, cooldown, defense, speed, and role tags.',
          },
          {
            title: 'Balance roles',
            copy: 'Strong Rumble teams usually need damage, survivability, control, and support effects distributed across active and bench slots.',
          },
          {
            title: 'Compare before saving',
            copy: 'Use Rumble Characters for unit ranking, then use Auto Team Rumble Builder to test team combinations and save useful results.',
          },
        ],
        links: [
          { label: 'Rank Rumble characters', route: '/tabs/rumble-characters' },
          { label: 'Build a Rumble team', route: '/tabs/auto-team-builder-rumble' },
        ],
      },
    },
    loadComponent: loadSeoContentPage,
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
