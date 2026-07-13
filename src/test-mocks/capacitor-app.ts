import { vi } from 'vitest';

// One shared `@capacitor/app` mock, installed globally in `test-setup.ts`.
//
// The Angular unit-test builder (`@angular/build:unit-test`) shares a single
// module registry across spec files, so `NativeUpdateService` and `AppComponent`
// bind their `import { App } from '@capacitor/app'` to whichever spec's mock
// loads the service module first. When each spec declared its own `vi.mock`
// factory, that produced a DIFFERENT `App` object per file: a per-test
// `App.getInfo.mockResolvedValue(...)` in native-update.service.spec then mutated
// a different `App` than the service actually read, so `current` fell back to a
// sibling's default version and `check()` reported no update — a flaky,
// order-dependent failure (see #161).
//
// Exposing ONE singleton here and mocking the module once in the shared setup
// makes every file and the services under test share the same `App`, so per-test
// configuration is authoritative regardless of file order.
export const App = {
  getInfo: vi.fn().mockResolvedValue({ version: '1.0.0' }),
  addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
};
