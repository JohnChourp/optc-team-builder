# Browser Regression Coverage

The Playwright suite has two layers:

- `smoke.spec.ts` checks route render, navigation, and cross-browser console stability.
- `regression-flows.spec.ts` covers high-value user journeys that have crossed feature boundaries: guided Auto Team Builder, compare sources, saved-team transfer, share links/codes, and invalid payload handling.

Regression tests seed only browser-local Capacitor Preferences keys:

- `CapacitorStorage.appLanguage`
- `CapacitorStorage.analyticsConsent`
- `CapacitorStorage.savedTeams`

Keep new scenarios deterministic. Prefer stable seeded teams and `data-testid` hooks over incidental Ionic popover structure, visual pixels, network timing, or generated class names. Failure traces, screenshots, videos, the HTML report, and `test-results/` are uploaded by CI for debugging.

CI already runs each browser project with one worker through `playwright.config.ts`.
The default E2E wrapper isolates the Chromium guided-build worker scenario in a
second Playwright run with separate report/output directories. When developers
pass flags or file filters through npm, the wrapper delegates directly to
Playwright so filtered and debug workflows behave like direct Playwright usage.
