import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('HomePage', () => {
  it('renders menu access, translated sections, and primary CTA routes', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/home/home.page.html'),
      'utf8',
    );

    expect(template).toContain(
      '<ion-menu-button menu="tabs-navigation-menu" autoHide="false"></ion-menu-button>',
    );
    expect(template).toContain("read: 'home'");
    expect(template).toContain("t('hero.title')");
    expect(template).toContain("t('features.title')");
    expect(template).toContain("t('workflow.title')");
    expect(template).toContain('[routerLink]="[action.route]"');
    expect(template).toContain('[routerLink]="[feature.route]"');
  });

  it('defines homepage actions and feature links for the main app pages', () => {
    const component = readFileSync(
      resolve(process.cwd(), 'src/app/pages/home/home.page.ts'),
      'utf8',
    );

    expect(component).toContain("route: '/tabs/characters'");
    expect(component).toContain("route: '/tabs/team-builder'");
    expect(component).toContain("route: '/tabs/auto-team-builder'");
    expect(component).toContain("route: '/tabs/crew-forge'");
    expect(component).toContain("route: '/tabs/saved-teams'");
    expect(component).toContain("route: '/tabs/character-boxes'");
    expect(component).toContain("route: '/tabs/saved-enemies'");
    expect(component).toContain("route: '/tabs/settings'");
  });
});
