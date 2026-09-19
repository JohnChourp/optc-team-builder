import '@angular/compiler';
import { signal } from '@angular/core';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Capacitor } from '@capacitor/core';

import { CookiePolicyPage } from '../../pages/cookie-policy/cookie-policy.page';
import { shouldAskForAnalyticsConsent } from './analytics-consent-prompt.utils';
import { GOOGLE_TAG_MANAGER_CONTAINER_ID, GoogleAnalyticsService } from './google-analytics.service';

vi.mock('@ionic/angular', () => ({ IonIcon: class {} }));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

/*
 * 869f13c5m. Nothing that measures a reader loads before they accept analytics (owner decision,
 * 2026-09-18: "nothing loads until Accept; ask later"). Until then the Google Tag Manager container
 * - and Microsoft Clarity, which it delivers - loaded from every page on every visit, and GA4's
 * gtag.js loaded before consent too, with only `analytics_storage` defaulted to denied.
 */
describe('nothing loads before a reader accepts analytics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['src/index.html', 'public/404.html', 'scripts/generate-seo-pages.mjs'])(
    '%s loads no tag manager, gtag.js or container',
    (file) => {
      const source = read(file);

      // The origin itself may still be named: the CSP in index.html must allow it after Accept.
      expect(source).not.toMatch(/googletagmanager\.com\/(?:gtm\.js|gtag\/js|ns\.html)/u);
      expect(source).not.toContain(GOOGLE_TAG_MANAGER_CONTAINER_ID);
      expect(source).not.toMatch(/window\.gtag\s*\(|'gtm\.start'/u);
    },
  );

  it('loads the container and gtag.js only from enable(), once each', () => {
    const document = createDocument();
    const service = new GoogleAnalyticsService(document, { ga4MeasurementId: 'G-CONSENT1' });

    service.disable();
    expect(document.querySelectorAll('script').length).toBe(0);

    service.enable();
    service.enable();

    const tagManager = document.querySelectorAll('script[src*="googletagmanager.com/gtm.js"]');

    expect(tagManager.length).toBe(1);
    expect(tagManager[0]?.getAttribute('src')).toContain(`id=${GOOGLE_TAG_MANAGER_CONTAINER_ID}`);
    expect(document.querySelectorAll('script[src*="googletagmanager.com/gtag/js"]').length).toBe(1);
    expect(document.defaultView?.dataLayer).toEqual(
      expect.arrayContaining([{ 'gtm.start': expect.any(Number), event: 'gtm.js' }]),
    );
  });

  it.each([
    ['there is no GA4 id', '', false],
    ['the app is native', 'G-NATIVE1', true],
  ])('is unavailable, and loads nothing even on enable(), when %s', (_label, id, native) => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(native);
    const document = createDocument();
    const service = new GoogleAnalyticsService(document, { ga4MeasurementId: id });

    expect(service.isAvailable()).toBe(false);
    expect(service.enable()).toBe(false);
    expect(document.querySelectorAll('script').length).toBe(0);
  });
});

describe('when the banner asks', () => {
  it.each([
    [true, 'unknown', 2, true],
    [true, 'unknown', 5, true],
    [true, 'unknown', 1, false],
    [true, 'unknown', 0, false],
    [false, 'unknown', 5, false],
    [true, 'accepted', 5, false],
    [true, 'rejected', 5, false],
  ] as const)('available %s, consent %s, navigations %i -> %s', (available, consent, navigationCount, expected) => {
    expect(shouldAskForAnalyticsConsent({ available, consent, navigationCount })).toBe(expected);
  });

  it('gives Accept and Reject the same weight', () => {
    const source = read('src/app/app.component.ts');
    const actions = source.slice(
      source.indexOf('analytics-consent-banner__actions'),
      source.indexOf('</section>', source.indexOf('analytics-consent-banner__actions')),
    );
    const styles = [...actions.matchAll(/<ion-button\s+fill="(\w+)"\s+color="(\w+)"/gu)].map((match) => `${match[1]}/${match[2]}`);

    expect(styles).toHaveLength(2);
    expect(new Set(styles).size).toBe(1);
  });

  it('says declining changes nothing, in English and Greek', () => {
    const english = JSON.parse(read('public/i18n/en.json')).analyticsConsent.banner.copy;
    const greek = JSON.parse(read('public/i18n/el.json')).analyticsConsent.banner.copy;

    expect(english).toContain('declining changes nothing in the app');
    expect(greek).toContain('η απόρριψη δεν αλλάζει τίποτα στην εφαρμογή');
  });
});

describe('where analytics cannot run', () => {
  it('the Cookie page reports it and offers no choice', () => {
    const page = new CookiePolicyPage({
      consent: signal<'accepted' | 'rejected' | 'unknown'>('unknown'),
      available: false,
      accept: vi.fn(),
      reject: vi.fn(),
    } as never);

    expect(page.analyticsConsentStatusKey()).toBe('consent.status.unavailable');
    expect(read('src/app/pages/cookie-policy/cookie-policy.page.html')).toMatch(
      /@if \(analyticsAvailable\) \{\s*<div class="policy-actions">/u,
    );
  });

  it('Settings reports it and offers no choice', () => {
    expect(read('src/app/pages/settings/settings.page.ts')).toContain(
      "`analytics.status.${this.analyticsAvailable ? this.analyticsConsent() : 'unavailable'}`",
    );
    expect(read('src/app/pages/settings/settings.page.html')).toMatch(
      /@if \(analyticsAvailable\) \{\s*<div class="transfer-actions">/u,
    );
  });

  it.each(['en', 'el'])('both pages name the state in %s', (locale) => {
    const settings = JSON.parse(read(`public/i18n/settings/${locale}.json`));
    const cookies = JSON.parse(read(`public/i18n/cookie-policy/${locale}.json`));

    expect(settings.analytics.status.unavailable).toBeTruthy();
    expect(cookies.consent.status.unavailable).toBeTruthy();
  });
});

function createDocument(): Document {
  return new JSDOM('<!doctype html><html><head><title>OPTC</title></head><body></body></html>', {
    url: 'https://example.com/tabs/characters',
  }).window.document;
}
