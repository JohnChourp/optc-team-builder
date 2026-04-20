import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CharacterDetailPage template', () => {
  it('renders grouped compact sections without raw json output', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/character-detail/character-detail.page.html'),
      'utf8',
    );

    expect(template).toContain('[src]="heroImageUrl()"');
    expect(template).toContain("t(group.titleKey)");
    expect(template).toContain('hero-meta-grid');
    expect(template).toContain('hero-stats-grid');
    expect(template).toContain('detail-card');
    expect(template).toContain('meta.labelKey');
    expect(template).toContain('list.labelKey');
    expect(template).toContain('detail-entry-grid');
    expect(template).not.toContain('| json');
  });
});
