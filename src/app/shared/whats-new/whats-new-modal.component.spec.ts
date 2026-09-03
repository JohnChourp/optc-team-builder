import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { WHATS_NEW_ENTRIES } from '../../core/data/whats-new.data';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonButtons: class {},
  IonContent: class {},
  IonIcon: class {},
  IonModal: class {},
}));

function readTabsTemplate(): string {
  return readFileSync(resolve(process.cwd(), 'src/app/layout/tabs.page.html'), 'utf8').replace(
    /\r\n/g,
    '\n',
  );
}

describe('whats-new', () => {
  it('carries one entry per shipped release, newest first', () => {
    expect(WHATS_NEW_ENTRIES.length).toBeGreaterThan(100);

    const versions = WHATS_NEW_ENTRIES.map((entry) => entry.version);

    expect(new Set(versions).size).toBe(versions.length);

    const ordered = [...versions].sort((left, right) => {
      const l = left.split('.').map(Number);
      const r = right.split('.').map(Number);

      return r[0]! - l[0]! || r[1]! - l[1]! || r[2]! - l[2]!;
    });

    expect(versions).toEqual(ordered);
  });

  it('says something in both languages for every release, including the quiet ones', () => {
    for (const entry of WHATS_NEW_ENTRIES) {
      expect(entry.version, 'version').toMatch(/^\d+\.\d+\.\d+$/u);
      expect(entry.date, `date for ${entry.version}`).toMatch(/^\d{4}-\d{2}-\d{2}$/u);

      // The point of the page: a player reads a sentence, not a commit subject.
      expect(entry.headline.en.length, `headline en ${entry.version}`).toBeGreaterThan(0);
      expect(entry.headline.el.length, `headline el ${entry.version}`).toBeGreaterThan(0);
      expect(entry.summaryEn.length, `summary en ${entry.version}`).toBeGreaterThan(20);
      expect(entry.summaryEl.length, `summary el ${entry.version}`).toBeGreaterThan(20);

      for (const bullet of [...entry.added, ...entry.improved, ...entry.fixed]) {
        expect(bullet.en.length, `bullet en ${entry.version}`).toBeGreaterThan(0);
        expect(bullet.el.length, `bullet el ${entry.version}`).toBeGreaterThan(0);
      }
    }
  });

  /*
   * A release that changed nothing a player can see is listed and marked, not
   * dropped. Dropping it would leave a hole in the version numbers and read as
   * something withheld.
   */
  it('marks releases with no visible change instead of hiding them', () => {
    const quiet = WHATS_NEW_ENTRIES.filter((entry) => !entry.userVisible);

    expect(quiet.length).toBeGreaterThan(0);

    for (const entry of quiet) {
      expect(entry.added, `added for ${entry.version}`).toEqual([]);
      expect(entry.improved, `improved for ${entry.version}`).toEqual([]);
      expect(entry.fixed, `fixed for ${entry.version}`).toEqual([]);
    }
  });

  it('never leaves a visible release with nothing to show', () => {
    for (const entry of WHATS_NEW_ENTRIES.filter((item) => item.userVisible)) {
      const bullets = entry.added.length + entry.improved.length + entry.fixed.length;

      expect(bullets, `bullets for ${entry.version}`).toBeGreaterThan(0);
    }
  });

  it('opens from the menu, above Settings, and defers its chunk until asked', () => {
    const template = readTabsTemplate();
    const whatsNewIndex = template.indexOf('data-test="menu-whats-new"');
    const settingsIndex = template.indexOf('menu-item--settings');

    expect(whatsNewIndex).toBeGreaterThan(-1);
    // The owner asked for it directly above Settings in the menu footer.
    expect(whatsNewIndex).toBeLessThan(settingsIndex);
    expect(template).toContain('(click)="openWhatsNew()"');
    // 121 releases of history must not sit in the initial bundle.
    expect(template).toContain('@defer (when whatsNewRequested())');
    expect(template).toContain('<app-whats-new-modal');
  });
});
