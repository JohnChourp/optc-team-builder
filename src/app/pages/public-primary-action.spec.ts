import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FAQ_SECTIONS } from './faq/faq.data';
import { SEO_CONTENT_PAGES } from './seo-content/seo-content.data';

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

/*
 * 869f13c5p. One primary action per public page: the one thing a reader of that page came to do,
 * rendered as its only solid button, with everything else outlined. Before this, every tool and guide
 * page rendered all of its links as equal solid buttons, and the how-to-build guide's first one sent
 * a reader who wanted to build a team to Captain Coverage instead.
 *
 * The tool screens under `tabs/` are the tools themselves and the policy pages have no action to
 * make primary, so the pages below are every public page that asks a visitor to go somewhere.
 */
describe('one primary action per public page', () => {
  it('Home keeps exactly one solid action', () => {
    expect(read('src/app/pages/home/home.page.ts').match(/fill: 'solid'/gu)).toHaveLength(1);
  });

  it('a tool or guide page renders its first link solid and every other link outlined', () => {
    const template = read('src/app/pages/seo-content/seo-content.page.html');

    expect(template).toContain('track link.route; let first = $first');
    expect(template).toContain(`[fill]="first ? 'solid' : 'outline'"`);
    expect(template).toContain(`[color]="first ? 'warning' : 'light'"`);
    expect(template).not.toMatch(/\bfill="solid"/u);
  });

  it.each([
    ['tools/optc-team-builder', '/tabs/auto-team-builder'],
    ['tools/optc-auto-team-builder', '/tabs/auto-team-builder'],
    ['tools/optc-rumble-team-builder', '/tabs/auto-team-builder-rumble'],
    ['tools/optc-character-database', '/tabs/characters'],
    ['guides/how-to-build-an-optc-team', '/tabs/auto-team-builder'],
    ['guides/guided-build-compare-team-sharing', '/tabs/auto-team-builder'],
    ['guides/optc-pirate-rumble-team-building', '/tabs/auto-team-builder-rumble'],
  ])('%s leads with %s', (page, primary) => {
    expect(SEO_CONTENT_PAGES[page]?.links[0]?.route).toBe(primary);
  });

  it('pins a primary for every tool and guide page, so a new one needs a decision', () => {
    expect(Object.keys(SEO_CONTENT_PAGES)).toHaveLength(7);
  });

  it('never offers the same destination twice on one page', () => {
    for (const [page, content] of Object.entries(SEO_CONTENT_PAGES)) {
      const routes = content.links.map((link) => link.route);

      expect(new Set(routes).size, page).toBe(routes.length);
    }
  });

  it('the FAQ makes exactly one link primary: where to start, Auto Team Builder', () => {
    const primaries = FAQ_SECTIONS.flatMap((section) =>
      section.entries.flatMap((entry) =>
        entry.links.filter((link) => link.primary).map((link) => `${entry.id}:${link.route}`),
      ),
    );

    expect(primaries).toEqual(['whereToStart:/tabs/auto-team-builder']);
  });

  it('a character page keeps exactly one solid action: its bridge into a tool (869f13c5c)', () => {
    const template = read('src/app/pages/character-detail/character-detail.page.html');

    expect(template.match(/fill="solid"/gu)).toHaveLength(1);
    expect(template).toMatch(/fill="solid"\s+color="warning"\s+data-test="character-bridge"/u);
  });

  it('the FAQ renders a primary link solid and every other link outlined', () => {
    const template = read('src/app/pages/faq/faq.page.html');

    expect(template).toContain(`[fill]="link.primary ? 'solid' : 'outline'"`);
    expect(template).not.toMatch(/\bfill="(?:solid|outline)"/u);
  });
});
