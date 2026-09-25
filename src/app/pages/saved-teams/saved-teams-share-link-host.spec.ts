import { Capacitor } from '@capacitor/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { APP_SITE_BASE_URL } from '../../core/data/app-site-url.data';
import { type SavedTeam } from '../../core/models/optc.models';
import { buildSavedTeamShareUrl } from './saved-teams-export.utils';
import { parseSavedTeamShareInput } from './saved-teams-transfer.utils';

/*
 * 869f63gqg. In the Android app the WebView's origin is `https://localhost`, and Saved Teams
 * -> Copy share link built the link from it: the friend who tapped it got a connection error.
 * Measured on the published APK, and re-run by `proof-android-share-origin.mjs`.
 */

const team: SavedTeam = {
  id: 'team-1',
  name: 'Blackbeard crew',
  notes: '',
  shipId: null,
  slots: [2964, 2964, 2963, null, null, null],
  createdAt: '2026-09-22T10:00:00.000Z',
  updatedAt: '2026-09-22T10:00:00.000Z',
};
const EXPORTED_AT = '2026-09-25T08:00:00.000Z';

/** The WebView's own origin in the APK, measured on the emulator. */
const APK_WEBVIEW_ORIGIN = 'https://localhost';
/** A preview or local server: anything but the published site. */
const PREVIEW_ORIGIN = 'http://localhost:4200';

/*
 * Every case says where it runs - the platform AND the page's origin - instead of inheriting
 * them. `ng test` reuses a worker process across spec files, and measured 2026-09-25, a file that
 * ran after `google-account.service.spec.ts` in the same process inherited its
 * `vi.stubGlobal('location', ...)` with origin https://optcteambuilder.com, so the web case's
 * control ("the origin is not the published site") failed on state it never set.
 */
function runOn(platform: 'native' | 'web', origin: string): void {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(platform === 'native');
  vi.stubGlobal('location', { origin });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the host a copied share link names', () => {
  it('is the published site in the Android app, never the phone itself', () => {
    runOn('native', APK_WEBVIEW_ORIGIN);

    const link = new URL(buildSavedTeamShareUrl(team, undefined, EXPORTED_AT));

    // The page's own origin is https://localhost there, exactly as in the APK, and is ignored.
    expect(globalThis.location.origin).toBe(APK_WEBVIEW_ORIGIN);
    expect(link.origin).toBe('https://optcteambuilder.com');
    expect(link.hostname).not.toBe('localhost');
    expect(link.pathname).toBe('/tabs/manual-team-builder');
  });

  it('is the site the reader is on, on the web, so previews and local servers keep working', () => {
    runOn('web', PREVIEW_ORIGIN);

    const link = new URL(buildSavedTeamShareUrl(team, undefined, EXPORTED_AT));

    // The control: the page's origin is NOT the published site, so this proves the web path
    // reads it rather than happening to agree with the constant.
    expect(globalThis.location.origin).not.toBe(APP_SITE_BASE_URL);
    expect(link.origin).toBe(PREVIEW_ORIGIN);
  });

  it('still carries the whole team, whichever host it names', () => {
    for (const native of [true, false]) {
      runOn(native ? 'native' : 'web', native ? APK_WEBVIEW_ORIGIN : PREVIEW_ORIGIN);

      const shared = parseSavedTeamShareInput(buildSavedTeamShareUrl(team, undefined, EXPORTED_AT));

      expect(shared.team, native ? 'native' : 'web').toEqual(team);
      expect(shared.exportedAt).toBe(EXPORTED_AT);
    }
  });

  it('keeps an explicit origin, which the browser tests pass for their own server', () => {
    runOn('native', APK_WEBVIEW_ORIGIN);

    expect(new URL(buildSavedTeamShareUrl(team, 'http://127.0.0.1:4200', EXPORTED_AT)).origin).toBe(
      'http://127.0.0.1:4200',
    );
  });

  it('reads the site address from the one constant AppComponent builds canonical links from', () => {
    const shell = readFileSync(resolve(process.cwd(), 'src/app/app.component.ts'), 'utf8');

    expect(APP_SITE_BASE_URL).toBe('https://optcteambuilder.com');
    expect(shell).toContain("import { APP_SITE_BASE_URL } from './core/data/app-site-url.data';");
    // Any quote opening the address is a second copy of it, whatever follows the host.
    expect(shell).not.toMatch(/['"`]https:\/\/optcteambuilder\.com/u);
  });
});
