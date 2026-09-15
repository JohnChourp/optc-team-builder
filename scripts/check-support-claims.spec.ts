import { describe, expect, it } from 'vitest';

import {
  checkSupportClaims,
  parseManifestPermissions,
  parsePlaywrightProjects,
  parseSupportedData,
} from './check-support-claims.mjs';

/**
 * 869f17h3g. Driven from a tree that passes, so each test changes exactly one
 * thing. A screen that promises a player "the app asks for two things" is only
 * as true as the check behind it.
 */

const MANIFEST = `<manifest>
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
</manifest>`;

const PLAYWRIGHT = `projects: [
  { name: 'chromium' },
  { name: 'firefox' },
  { name: 'webkit' },
]`;

const NGSW = { assetGroups: [{ name: 'app' }, { name: 'i18n' }, { name: 'data' }, { name: 'assets' }] };

const DATA = {
  DECLARED_ANDROID_PERMISSIONS: [
    'android.permission.INTERNET',
    'android.permission.REQUEST_INSTALL_PACKAGES',
  ],
  TESTED_BROWSER_ENGINES: ['chromium', 'firefox', 'webkit'],
  OFFLINE_ASSET_GROUPS: ['app', 'i18n', 'data', 'assets'],
  SUPPORTED_SECTIONS: [
    { id: 'permissions', rows: ['internet', 'installPackages', 'nothingElse'] },
  ],
};

function run(overrides = {}) {
  return checkSupportClaims({ manifest: MANIFEST, playwright: PLAYWRIGHT, ngsw: NGSW, data: DATA, ...overrides });
}

describe('support claims', () => {
  it('passes when the screen matches the configuration', () => {
    expect(run().errors).toEqual([]);
  });

  /* A. The defect this exists for: a permission added and never disclosed. */
  it('fails when the manifest gains a permission the screen does not mention', () => {
    const manifest = MANIFEST.replace(
      '</manifest>',
      '  <uses-permission android:name="android.permission.CAMERA" />\n</manifest>',
    );

    expect(run({ manifest }).errors.some((error) => error.includes('CAMERA'))).toBe(true);
  });

  it('fails when the screen claims a permission the manifest no longer declares', () => {
    const manifest = MANIFEST.replace(
      '  <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n',
      '',
    );

    expect(
      run({ manifest }).errors.some((error) => error.includes('no longer declares it')),
    ).toBe(true);
  });

  /* B. */
  it('fails when the permission rows do not account for every permission', () => {
    const data = {
      ...DATA,
      SUPPORTED_SECTIONS: [{ id: 'permissions', rows: ['internet', 'nothingElse'] }],
    };

    expect(run({ data }).errors.some((error) => error.includes('permission row(s)'))).toBe(true);
  });

  /* C. */
  it('fails when an engine the screen claims is no longer configured', () => {
    const playwright = PLAYWRIGHT.replace("  { name: 'webkit' },\n", '');

    expect(run({ playwright }).errors.some((error) => error.includes('webkit'))).toBe(true);
  });

  it('fails when a configured engine is not claimed, so config and copy cannot diverge', () => {
    const playwright = PLAYWRIGHT.replace(']', "  { name: 'chrome' },\n]");

    expect(
      run({ playwright }).errors.some((error) => error.includes('Either claim it')),
    ).toBe(true);
  });

  /* D. */
  it('fails when an offline asset group disappears', () => {
    const ngsw = { assetGroups: NGSW.assetGroups.filter((group) => group.name !== 'data') };

    expect(run({ ngsw }).errors.some((error) => error.includes("'data'"))).toBe(true);
  });

  describe('parsers', () => {
    it('reads permissions out of a real manifest shape', () => {
      expect(parseManifestPermissions(MANIFEST)).toEqual([
        'android.permission.INTERNET',
        'android.permission.REQUEST_INSTALL_PACKAGES',
      ]);
    });

    it('reads only the project names, not other `name:` keys above them', () => {
      const config = `use: { name: 'ignored' }\n${PLAYWRIGHT}`;

      expect(parsePlaywrightProjects(config)).toEqual(['chromium', 'firefox', 'webkit']);
    });

    it('reads the claims out of the data file source', () => {
      const source = `
export const SUPPORTED_SECTIONS = [
  { id: 'permissions', rows: ['internet', 'nothingElse'] },
];
export const DECLARED_ANDROID_PERMISSIONS = [
  'android.permission.INTERNET',
] as const;
export const TESTED_BROWSER_ENGINES = ['chromium'] as const;
export const OFFLINE_ASSET_GROUPS = ['app'] as const;
`;
      const parsed = parseSupportedData(source);

      expect(parsed.DECLARED_ANDROID_PERMISSIONS).toEqual(['android.permission.INTERNET']);
      expect(parsed.TESTED_BROWSER_ENGINES).toEqual(['chromium']);
      expect(parsed.SUPPORTED_SECTIONS).toEqual([
        { id: 'permissions', rows: ['internet', 'nothingElse'] },
      ]);
    });
  });
});
