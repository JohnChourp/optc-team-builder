import '@angular/compiler';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MENU_BUTTON = '<ion-menu-button menu="tabs-navigation-menu" autoHide="false"></ion-menu-button>';
const BACK_BUTTON = /app-toolbar-back-button|ion-back-button/u;

/**
 * Pages under the tabs shell that deliberately have NO drawer button.
 *
 * Each carries a back button instead, because each is reached FROM somewhere
 * rather than being a destination in the drawer: the three policy pages are
 * linked from the footer and Settings, and the two character pages are opened
 * from a list. Verified below rather than asserted - if one of these ever loses
 * its back button it has no way out at all, which is worse than the defect this
 * file was written for.
 */
const NO_DRAWER_BUTTON = new Map([
  ['src/app/pages/privacy-policy/privacy-policy.page.html', 'Policy page, linked from the footer and Settings.'],
  ['src/app/pages/cookie-policy/cookie-policy.page.html', 'Policy page, linked from the footer and Settings.'],
  ['src/app/pages/terms-of-service/terms-of-service.page.html', 'Policy page, linked from the footer and Settings.'],
  ['src/app/pages/character-detail/character-detail.page.html', 'Opened from a character list, not from the drawer.'],
  ['src/app/pages/character-edit/character-edit.page.html', 'Opened from the character detail page.'],
]);

/**
 * Every page template the tabs shell can route to, read from the routes file.
 *
 * This list used to be ten hand-written paths under a title claiming "every
 * tabs page header". The shell had thirteen pages carrying the drawer button,
 * so four were unasserted - manual-team-builder, captain-coverage,
 * auto-team-builder-rumble and saved-rumble-teams - and a page added later was
 * uncovered by default.
 */
function tabsPageTemplates(): string[] {
  const source = readFileSync(resolve(process.cwd(), 'src/app/app.routes.ts'), 'utf8');
  const start = source.indexOf("path: 'tabs'");

  expect(start, "app.routes.ts no longer declares a 'tabs' route").toBeGreaterThan(-1);

  const end = source.indexOf("path: '**'", start);
  const segment = source.slice(start, end === -1 ? source.length : end);
  const templates = new Set<string>();

  for (const [, modulePath] of segment.matchAll(/import\('([^']+)'\)/gu)) {
    if (!modulePath?.startsWith('./pages/')) {
      continue;
    }

    const template = `src/app/${modulePath.replace(/^\.\//u, '')}.html`;

    if (existsSync(resolve(process.cwd(), template))) {
      templates.add(template);
    }
  }

  return [...templates].sort();
}

describe('tabs drawer access', () => {
  it('adds a menu button to every tabs page header', () => {
    const templates = tabsPageTemplates();

    // The shell had 18 page templates when this was written; the floor guards
    // against a parse change silently reducing this to an empty loop.
    expect(templates.length).toBeGreaterThanOrEqual(15);

    const missing: string[] = [];

    for (const templatePath of templates) {
      if (NO_DRAWER_BUTTON.has(templatePath)) {
        continue;
      }

      const template = readFileSync(resolve(process.cwd(), templatePath), 'utf8');

      expect(template, `${templatePath} has no start-slot buttons`).toContain(
        '<ion-buttons slot="start">',
      );

      if (!template.includes(MENU_BUTTON)) {
        missing.push(templatePath);
      }
    }

    expect(
      missing,
      'these tabs pages have no drawer button and are not listed as deliberate exceptions',
    ).toEqual([]);
  });

  it('gives every page without a drawer button a back button and a reason', () => {
    for (const [templatePath, reason] of NO_DRAWER_BUTTON) {
      expect(existsSync(resolve(process.cwd(), templatePath)), `${templatePath} is gone`).toBe(true);

      const template = readFileSync(resolve(process.cwd(), templatePath), 'utf8');

      expect(template, `${templatePath} has neither a drawer button nor a back button`).toMatch(
        BACK_BUTTON,
      );
      expect(reason.length, `${templatePath} is excepted with no reason`).toBeGreaterThan(20);
    }
  });
});
