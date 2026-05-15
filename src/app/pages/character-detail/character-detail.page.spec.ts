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
    expect(template).toContain('<app-toolbar-back-button></app-toolbar-back-button>');
    expect(template).toContain('t(group.titleKey)');
    expect(template).toContain('hero-meta-grid');
    expect(template).toContain('hero-stats-grid');
    expect(template).toContain('<app-character-ability-groups');
    expect(template).toContain('[abilities]="displayBuilderAbilities(current)"');
    expect(template).toContain('view.captainAbilitySummary');
    expect(template).toContain('captainSummary.coverageEntries');
    expect(template).toContain('entry.text');
    expect(template).toContain('captainSummary.captainNotes');
    expect(template).toContain('entry.firstCoverageClauses');
    expect(template).toContain('entry.secondCoverageClauses');
    expect(template).toContain('[abilities]="captainSummary.recognizedAbilities"');
    expect(template).toContain('captainSummary.characterTags');
    expect(template).toContain('[catalogItems]="abilityCatalog()?.abilities ?? []"');
    expect(template).toContain("t('fields.recognizedCaptainAbilities')");
    expect(template).toContain("t('sections.abilitySummary')");
    expect(template).toContain("t('sections.firstCoverage')");
    expect(template).toContain("t('sections.secondCoverage')");
    expect(template).toContain("t('sections.characterTags')");
    expect(template).toContain('detail-card');
    expect(template).toContain('meta.labelKey');
    expect(template).toContain('list.labelKey');
    expect(template).toContain('detail-entry-grid');
    expect(template).not.toContain('| json');
    expect(template).not.toContain('ion-back-button');
  });
});
