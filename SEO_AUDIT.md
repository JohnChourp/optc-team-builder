# SEO Audit

Date: 2026-04-26

## Files Inspected

- `package.json`
- `angular.json`
- `ionic.config.json`
- `src/index.html`
- `src/app/app.routes.ts`
- `src/app/app.config.ts`
- `src/app/app.component.ts`
- `src/app/layout/tabs.page.ts`
- `src/app/layout/tabs.page.html`
- `src/app/pages/characters/characters.page.html`
- `src/app/pages/team-builder/team-builder.page.html`
- `src/app/pages/auto-team-builder/auto-team-builder.page.html`
- `src/app/pages/crew-forge/crew-forge.page.html`
- `scripts/generate-seo-pages.mjs`
- `scripts/write-app-config.mjs`
- `public/robots.txt`
- `public/sitemap.xml`
- `public/404.html`
- `.github/workflows/deploy-pages.yml`
- `.github/workflows/release-android.yml`
- `../DokkanTeamBuilder/index.html`
- `../DokkanTeamBuilder/sitemap.xml`
- `../DokkanTeamBuilder/sitemap.html`

## Files Changed

- `scripts/generate-seo-pages.mjs`
- `public/sitemap.xml`
- `src/app/app.routes.ts`
- `src/app/app.component.ts`
- `src/app/app.component.spec.ts`
- `src/app/app.routes.spec.ts`
- `src/app/pages/team-builder/team-builder.page.html`
- `src/app/pages/team-builder/team-builder.page.scss`
- `public/i18n/characters/en.json`
- `public/i18n/team-builder/en.json`
- `public/i18n/auto-team-builder/en.json`
- `SEO_AUDIT.md`

## Existing SEO Features Found

- Angular/Ionic standalone app with Angular routes.
- `build:pages` runs `config:app:web-strict`, production build with `--base-href /`, then `seo:pages`.
- `seo:pages` runs `scripts/generate-seo-pages.mjs`.
- `src/index.html` already had base SEO metadata, canonical, Open Graph, Twitter card tags, JSON-LD, and GitHub Pages route restore logic.
- `scripts/generate-seo-pages.mjs` already generated public static pages, character detail pages from `public/assets/data/optc-seed.sql`, and `sitemap.xml`.
- `public/robots.txt` already existed with a sitemap reference.
- `public/404.html` already existed with a safe GitHub Pages redirect fallback and `noindex`.
- GitHub Pages workflows exist and run `npm run build:pages`.

## SEO Improvements Applied

- Added route `data.seo` for indexable public Angular routes.
- Added Angular `Title` and `Meta` updates in `AppComponent` for document title, description, canonical, OG title/description/url, Twitter title/description, and robots.
- Set private/tool routes without SEO data to runtime `noindex,follow` instead of leaving stale public metadata after client-side navigation.
- Kept legal route canonical handling consistent: `/tabs/privacy`, `/tabs/cookies`, and `/tabs/terms` use canonical URLs at `/privacy/`, `/cookies/`, and `/terms/`.
- Made the SEO generator always write `robots.txt` into the final build output.
- Added generated `sitemap.html` with only the main public pages, not thousands of character pages.
- Updated the committed fallback `public/sitemap.xml` to the current major public canonical URLs. The build output sitemap is still generated after build and includes character pages.
- Improved short English visible copy for Characters, Team Builder, and Auto Team Builder.

## DokkanTeamBuilder Patterns Reused

- Simple indexable HTML page structure.
- Clear titles, descriptions, canonical URLs, and XML sitemap.
- Simple human-readable `sitemap.html` idea.
- Useful visible English content.

## DokkanTeamBuilder Patterns Intentionally Ignored

- `meta keywords`.
- Native HTML/CSS/JavaScript architecture.
- `Web.config`.
- Old analytics and cookie implementation.
- Large static HTML duplication.
- Unrelated legal pages and old deployment assumptions.

## Sitemap URLs Included

The generated `dist/optc-team-builder/browser/sitemap.xml` includes:

- `https://optcteambuilder.com/`
- `https://optcteambuilder.com/tabs/characters/`
- `https://optcteambuilder.com/tabs/team-builder/`
- `https://optcteambuilder.com/tabs/auto-team-builder/`
- `https://optcteambuilder.com/tabs/crew-forge/`
- `https://optcteambuilder.com/privacy/`
- `https://optcteambuilder.com/cookies/`
- `https://optcteambuilder.com/terms/`
- Generated `https://optcteambuilder.com/characters/:id/` pages.

The verified generated sitemap currently has 4,540 URLs: 8 public pages plus 4,532 character pages.

## Sitemap URLs Intentionally Excluded

- `/teams/`: route does not exist.
- Hash URLs: not canonical crawl targets.
- `/characters/:id/edit/`: edit pages are not SEO-useful.
- `/tabs/settings/`: settings are private/tool UI.
- `/tabs/saved-teams/`: user-local saved content.
- `/tabs/saved-enemies/`: user-local saved content.
- `/tabs/character-boxes/`: user-local tool page.
- `/tabs/privacy/`, `/tabs/cookies/`, `/tabs/terms/`: generated as routing aliases but excluded from sitemap because canonical URLs are `/privacy/`, `/cookies/`, and `/terms/`.

## Robots.txt Status

`public/robots.txt` exists and the generator now also writes the final build output:

```txt
User-agent: *
Allow: /

Sitemap: https://optcteambuilder.com/sitemap.xml
```

## 404.html Status

`public/404.html` already exists. It is a GitHub Pages navigation fallback with `noindex` and passes the original path through `__gh_path__`, `__gh_search__`, and `__gh_hash__` for `src/index.html` to restore.

Static generated route pages remain the SEO path. The 404 fallback is only for direct refresh/navigation recovery.

## GitHub Pages Limitations

- GitHub Pages serves unknown client routes through the 404 fallback, so unknown/private routes should not be treated as sitemap SEO pages.
- Static generated `/characters/:id/` pages are better SEO targets than relying on the 404 fallback.
- Canonical URLs must use the custom domain root path.

## Needs Manual Approval

- None. No SSR, prerender framework change, third-party SEO library, doorway pages, or broad architecture change was added.

## Build/Test Result

- `node -e "...JSON.parse(...)"`: passed for changed English i18n JSON files.
- `npx tsc --noEmit -p tsconfig.app.json`: passed.
- `npm run build:pages`: passed and generated the production GitHub Pages artifact.
- `npm run seo:pages`: passed after the final sitemap.html canonical fix.
- Generated sitemap verification: passed for required URLs and confirmed excluded routes were absent.
- `npx vitest run src/app/app.component.spec.ts src/app/app.routes.spec.ts`: passed, 14 tests.
- `npx tsc --noEmit -p tsconfig.spec.json`: failed on pre-existing unrelated spec typing issues in auto-team-builder, character fixture, saved-enemies, settings, and related tests. No failures pointed to the SEO files changed here.

## Manual Actions After Deploy

- Submit sitemap to Google Search Console: `https://optcteambuilder.com/sitemap.xml`
- Submit sitemap to Bing Webmaster Tools: `https://optcteambuilder.com/sitemap.xml`
- Inspect `https://optcteambuilder.com/`
- Inspect `https://optcteambuilder.com/tabs/characters/`
- Inspect one generated character page, for example `https://optcteambuilder.com/characters/1/`
- Request indexing after deployment.
- Verify canonical URLs after deployment.
- Test direct refresh on:
  - `/tabs/characters/`
  - `/tabs/team-builder/`
  - `/tabs/auto-team-builder/`
  - `/tabs/crew-forge/`
  - `/characters/1/`
