import { afterEach, beforeEach, vi } from 'vitest';

import { resetFormattingLanguageForTests } from './app/core/i18n/app-locale-format';
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

/*
 * Reset the module-level formatting locale after every test.
 *
 * 869f13gam. `app-locale-format.ts` keeps the chosen language in a module-level
 * `let`, deliberately - the call sites are presenters and `*.utils.ts` files with no
 * injector. `AppI18nService.setLanguage` is the production writer; specs write it
 * directly or by constructing that service.
 *
 * THE PART THAT SURPRISES PEOPLE: `ng test` runs Vitest with `isolate: false` - the
 * Angular builder's own default, "to align with the Karma/Jasmine experience" - and
 * a worker process is REUSED across test files. So a file that leaves this state set
 * hands it to every later file scheduled into the same process. Measured 2026-09-22:
 * with 61 files over 13 processes, all 4 files that ran after the writer in its
 * process inherited `el`.
 *
 * That is what made `character-detail.presenter.spec.ts` fail once in four full
 * runs: it formats `5122` through `toLocaleString(formattingLanguage())`, which is
 * `5,122` in `en` and `5.122` in `el`, and the test pins the English form. Isolation
 * in isolation passed; the suite did not.
 *
 * A per-file `afterEach` fixes one instance. This fixes the class, because "any spec
 * that touches the language must know the workers are shared" is exactly the kind of
 * knowledge that does not survive being written down somewhere else. Same reasoning
 * as the `@capacitor/app` re-arm above.
 */
afterEach(() => {
  resetFormattingLanguageForTests();
});
