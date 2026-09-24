import { vi } from 'vitest';

// One shared `@capacitor/filesystem` and `@capacitor/share` mock, installed globally in
// `test-setup.ts` for the same reason `capacitor-app.ts` is: `ng test` shares one module
// registry across spec files, so a per-file `vi.mock` would hand `givePlayerFile` whichever
// file's objects loaded first, and a per-test `mockRejectedValue` could configure an object
// the helper never reads.
//
// Only the native path reaches them, and only a spec that makes `Capacitor.isNativePlatform()`
// return true takes it - everywhere else an export is the browser download it always was.

export const CACHE_EXPORT_URI = 'file:///data/user/0/com.john.optcteambuilder/cache/export.json';

export const Filesystem = {
  writeFile: vi.fn().mockResolvedValue({ uri: CACHE_EXPORT_URI }),
};

/* The two enum members the app uses, with the plugin's own values. */
export const Directory = { Cache: 'CACHE' } as const;
export const Encoding = { UTF8: 'utf8' } as const;

export const Share = {
  share: vi.fn().mockResolvedValue({ activityType: '' }),
};
