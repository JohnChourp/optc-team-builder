# AGENTS.md

## Build Verification

- For any change that touches Ionic, Angular, app pages, components, services used by the app, templates, styles, routes, or app-facing TypeScript logic, always run a real app build before closing the task.
- Default verification for this repo is `npx ionic build`.
- If a failure references the Angular target directly, also run `ng run optc-team-builder:build` to confirm the same path is green.
- Do not treat tests or lint as a substitute for build verification when app code changed.
- If build verification cannot be run, state that explicitly in the final response.
