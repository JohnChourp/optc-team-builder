import { describe, expect, it } from 'vitest';

import { checkNativeSurface, parseCapacitorConfig } from './lib/native-surface.mjs';
import { buildNativeSurface } from './generate-native-surface.mjs';

/*
 * 869f6tcz0. The system bars followed the phone rather than the dark-only app, and the
 * fix is a plugin configured by a VALUE - `SystemBars: { style: "DARK" }` - where the
 * only plugin before it was configured by switching providers on. The record has to
 * carry that value, and its guard has to tell it apart from a plugin configured with
 * nothing at all.
 */
describe('native surface - a plugin configured by a value', () => {
  it('records the value as it is written, with no providers invented for it', () => {
    const parsed = parseCapacitorConfig(`
const config: CapacitorConfig = {
  appId: "com.example.app",
  plugins: {
    SocialLogin: {
      logLevel: 1,
      providers: {
        google: true,
      },
    },
    SystemBars: {
      style: "DARK",
    },
  },
};
`);

    expect(parsed.plugins).toEqual([
      // A number is not a setting, so SocialLogin's record is exactly what it was.
      { name: 'SocialLogin', providers: [{ provider: 'google', enabled: true }] },
      { name: 'SystemBars', providers: [], settings: { style: 'DARK' } },
    ]);
  });

  it('accepts a plugin with settings and still catches one configured with neither', () => {
    const real = buildNativeSurface();
    const withPlugins = (plugins: unknown[]) => ({ ...real, capacitor: { ...real.capacitor, plugins } });

    expect(checkNativeSurface(withPlugins([{ name: 'SystemBars', providers: [], settings: { style: 'DARK' } }]))).toEqual(
      [],
    );
    expect(checkNativeSurface(withPlugins([{ name: 'SystemBars', providers: [] }]))).toEqual([
      expect.stringContaining('no providers and no settings'),
    ]);
  });

  it('keeps the system bars dark in the real config, whatever mode the phone is in', () => {
    const systemBars = buildNativeSurface().capacitor.plugins.find((plugin) => plugin.name === 'SystemBars');

    expect(systemBars?.settings).toEqual({ style: 'DARK' });
  });
});
