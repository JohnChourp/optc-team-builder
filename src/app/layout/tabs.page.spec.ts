import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('TabsPage', () => {
  it('renders the drawer navigation items and removes the bottom tab bar', () => {
    const template = readFileSync(resolve(process.cwd(), 'src/app/layout/tabs.page.html'), 'utf8');

    expect(template).toContain('<ion-menu');
    expect(template).toContain('id="tabs-menu-content"');
    expect(template).toContain('<ion-accordion-group');
    expect(template).toContain('[animated]="false"');
    expect(template).toContain('[multiple]="false"');
    expect(template).toContain('value="browse"');
    expect(template).toContain('[routerLink]="[item.route]"');
    expect(template).toContain('[routerLink]="[settingsNavItem.route]"');
    expect(template).toContain('"tabs.menuTitle" | transloco');
    expect(template).toContain("'tabs.navigationAriaLabel' | transloco");
    expect(template).toContain('class="tabs-menu__footer"');
    expect(template).toContain("'tabs.languageSwitcherAriaLabel' | transloco");
    expect(template).toContain("'tabs.languageSwitchTo' | transloco");
    expect(template).not.toContain('"tabs.menuCopy" | transloco');
    expect(template).not.toContain('<ion-tab-bar');
  });

  it('uses the expected navigation and language-switcher definitions', () => {
    const component = readFileSync(resolve(process.cwd(), 'src/app/layout/tabs.page.ts'), 'utf8');

    expect(component).toContain('public readonly navigationGroups');
    expect(component).toContain("id: 'browse'");
    expect(component).toContain("'tabs.groups.browse'");
    expect(component).toContain("id: 'build'");
    expect(component).toContain("'tabs.groups.build'");
    expect(component).toContain("id: 'saved-sync'");
    expect(component).toContain("'tabs.groups.savedSync'");
    expect(component).toContain('public readonly settingsNavItem');
    expect(component).toContain("'tabs.home'");
    expect(component).toContain("route: '/'");
    expect(component).toContain("'tabs.characters'");
    expect(component).not.toContain("'tabs.team'");
    expect(component).toContain("'tabs.auto'");
    expect(component).toContain("route: '/tabs/auto-team-builder'");
    expect(component).toContain("'tabs.captainCoverage'");
    expect(component).toContain("route: '/tabs/captain-coverage'");
    expect(component).toContain("'tabs.autoRumble'");
    expect(component).toContain("route: '/tabs/auto-team-builder-rumble'");
    expect(component).toContain("'tabs.rumbleCharacters'");
    expect(component).toContain("route: '/tabs/rumble-characters'");
    expect(component.indexOf("id: 'browse'")).toBeLessThan(component.indexOf("id: 'build'"));
    expect(component.indexOf("id: 'build'")).toBeLessThan(component.indexOf("id: 'saved-sync'"));
    expect(component.indexOf("'tabs.home'")).toBeLessThan(
      component.indexOf("'tabs.rumbleCharacters'"),
    );
    expect(component.indexOf("'tabs.auto'")).toBeLessThan(
      component.indexOf("'tabs.crewForge'"),
    );
    expect(component.indexOf("'tabs.characterBoxes'")).toBeGreaterThan(
      component.indexOf("'tabs.auto'"),
    );
    expect(component.indexOf("'tabs.savedTeams'")).toBeLessThan(
      component.indexOf("'tabs.savedRumbleTeams'"),
    );
    expect(component).toContain("'tabs.savedRumbleTeams'");
    expect(component).toContain("route: '/tabs/saved-rumble-teams'");
    expect(component).toContain("'tabs.crewForge'");
    expect(component).toContain("'tabs.savedTeams'");
    expect(component).toContain("'tabs.characterBoxes'");
    expect(component).toContain("'tabs.savedEnemies'");
    expect(component).toContain("'tabs.driveSync'");
    expect(component).toContain("route: '/tabs/drive-sync'");
    expect(component).toContain("'tabs.settings'");
    expect(component.indexOf('public readonly settingsNavItem')).toBeGreaterThan(
      component.indexOf('public readonly navigationGroups'),
    );
    expect(component).toContain("{ id: 'en', flag: '🇬🇧' }");
    expect(component).toContain("{ id: 'el', flag: '🇬🇷' }");
    expect(component).toContain('this.i18n.setLanguage(language)');
    expect(component).not.toContain("'tabs.offline'");
  });
});
