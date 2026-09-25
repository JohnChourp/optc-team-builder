import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { checkNativeSurface } from './lib/native-surface.mjs';
import {
  callsFunction,
  checkWebViewCapabilities,
  dynamicImports,
  fileProviderServesCache,
  parseAndroidStyle,
  parseIonicBackground,
  parseServerConfig,
  readBridgeTheme,
  readCapacitorDefaults,
  resolveColor,
  returnsOnNative,
  startsAtBoot,
  stripCStyleComments,
} from './lib/webview-capabilities.mjs';
import { buildNativeSurface } from './generate-native-surface.mjs';

/*
 * 869f63gu1. The native surface said Android was "proven to work by hand" and named none of the
 * ways the APK differs from the website - 0 mentions of download, share, back button, SystemBars,
 * WebView or the client id. These tests keep each difference DERIVED from the code that decides
 * it, and keep the record from describing a regression as fine.
 */

type Capability = { id: string; derived: Record<string, unknown> };

const real = buildNativeSurface();
const capability = (id: string) => (real.webViewCapabilities as Capability[]).find((entry) => entry.id === id)!;
const CAPACITOR_JAVA = 'node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor';

describe('native surface - how the APK differs, read from the code', () => {
  it('records six capabilities, each with words, facts and dated evidence', () => {
    expect((real.webViewCapabilities as Capability[]).map((entry) => entry.id)).toEqual([
      'downloads',
      'web-share',
      'clipboard',
      'back-button',
      'system-bars',
      'google-sign-in',
    ]);

    for (const entry of real.webViewCapabilities as Record<string, unknown>[]) {
      expect(entry['webView'], String(entry['id'])).toEqual(expect.any(String));
      expect(entry['app'], String(entry['id'])).toEqual(expect.any(String));
      expect(entry['evidence'], String(entry['id'])).toMatch(/\b2026-\d{2}-\d{2}\b/u);
    }
  });

  it('names every difference the record used to have zero mentions of', () => {
    const text = JSON.stringify(real);

    for (const term of [/download/iu, /share/iu, /back[ -]?button/iu, /SystemBars/u, /WebView/u, /client id/iu]) {
      expect(text, String(term)).toMatch(term);
    }
  });

  it('derives the facts the real tree holds today', () => {
    expect(capability('downloads').derived).toEqual({
      mainActivityRead: true,
      capacitorBridgeRead: true,
      downloadListenerRegistered: false,
      helperBranchesOnNativePlatform: true,
      helperNativeImports: ['@capacitor/filesystem', '@capacitor/share'],
      exportSitesCallingHelper: expect.any(Number),
      dependencies: { '@capacitor/filesystem': true, '@capacitor/share': true },
      fileProviderServesCache: true,
    });
    expect(capability('web-share').derived).toMatchObject({ webViewOrigin: 'https://localhost', nativeShareLinksNameTheSite: true });
    expect(capability('clipboard').derived).toEqual({
      secureContext: true,
      helperUsesClipboardApi: true,
      clipboardPluginInstalled: false,
    });
    expect(capability('back-button').derived).toEqual({
      appPluginInstalled: true,
      listensForIonBackButton: true,
      androidOnly: true,
      minimizesApp: true,
      startedAtBoot: true,
    });
    expect(capability('system-bars').derived).toMatchObject({ style: 'DARK', matchesIonicBackground: true });
    expect(capability('google-sign-in').derived).toEqual({
      apkSuppliesWebClientId: false,
      websiteSuppliesWebClientId: true,
      gateSpecs: 3,
    });
  });

  it('counts the same export sites the sites spec names', () => {
    // The sites spec owns the names; this record carries only the count, so the two must agree.
    const owner = readFileSync('src/app/core/services/player-file-delivery.sites.spec.ts', 'utf8');
    const list = owner.slice(owner.indexOf('const EXPORT_SITES = ['), owner.indexOf('] as const;'));

    expect(list.length, 'the list slice must exist').toBeGreaterThan(100);
    expect(capability('downloads').derived['exportSitesCallingHelper']).toBe([...list.matchAll(/'src\/app\/[^']+\.ts'/gu)].length);
  });
});

describe('native surface - code is read as syntax, not words', () => {
  it('counts a call, not a comment, a string or an import of the same name', () => {
    expect(callsFunction('void givePlayerFile({ filename });', 'a.ts', 'givePlayerFile')).toBe(true);
    expect(callsFunction('// void givePlayerFile({ filename });', 'a.ts', 'givePlayerFile')).toBe(false);
    expect(callsFunction("const note = 'givePlayerFile(x)';", 'a.ts', 'givePlayerFile')).toBe(false);
    expect(callsFunction("import { givePlayerFile } from './x';", 'a.ts', 'givePlayerFile')).toBe(false);
  });

  it('sees a service started at boot, and not one commented out or another service', () => {
    const started = 'export const c = { providers: [provideAppInitializer(() => inject(AndroidBackButtonService).init())] };';

    expect(startsAtBoot(started, 'c.ts', 'AndroidBackButtonService')).toBe(true);
    expect(startsAtBoot(`// ${started}`, 'c.ts', 'AndroidBackButtonService')).toBe(false);
    expect(startsAtBoot(started.replace('AndroidBackButtonService', 'OtherService'), 'c.ts', 'AndroidBackButtonService')).toBe(false);
    expect(startsAtBoot('inject(AndroidBackButtonService).init();', 'c.ts', 'AndroidBackButtonService')).toBe(false);
  });

  it('sees a share link that names the site on native, and not one that names the origin', () => {
    expect(returnsOnNative('function f() { if (Capacitor.isNativePlatform()) { return APP_SITE_BASE_URL; } return o; }', 'f.ts', 'APP_SITE_BASE_URL')).toBe(true);
    expect(returnsOnNative('function f() { if (Capacitor.isNativePlatform()) { return o; } return APP_SITE_BASE_URL; }', 'f.ts', 'APP_SITE_BASE_URL')).toBe(false);
    expect(returnsOnNative('function f() { /* if (Capacitor.isNativePlatform()) return APP_SITE_BASE_URL; */ return o; }', 'f.ts', 'APP_SITE_BASE_URL')).toBe(false);
  });

  it('reads dynamic imports, and strips Java comments without touching strings', () => {
    expect(dynamicImports("await import('@capacitor/share'); // import('@capacitor/ghost')", 'h.ts')).toEqual(['@capacitor/share']);
    expect(stripCStyleComments('a(); // webView.setDownloadListener(x);\nb();')).not.toContain('setDownloadListener');
    expect(stripCStyleComments('/* setDownloadListener( */ c();')).not.toContain('setDownloadListener');
    expect(stripCStyleComments('String s = "http://localhost"; d();')).toContain('"http://localhost"');
  });
});

describe('native surface - the WebView origin and the theme, from Capacitor and Android', () => {
  it("takes the origin from Capacitor's own defaults when the config sets none", () => {
    expect(parseServerConfig(readFileSync('capacitor.config.ts', 'utf8'))).toEqual({ androidScheme: null, hostname: null });
    expect(
      readCapacitorDefaults(readFileSync(`${CAPACITOR_JAVA}/CapConfig.java`, 'utf8'), readFileSync(`${CAPACITOR_JAVA}/Bridge.java`, 'utf8')),
    ).toEqual({ androidScheme: 'https', hostname: 'localhost' });
    expect(parseServerConfig('const c = {\n  server: {\n    androidScheme: "http",\n  },\n};')).toEqual({
      androidScheme: 'http',
      hostname: null,
    });
  });

  it('follows the theme Capacitor switches to after the splash down to its colour', () => {
    const theme = readBridgeTheme(readFileSync(`${CAPACITOR_JAVA}/BridgeActivity.java`, 'utf8'));
    const style = parseAndroidStyle(readFileSync('android/app/src/main/res/values/styles.xml', 'utf8'), theme!);

    expect(theme).toBe('AppTheme_NoActionBar');
    expect(style).toEqual({
      name: 'AppTheme.NoActionBar',
      parent: 'Theme.AppCompat.DayNight.NoActionBar',
      windowBackground: '@color/app_background',
    });
    expect(resolveColor(readFileSync('android/app/src/main/res/values/colors.xml', 'utf8'), style!.windowBackground)?.toLowerCase()).toBe(
      parseIonicBackground(readFileSync('src/theme/variables.scss', 'utf8')),
    );
  });

  it('knows a FileProvider that serves the cache from one that does not', () => {
    const manifest =
      '<provider android:name="androidx.core.content.FileProvider"><meta-data android:resource="@xml/paths"></meta-data></provider>';

    expect(fileProviderServesCache(manifest, () => '<paths><cache-path name="c" path="." /></paths>')).toBe(true);
    expect(fileProviderServesCache(manifest, () => '<paths><external-path name="e" path="." /></paths>')).toBe(false);
    expect(fileProviderServesCache(manifest, () => '<paths><!-- <cache-path name="c" path="." /> --></paths>')).toBe(false);
  });
});

describe('native surface - the guard refuses words its facts no longer support', () => {
  const withFacts = (id: string, patch: Record<string, unknown>) =>
    (real.webViewCapabilities as Capability[]).map((entry) =>
      entry.id === id ? { ...entry, derived: { ...entry.derived, ...patch } } : entry,
    );

  it('passes on the real tree', () => {
    expect(checkWebViewCapabilities(real.webViewCapabilities)).toEqual([]);
    expect(checkNativeSurface(real)).toEqual([]);
  });

  it.each([
    ['system-bars', { style: null }, 'not DARK'],
    ['system-bars', { windowBackgroundColor: '#FFFFFF', matchesIonicBackground: false }, 'no longer match the app'],
    ['back-button', { startedAtBoot: false }, 'nothing starts the service'],
    ['downloads', { helperBranchesOnNativePlatform: false }, 'anchor download again'],
    ['downloads', { dependencies: { '@capacitor/filesystem': true, '@capacitor/share': false } }, '@capacitor/share'],
    ['downloads', { fileProviderServesCache: false }, 'cannot read the file'],
    ['downloads', { downloadListenerRegistered: true }, 'Re-verify an export'],
    ['downloads', { capacitorBridgeRead: false }, 'would be true of nothing'],
    ['web-share', { nativeShareLinksNameTheSite: false }, 'opens nothing'],
    ['clipboard', { secureContext: false }, 'not a secure context'],
    ['google-sign-in', { apkSuppliesWebClientId: true }, 'Prove sign-in on the emulator'],
  ])('%s: refuses %j', (id, patch, expected) => {
    const problems = checkWebViewCapabilities(withFacts(id, patch));

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(expected);
  });

  it('refuses a record that has lost a capability', () => {
    const problems = checkWebViewCapabilities((real.webViewCapabilities as Capability[]).filter((entry) => entry.id !== 'clipboard'));

    expect(problems).toEqual(expect.arrayContaining([expect.stringContaining('no "clipboard" WebView capability')]));
  });
});

describe('native surface - what was proven on Android, and when', () => {
  it('no longer says "proven to work by hand", and dates every proof', () => {
    const verification = real.androidVerification as {
      how: string;
      proven: { date: string; build: string; evidence: string }[];
      notYetProven: string;
    };

    expect(real.platforms.android).not.toContain('proven to work by hand');
    expect(real.platforms.android).toContain('androidVerification');
    expect(verification.how).toContain('emulator');
    expect(verification.proven.length).toBeGreaterThan(0);

    for (const proof of verification.proven) {
      expect(proof.date).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      expect(proof.evidence).toMatch(/^optc-team-builder-brain\//u);
    }

    // What has NOT been proven is said as plainly as what has.
    expect(verification.notYetProven).toMatch(/published APK/u);
    expect(verification.notYetProven).toContain('emulator');
  });
});
