import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

/**
 * Thin Angular wrapper around `@capacitor/preferences` so consumers (services that persist
 * user/app state to local storage) can be tested via TestBed-provided mocks instead of
 * module-level `vi.mock()` calls.
 *
 * Why this exists: under the Angular esbuild test runner, `vi.mock('@capacitor/preferences')`
 * is unreliable when the spec is batched with others — the Capacitor runtime registry resolves
 * plugins through its own path that bypasses the per-spec mock, falling back to PreferencesWeb
 * with a stripped `localStorage`. Injecting an adapter sidesteps that entirely: tests provide
 * their own implementation of this class via Angular DI and the underlying `@capacitor/preferences`
 * import is only loaded once, by this file.
 *
 * API mirrors what we actually use from the Capacitor Preferences API (get + set). Add more
 * methods (remove, clear, keys, migrate) here if a consumer needs them.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesAdapterService {
  public async get(options: { key: string }): Promise<{ value: string | null }> {
    return Preferences.get(options);
  }

  public async set(options: { key: string; value: string }): Promise<void> {
    await Preferences.set(options);
  }
}
