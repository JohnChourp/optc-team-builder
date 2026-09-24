import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { SUPPORTED_SECTIONS } from './supported.data';
import { SupportedPage } from './supported.page';

vi.mock('@ionic/angular/ion-buttons', () => ({
  IonButtons: class {},
}));
vi.mock('@ionic/angular/ion-content', () => ({
  IonContent: class {},
}));
vi.mock('@ionic/angular/ion-header', () => ({
  IonHeader: class {},
}));
vi.mock('@ionic/angular/ion-menu-button', () => ({
  IonMenuButton: class {},
}));
vi.mock('@ionic/angular/ion-title', () => ({
  IonTitle: class {},
}));
vi.mock('@ionic/angular/ion-toolbar', () => ({
  IonToolbar: class {},
}));

/**
 * 869f1zxuy. `supported.data.spec.ts` proves every declared section and row has copy in both
 * languages. This is the half it cannot see: that the page shows exactly those sections, builds
 * exactly those keys, and opens the side menu like the other menu destinations.
 *
 * No TestBed, like every page spec here (docs/suite-environments.json): the page is built with `new`
 * and the template is read as the source it is.
 */

const template = readFileSync(resolve(process.cwd(), 'src/app/pages/supported/supported.page.html'), 'utf8');
const english = JSON.parse(readFileSync(resolve(process.cwd(), 'public/i18n/supported/en.json'), 'utf8'));

describe('SupportedPage', () => {
  it('shows every declared section, in the declared order, with every one of its rows', () => {
    expect(new SupportedPage().sections).toBe(SUPPORTED_SECTIONS);
    expect(template).toContain('@for (section of sections; track section.id) {');
    expect(template).toContain('@for (row of section.rows; track row) {');
  });

  it('reads its copy from the supported scope, building the keys the data spec checks', () => {
    expect(template).toContain(`*transloco="let t; scope: 'supported'; read: 'supported'"`);
    expect(template).toContain("{{ t('eyebrow') }}");
    expect(template).toContain("{{ t('title') }}");
    expect(template).toContain("{{ t('summary') }}");
    expect(template).toContain("{{ t('sections.' + section.id + '.title') }}");
    expect(template).toContain("{{ t('sections.' + section.id + '.rows.' + row) }}");
  });

  it('opens with the page title a reader sees, and a card per section beneath it', () => {
    const [first] = new SupportedPage().sections;

    expect(english.title).toBe('What this app supports');
    expect(english.sections[first?.id ?? '']?.title).toBe('Phones and computers');
    expect(template.match(/<section class="glass-card/gu)).toHaveLength(2);
    expect(template.indexOf('supported-hero')).toBeLessThan(template.indexOf('@for (section of sections'));
  });

  it('opens the drawer instead of going back, because it is a menu destination', () => {
    expect(template).toContain('<ion-menu-button menu="tabs-navigation-menu" autoHide="false"></ion-menu-button>');
    expect(template).not.toMatch(/app-toolbar-back-button|ion-back-button/u);
  });
});
