import { beforeEach, vi } from 'vitest';

import { App as capacitorApp } from './test-mocks/capacitor-app';
import { socialLogin } from './test-mocks/social-login';

vi.mock('@capgo/capacitor-social-login', () => ({
  SocialLogin: socialLogin,
}));

// Mock `@capacitor/app` ONCE for the whole suite so every spec file and the
// services under test share a single `App` object (see ./test-mocks/capacitor-app).
vi.mock('@capacitor/app', () => ({
  App: capacitorApp,
}));

// Re-arm the shared `@capacitor/app` mock to known defaults before every test so
// a prior test's `mockResolvedValue`/`restoreAllMocks` can't leak into the next
// one. Specs that need a specific version (e.g. native-update.service.spec)
// override `App.getInfo` in their own setup, which runs after this hook.
beforeEach(() => {
  capacitorApp.getInfo.mockReset();
  capacitorApp.getInfo.mockResolvedValue({ version: '1.0.0' });
  capacitorApp.addListener.mockReset();
  capacitorApp.addListener.mockResolvedValue({ remove: vi.fn() });
});
