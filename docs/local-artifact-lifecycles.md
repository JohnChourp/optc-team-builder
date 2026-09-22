# The local directories: what makes them, when they are stale, and whether you may reason from one

**869f13gc8.** Three large directories exist on every developer machine and, until this file, none
of them said how old it was or what produced it.

| Directory | Produced by | Stale when | May you reason from it? | Cleaned by |
| --- | --- | --- | --- | --- |
| `dist/` | `npm run build:ionic` / `build:pages` | **any source file is newer than `dist/optc-team-builder/browser/index.html`**, or a generation step was skipped | **Only after checking.** See below | `rm -rf dist` |
| `node_modules/` | `npm install` | `package-lock.json` is newer | not a source of truth about anything | `rm -rf node_modules && npm install` |
| `live-artifacts/` (brain) | live verification runs | never - it is dated evidence | yes, as **dated** evidence | `plan-artifact-retention.mjs` |

## `dist/` is the one that bites

It is the obvious place to look when answering *"what does the app actually serve?"*. It is present
on every machine. And it answers **silently and wrongly** when it is stale.

That is not hypothetical. On 2026-09-12, reading `dist/` for the sitemap gave **7 URLs**; the live
sitemap has **4,637**. The seven-URL file was a checked-in seed that looked authoritative, copied
verbatim into a build where `npm run seo:pages` had never run. Every conclusion drawn from that
directory would have been wrong, confidently.

**That seed no longer exists** - measured 2026-09-22, there is no tracked `sitemap*.xml` anywhere
in the repository, so the sitemap is generated or it is absent. The trap it created is what
survives: a `dist/` can still be newer than every source file and still be missing a generation
step's output entirely.

Measured again on 2026-09-22: **0 source files were newer than the built `index.html`**, so the
symptom was not present that day. **That is exactly why this is a record and not only a fix:** the
trap is intermittent, and an intermittent trap that nobody wrote down is one everybody meets once.

### Before reading anything out of `dist/`

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
find src -newer dist/optc-team-builder/browser/index.html -type f | wc -l
```

**Non-zero means do not trust it.** And even zero does not tell you which generation steps ran -
`seo:pages` is the one that has actually caused this, and its absence leaves a `dist/` that is
newer than every source file and still wrong about the sitemap.

**The general rule: `dist/` answers questions about a build, never about the product.** For what
the app serves, read the source, or the live site.

## `live-artifacts/` is different, and stays different

It is gitignored and local by design, it holds screenshots and logs that are **dated evidence**,
and `plan-artifact-retention.mjs` already classifies it as durable, archival or disposable. Nothing
here changes that. It is in this table so that the three directories can be compared, which is what
made the difference visible: two of them are **caches that pretend to be records**, and one is a
record.
