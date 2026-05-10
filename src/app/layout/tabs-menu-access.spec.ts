import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const tabPageTemplates = [
  'src/app/pages/home/home.page.html',
  'src/app/pages/characters/characters.page.html',
  'src/app/pages/auto-team-builder/auto-team-builder.page.html',
  'src/app/pages/rumble-characters/rumble-characters.page.html',
  'src/app/pages/crew-forge/crew-forge.page.html',
  'src/app/pages/saved-teams/saved-teams.page.html',
  'src/app/pages/character-boxes/character-boxes.page.html',
  'src/app/pages/saved-enemies/saved-enemies.page.html',
  'src/app/pages/account/account.page.html',
  'src/app/pages/settings/settings.page.html',
];

describe('tabs drawer access', () => {
  it('adds a menu button to every tabs page header', () => {
    for (const templatePath of tabPageTemplates) {
      const template = readFileSync(resolve(process.cwd(), templatePath), 'utf8');

      expect(template).toContain('<ion-buttons slot="start">');
      expect(template).toContain(
        '<ion-menu-button menu="tabs-navigation-menu" autoHide="false"></ion-menu-button>',
      );
    }
  });
});
