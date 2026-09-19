import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/app/pages/seo-content/seo-content.page.ts'), 'utf8');
const template = readFileSync(resolve(process.cwd(), 'src/app/pages/seo-content/seo-content.page.html'), 'utf8');

/*
 * 869f13c6b. The tool and guide pages are English by decision (869dwcbb8), while the app sets
 * <html lang="el"> when a reader picks Greek - so this page's English copy was declared Greek. It
 * declares its own language now; these pin that, and the fact that makes the declaration true.
 */
describe('SeoContentPage language', () => {
  it('declares its content English whatever language the app is in', () => {
    expect(source).toMatch(/host:\s*\{\s*lang:\s*'en'\s*\}/u);
  });

  it('is still untranslated, which is what makes lang="en" true', () => {
    // Translating this page means removing the host declaration above, or it lies the other way.
    expect(template).not.toMatch(/transloco|\bt\(/u);
  });
});
