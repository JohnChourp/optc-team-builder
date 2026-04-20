import { describe, expect, it } from "vitest";

import { routes } from "./app.routes";

describe("app routes", () => {
  it("registers the saved teams tab route", () => {
    const tabsRoute = routes.find((route) => route.path === "tabs");
    const savedTeamsRoute = tabsRoute?.children?.find((route) => route.path === "saved-teams");

    expect(savedTeamsRoute).toBeDefined();
    expect(savedTeamsRoute?.loadComponent).toBeTypeOf("function");
  });

  it("registers the character boxes route inside tabs", () => {
    const tabsRoute = routes.find((route) => route.path === "tabs");
    const characterBoxesRoute = tabsRoute?.children?.find((route) => route.path === "character-boxes");

    expect(characterBoxesRoute).toBeDefined();
    expect(characterBoxesRoute?.loadComponent).toBeTypeOf("function");
  });

  it("registers the crew forge route inside tabs", () => {
    const tabsRoute = routes.find((route) => route.path === "tabs");
    const crewForgeRoute = tabsRoute?.children?.find((route) => route.path === "crew-forge");

    expect(crewForgeRoute).toBeDefined();
    expect(crewForgeRoute?.loadComponent).toBeTypeOf("function");
  });

  it("registers the saved enemies route inside tabs", () => {
    const tabsRoute = routes.find((route) => route.path === "tabs");
    const savedEnemiesRoute = tabsRoute?.children?.find((route) => route.path === "saved-enemies");

    expect(savedEnemiesRoute).toBeDefined();
    expect(savedEnemiesRoute?.loadComponent).toBeTypeOf("function");
  });

  it("redirects the legacy collection tab route to saved teams", () => {
    const tabsRoute = routes.find((route) => route.path === "tabs");
    const collectionRoute = tabsRoute?.children?.find((route) => route.path === "collection");

    expect(collectionRoute?.redirectTo).toBe("saved-teams");
    expect(collectionRoute?.pathMatch).toBe("full");
  });

  it("registers the privacy policy route inside the tabs shell", () => {
    const tabsRoute = routes.find((route) => route.path === "tabs");
    const privacyRoute = tabsRoute?.children?.find((route) => route.path === "privacy");

    expect(privacyRoute).toBeDefined();
    expect(privacyRoute?.loadComponent).toBeTypeOf("function");
  });

  it("registers the cookie policy route inside the tabs shell", () => {
    const tabsRoute = routes.find((route) => route.path === "tabs");
    const cookieRoute = tabsRoute?.children?.find((route) => route.path === "cookies");

    expect(cookieRoute).toBeDefined();
    expect(cookieRoute?.loadComponent).toBeTypeOf("function");
  });

  it("redirects the legacy privacy and cookie routes into tabs", () => {
    const privacyRoute = routes.find((route) => route.path === "privacy");
    const cookieRoute = routes.find((route) => route.path === "cookies");

    expect(privacyRoute?.redirectTo).toBe("tabs/privacy");
    expect(privacyRoute?.pathMatch).toBe("full");
    expect(cookieRoute?.redirectTo).toBe("tabs/cookies");
    expect(cookieRoute?.pathMatch).toBe("full");
  });
});
