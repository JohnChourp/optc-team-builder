import { Routes } from "@angular/router";

export const routes: Routes = [
  {
    path: "",
    pathMatch: "full",
    redirectTo: "tabs/characters",
  },
  {
    path: "tabs",
    loadComponent: () =>
      import("./layout/tabs.page").then((module) => module.TabsPage),
    children: [
      {
        path: "characters",
        loadComponent: () =>
          import("./pages/characters/characters.page").then((module) => module.CharactersPage),
      },
      {
        path: "team-builder",
        loadComponent: () =>
          import("./pages/team-builder/team-builder.page").then((module) => module.TeamBuilderPage),
      },
      {
        path: "auto-team-builder",
        loadComponent: () =>
          import("./pages/auto-team-builder/auto-team-builder.page").then((module) => module.AutoTeamBuilderPage),
      },
      {
        path: "collection",
        loadComponent: () =>
          import("./pages/collection/collection.page").then((module) => module.CollectionPage),
      },
      {
        path: "settings",
        loadComponent: () =>
          import("./pages/settings/settings.page").then((module) => module.SettingsPage),
      },
      {
        path: "",
        pathMatch: "full",
        redirectTo: "characters",
      },
    ],
  },
  {
    path: "characters/:id",
    loadComponent: () =>
      import("./pages/character-detail/character-detail.page").then((module) => module.CharacterDetailPage),
  },
  {
    path: "**",
    redirectTo: "tabs/characters",
  },
];
