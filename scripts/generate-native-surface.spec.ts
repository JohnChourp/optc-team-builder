import { describe, expect, it } from 'vitest';

import {
  checkNativeSurface,
  parseAndroidIdentity,
  parseCapacitorConfig,
  parseManifestBehaviour,
  parseSdkVersions,
} from './lib/native-surface.mjs';
import { buildNativeSurface } from './generate-native-surface.mjs';

/*
 * 869f13d80. Five files held one surface and nothing summarised it. These tests pin the
 * parsing (so the record keeps being DERIVED) and the claims (so it keeps being checked).
 */
describe('native surface - parsed from the real files', () => {
  it('reads the app identity and the plugin providers out of capacitor.config.ts', () => {
    const parsed = parseCapacitorConfig(`
const config: CapacitorConfig = {
  appId: "com.example.app",
  appName: "Example",
  webDir: "dist/x/browser",
  plugins: {
    SocialLogin: {
      logLevel: 1,
      providers: {
        apple: false,
        google: true,
      },
    },
  },
};
`);

    expect(parsed.appId).toBe('com.example.app');
    expect(parsed.webDir).toBe('dist/x/browser');
    expect(parsed.plugins).toEqual([
      { name: 'SocialLogin', providers: [{ provider: 'apple', enabled: false }, { provider: 'google', enabled: true }] },
    ]);
  });

  it('keeps the disabled providers, because "explicitly off" is the fact worth recording', () => {
    // Three of the four SocialLogin providers are off ON PURPOSE. A record that listed
    // only the enabled one would read as though the others were never considered.
    const surface = buildNativeSurface();
    const social = surface.capacitor.plugins.find((p) => p.name === 'SocialLogin');

    expect(social?.providers.map((p) => p.provider).sort()).toEqual(['apple', 'facebook', 'google', 'twitter']);
    expect(social?.providers.filter((p) => p.enabled).map((p) => p.provider)).toEqual(['google']);
  });

  it('reads the Android identity and the SDK versions from their own files', () => {
    expect(parseAndroidIdentity('namespace = "a.b.c"\n applicationId "a.b.c"')).toMatchObject({
      namespace: 'a.b.c',
      applicationId: 'a.b.c',
    });
    expect(parseSdkVersions('minSdkVersion = 24\ntargetSdkVersion = 36\ncompileSdkVersion = 36')).toEqual({
      minSdk: 24,
      targetSdk: 36,
      compileSdk: 36,
    });
  });

  it('records the manifest behaviour without re-deriving the permission names', () => {
    // The names belong to check-support-claims.mjs. Two readers of one file is a second
    // thing to drift, which is exactly what this record exists to stop.
    const behaviour = parseManifestBehaviour(
      '<activity android:configChanges="orientation|screenSize" android:launchMode="singleTask" />' +
        '<uses-permission android:name="android.permission.INTERNET" />',
    );

    expect(behaviour.configChanges).toEqual(['orientation', 'screenSize']);
    expect(behaviour.launchMode).toBe('singleTask');
    expect(behaviour.resizeableActivityDeclared).toBe(false);
    expect(behaviour.permissionCount).toBe(1);
  });

  it('passes its own check on the real tree', () => {
    expect(checkNativeSurface(buildNativeSurface())).toEqual([]);
  });
});

describe('native surface - the guard', () => {
  const real = buildNativeSurface();
  const withAndroid = (patch: Record<string, unknown>) => ({ ...real, android: { ...real.android, ...patch } });

  it('catches an appId that stops matching the Android applicationId', () => {
    // Which ships an app that cannot update itself.
    const surface = withAndroid({ applicationId: 'com.someone.else' });

    expect(checkNativeSurface(surface)).toEqual([
      expect.stringContaining('A mismatch ships an app that cannot update itself'),
    ]);
  });

  it('catches a plugin whose providers are all off', () => {
    const surface = {
      ...real,
      capacitor: { ...real.capacitor, plugins: [{ name: 'SocialLogin', providers: [{ provider: 'google', enabled: false }] }] },
    };

    expect(checkNativeSurface(surface)).toEqual([
      expect.stringContaining('has every provider disabled'),
    ]);
  });

  it('catches the loss of a configChanges entry split screen depends on', () => {
    // Measured in 869f13d9z: without these the activity is recreated on a resize and a
    // restored session loses its place.
    const surface = withAndroid({ configChanges: real.android.configChanges.filter((c: string) => c !== 'screenSize') });
    const problems = checkNativeSurface(surface);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('screenSize');
    expect(problems[0]).toContain('869f13d9z');
  });

  it('catches a minSdk drop that would make the split-screen claim untrue', () => {
    // Below 24, an undeclared resizeableActivity stops defaulting to true.
    expect(checkNativeSurface(withAndroid({ minSdk: 21 }))).toEqual([
      expect.stringContaining('no longer defaults to true'),
    ]);
  });

  it('catches a change of distribution channel, which moves two decisions', () => {
    const surface = { ...real, distribution: { ...real.distribution, channel: 'google-play' } };

    expect(checkNativeSurface(surface)).toEqual([
      expect.stringContaining('removes REQUEST_INSTALL_PACKAGES and the self-updater'),
    ]);
  });
});
