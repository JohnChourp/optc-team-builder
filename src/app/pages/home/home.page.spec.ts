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
    expect(component).toContain("route: '/tabs/rumble-characters'");
    expect(component).toContain("route: '/tabs/auto-team-builder'");
    expect(component).toContain("route: '/tabs/captain-coverage'");
    expect(component).toContain("route: '/tabs/auto-team-builder-rumble'");
    expect(component).toContain("route: '/tabs/saved-rumble-teams'");
    expect(component).toContain("route: '/tabs/crew-forge'");
    expect(component).toContain("route: '/tabs/saved-teams'");
    expect(component).toContain("route: '/tabs/character-boxes'");
    expect(component).toContain("route: '/tabs/saved-enemies'");
    expect(component).toContain("route: '/tabs/drive-sync'");
    expect(component).toContain("route: '/tabs/settings'");
    expect(component).not.toContain("route: '/tabs/team-builder'");
  });

  it('keeps homepage hero images visible to audits with descriptive alt text', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/home/home.page.html'),
      'utf8',
    );
    const component = readFileSync(
      resolve(process.cwd(), 'src/app/pages/home/home.page.ts'),
      'utf8',
    );

    expect(template).not.toContain('class="home-hero__visual" aria-hidden="true"');
    expect(template).not.toContain('alt=""');
    expect(template).toContain('alt="OPTC Team Builder logo"');
    expect(template).toContain('[alt]="characterImage.alt"');
    expect(component).toContain('Kozuki Hiyori - Graveside Prayer character artwork');
    expect(component).toContain('Kozuki Hiyori - Resounding Shamisen character artwork');
    expect(component).toContain('Kid & Killer DEX character artwork');
  });
});
