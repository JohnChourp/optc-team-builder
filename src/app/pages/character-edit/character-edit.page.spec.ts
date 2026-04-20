import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CharacterEditPage template', () => {
  it('renders the structured editor sections and advanced json editor', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/character-edit/character-edit.page.html'),
      'utf8',
    );

    expect(template).toContain("t('sections.core')");
    expect(template).toContain("t('sections.stats')");
    expect(template).toContain("t('sections.images')");
    expect(template).toContain("t('sections.advancedJson')");
    expect(template).toContain('onThumbnailFileSelected');
    expect(template).toContain('onDetailFileSelected');
    expect(template).toContain('applyAdvancedJson()');
  });
});
