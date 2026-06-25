# Browser Regression Coverage

The Playwright suite has two layers:

- `smoke.spec.ts` checks route render, navigation, and cross-browser console stability.
- `regression-flows.spec.ts` covers high-value user journeys that have crossed feature boundaries: guided Auto Team Builder, compare sources, saved-team transfer, share links/codes, and invalid payload handling.

Regression tests seed only browser-local Capacitor Preferences keys:

- `CapacitorStorage.appLanguage`
- `CapacitorStorage.analyticsConsent`
- `CapacitorStorage.savedTeams`

Keep new scenarios deterministic. Prefer stable seeded teams and `data-testid` hooks over incidental Ionic popover structure, visual pixels, network timing, or generated class names. Failure traces, screenshots, videos, the HTML report, and `test-results/` are uploaded by CI for debugging.

The guided Auto Team Builder worker test is tagged `@serial-guided` and is run by
the E2E scripts as an isolated Chromium pass. Keep worker-heavy guided scenarios
behind that tag so the rest of the browser matrix can stay parallel locally.
