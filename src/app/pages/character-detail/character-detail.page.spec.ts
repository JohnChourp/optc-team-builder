import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CharacterDetailPage template', () => {
  it('renders formatted support entries and super special content', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/character-detail/character-detail.page.html'),
      'utf8',
    );

    expect(template).toContain("t('sections.superSpecial')");
    expect(template).toContain("current.detail.superSpecialCriteriaText");
    expect(template).toContain("t('support.supportedCharactersLabel')");
    expect(template).toContain('entry.supportedCharactersText');
    expect(template).toContain('entry.levelDescriptions');
    expect(template).not.toContain('supportData | json');
  });
});
