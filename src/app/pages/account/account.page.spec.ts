import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('DriveSyncPage', () => {
  it('renders drawer access, Drive status, and reviewed sync modal controls', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/drive-sync/drive-sync.page.html'),
      'utf8',
    );

    expect(template).toContain(
      '<ion-menu-button menu="tabs-navigation-menu" autoHide="false"></ion-menu-button>',
    );
    expect(template).toContain("t('driveSync.title')");
    expect(template).toContain("t('driveSync.actions.syncNow')");
    expect(template).toContain("openReviewedSync('merge-and-upload')");
    expect(template).toContain("openReviewedSync('replace-cloud')");
    expect(template).toContain("openReviewedSync('replace-local')");
    expect(template).toContain('class="drive-review-modal"');
    expect(template).toContain('[isOpen]="reviewDraft() !== null"');
    expect(template).toContain('@for (filter of reviewStatusFilters; track filter)');
    expect(template).toContain('setReviewFilter(filter)');
    expect(template).toContain('filteredReviewSections()');
    expect(template).toContain('onReviewChoiceChange(section.key, row.key, $event)');
    expect(template).toContain('confirmReview()');
  });

  it('uses the reviewed Drive service path instead of direct destructive prompt resolution', () => {
    const component = readFileSync(
      resolve(process.cwd(), 'src/app/pages/drive-sync/drive-sync.page.ts'),
      'utf8',
    );

    expect(component).toContain('prepareReviewedManualSync(action)');
    expect(component).toContain('commitReviewedManualSync(');
    expect(component).toContain('buildDriveSyncReviewDraft(');
    expect(component).toContain('buildReviewedAllDataPayload(draft)');
    expect(component).toContain("reviewFilter = signal<DriveSyncReviewRowStatus | 'all'>('all')");
  });
});
