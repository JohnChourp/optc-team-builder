#!/usr/bin/env node
/**
 * 869f13285. Proves the Content-Security-Policy in `src/index.html` against a real served build.
 *
 * The site is on GitHub Pages, which cannot set response headers, so the policy lives in a
 * `<meta http-equiv>` tag and this is the only place it can be verified before it reaches readers.
 * A CSP written from guesswork breaks the app in production, and production is not a test
 * environment - so the build is served locally, driven with Chromium, and every
 * `securitypolicyviolation` the page reports fails the run.
 *
 * Usage:
 *   node ./scripts/check-csp-policy.mjs              # build must already exist in dist/
 *   node ./scripts/check-csp-policy.mjs --build      # build first
 */
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_HTML = path.join(ROOT_DIR, 'src', 'index.html');
const DIST_DIR = path.join(ROOT_DIR, 'dist', 'optc-team-builder', 'browser');

/**
 * Directives the policy MUST declare. A policy that quietly loses one of these still passes a
 * browser run - the page simply falls back to `default-src`, or to nothing at all - so the set is
 * pinned here rather than inferred from whatever happens to be in the file.
 */
const REQUIRED_DIRECTIVES = [
  'default-src',
  'script-src',
  'style-src',
  'font-src',
  'img-src',
  'connect-src',
  'worker-src',
  'frame-src',
  'object-src',
  'base-uri',
  'form-action',
];

/**
 * Directives that cannot be expressed in a meta policy at all. Listing one would read as
 * protection the site does not have. `frame-ancestors`, `report-uri` and `sandbox` are ignored by
 * the HTML meta delivery method per CSP Level 3.
 */
const META_UNSUPPORTED_DIRECTIVES = ['frame-ancestors', 'report-uri', 'sandbox'];

/**
 * 869f13285. Origins that inject scripts into the LIVE site and appear nowhere in this repository.
 *
 * This list exists because the browser half of this check structurally cannot find them all. It
 * serves the build from a local HTTP server, so:
 *
 *   - Google Tag Manager tags DO load locally, which is how Microsoft Clarity was caught here;
 *   - Cloudflare Web Analytics does NOT, because it is injected by Cloudflare at the edge and
 *     there is no CDN in front of a local server. It was blocked in production by v0.4.43 and
 *     caught by the public-entry synthetics, not by this script.
 *
 * Asserting them from a list is what turns "we happened to remember" into a check. Removing an
 * entry here must be a deliberate act with the tag actually removed at its source.
 */
const REQUIRED_INJECTED_ORIGINS = [
  { directive: 'script-src', origin: 'https://www.googletagmanager.com', injectedBy: 'the site itself, in index.html' },
  { directive: 'script-src', origin: 'https://www.clarity.ms', injectedBy: 'the GTM container GTM-TBW6L4T' },
  { directive: 'script-src', origin: 'https://static.cloudflareinsights.com', injectedBy: 'Cloudflare at the edge - invisible to a local serve' },
  { directive: 'connect-src', origin: 'https://cloudflareinsights.com', injectedBy: 'Cloudflare Web Analytics beacon' },
];

/**
 * Which vendor each injected origin belongs to, and the term a reader would
 * recognise it by in the privacy copy.
 *
 * 869f135w2. The CSP list above proves a vendor is ALLOWED to load. It says
 * nothing about whether the reader was told. Measured 2026-09-16 across every
 * privacy and cookie namespace in `public/i18n`, both languages:
 *
 *   Google Analytics    18 mentions   disclosed
 *   Google Tag Manager   0 mentions   NOT disclosed
 *   Microsoft Clarity    0 mentions   NOT disclosed
 *   Cloudflare           0 mentions   NOT disclosed
 *
 * Three of the four measurement surfaces this app ships are named nowhere a
 * reader can see. That is an owner decision, not a typo - the honest options are
 * to disclose them or to remove them, and writing privacy copy for a vendor the
 * owner may prefer to drop would prejudge it.
 *
 * So the gap is DECLARED here rather than silently green, with a date. The check
 * fails on any origin that is neither disclosed nor on this list - which is the
 * part that was missing: a fifth vendor could have been added tomorrow and
 * nothing would have asked whether the privacy page mentions it.
 */
const VENDOR_DISCLOSURE = [
  { origin: 'https://www.google-analytics.com', term: 'Google Analytics', disclosed: true },
  {
    origin: 'https://www.googletagmanager.com',
    term: 'Google Tag Manager',
    disclosed: false,
    undisclosedSince: '2026-09-16',
    reason: '869f135w2 measured it absent from every privacy namespace in both languages. Owner decision pending: disclose, or remove the container.',
  },
  {
    origin: 'https://www.clarity.ms',
    term: 'Clarity',
    disclosed: false,
    undisclosedSince: '2026-09-16',
    reason: '869f135w2. Injected by the GTM container, so removing GTM removes this too. Owner decision pending.',
  },
  {
    origin: 'https://static.cloudflareinsights.com',
    term: 'Cloudflare',
    disclosed: false,
    undisclosedSince: '2026-09-16',
    reason: '869f135w2. Injected by Cloudflare at the edge; it is not in the repository at all, which is why it was never written into the copy.',
  },
  {
    origin: 'https://cloudflareinsights.com',
    term: 'Cloudflare',
    disclosed: false,
    undisclosedSince: '2026-09-16',
    reason: '869f135w2. The beacon endpoint for the same surface as the line above.',
  },
];

export { VENDOR_DISCLOSURE };

/**
 * Every injected origin is either named in the privacy copy or declared undisclosed
 * with a reason and a date. A new one is neither, so it fails.
 */
export function findUndeclaredVendors(injectedOrigins, disclosure, privacyText) {
  const declared = new Map(disclosure.map((entry) => [entry.origin, entry]));
  const problems = [];

  for (const { origin, directive } of injectedOrigins) {
    const entry = declared.get(origin);

    if (!entry) {
      problems.push(
        `${directive} allows ${origin}, which is in no VENDOR_DISCLOSURE row. Say which vendor it is and whether the privacy copy names it.`,
      );
      continue;
    }

    const named = privacyText.toLowerCase().includes(entry.term.toLowerCase());

    if (entry.disclosed && !named) {
      problems.push(
        `${origin} is recorded as disclosed, but "${entry.term}" appears nowhere in the privacy copy.`,
      );
    }

    if (!entry.disclosed && named) {
      problems.push(
        `${origin} is recorded as undisclosed, but "${entry.term}" now appears in the privacy copy. Flip \`disclosed\` to true and drop the reason.`,
      );
    }

    if (!entry.disclosed && !(entry.reason && entry.undisclosedSince)) {
      problems.push(`${origin} is undisclosed with no reason or no date.`);
    }
  }

  return problems;
}

const ROUTES = ['/', '/tabs/characters', '/tabs/auto-team-builder', '/tabs/settings'];

export function extractMetaCsp(html) {
  /*
   * The value is captured up to the SAME quote that opened it. A `[^"']+` class looks right and
   * silently truncates every real policy at the first `'self'`, which then reads as nine missing
   * directives rather than as a broken regex - measured while writing this check.
   */
  const match = html.match(
    /<meta\s+http-equiv=(["'])Content-Security-Policy\1\s+content=(["'])([\s\S]*?)\2/iu,
  );

  return match ? match[3].trim() : null;
}



export function parseDirectives(policy) {
  const directives = new Map();

  for (const part of policy.split(';')) {
    const trimmed = part.trim();

    if (!trimmed.length) {
      continue;
    }

    const [name, ...values] = trimmed.split(/\s+/u);
    directives.set(name.toLowerCase(), values);
  }

  return directives;
}

export { REQUIRED_INJECTED_ORIGINS };

export function validatePolicyShape(policy) {
  const errors = [];
  const directives = parseDirectives(policy);

  for (const required of REQUIRED_DIRECTIVES) {
    if (!directives.has(required)) {
      errors.push(`missing required directive: ${required}`);
    }
  }

  for (const unsupported of META_UNSUPPORTED_DIRECTIVES) {
    if (directives.has(unsupported)) {
      errors.push(
        `${unsupported} is ignored when the policy is delivered as a meta tag - listing it claims protection the site does not have`,
      );
    }
  }

  if (!(directives.get('object-src') ?? []).includes("'none'")) {
    errors.push("object-src must be 'none'");
  }

  if ((directives.get('script-src') ?? []).includes("'unsafe-eval'")) {
    errors.push("script-src must not allow 'unsafe-eval' - sql.js needs only 'wasm-unsafe-eval'");
  }

  if (!(directives.get('script-src') ?? []).includes("'wasm-unsafe-eval'")) {
    errors.push("script-src must allow 'wasm-unsafe-eval' or sql.js cannot compile the dataset engine");
  }

  for (const { directive, origin, injectedBy } of REQUIRED_INJECTED_ORIGINS) {
    if (!(directives.get(directive) ?? []).includes(origin)) {
      errors.push(
        `${directive} must allow ${origin} - injected by ${injectedBy}, and blocking it breaks the live site silently`,
      );
    }
  }

  return errors;
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.mjs': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.webmanifest': 'application/manifest+json; charset=utf-8',
      '.wasm': 'application/wasm',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.sql': 'application/sql',
      '.woff2': 'font/woff2',
    }[extension] ?? 'application/octet-stream'
  );
}

async function startStaticServer(root) {
  const server = createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/u, '');
    const candidatePath = path.resolve(root, relativePath);
    const rootWithSep = `${path.resolve(root)}${path.sep}`;
    let filePath = candidatePath.startsWith(rootWithSep) ? candidatePath : '';

    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      if (String(req.headers.accept || '').includes('text/html')) {
        filePath = path.join(root, 'index.html');
      } else {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found');
        return;
      }
    }

    res.writeHead(200, { 'cache-control': 'no-store', 'content-type': contentTypeFor(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        reject(new Error('Unable to resolve static server address.'));
        return;
      }

      resolve({
        baseURL: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((done, fail) => server.close((error) => (error ? fail(error) : done()))),
      });
    });
  });
}

/**
 * Every privacy- and cookie-facing translation file, both languages, as one string.
 * 869f135w2.
 */
export function readPrivacyCopy(root = ROOT_DIR) {
  const i18n = path.join(root, 'public', 'i18n');
  const files = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.json') && /privacy|cookie/iu.test(full)) {
        files.push(full);
      }
    }
  };

  walk(i18n);
  files.push(path.join(i18n, 'en.json'), path.join(i18n, 'el.json'));

  return files
    .filter((file) => fs.existsSync(file))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
}

async function main() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const policy = extractMetaCsp(html);

  if (!policy) {
    console.error('[csp] src/index.html carries no Content-Security-Policy meta tag.');
    process.exitCode = 1;
    return;
  }

  const shapeErrors = validatePolicyShape(policy);

  if (shapeErrors.length) {
    console.error('[csp] policy shape rejected:');
    for (const error of shapeErrors) {
      console.error(`  - ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  /* 869f135w2. Allowed to load is not the same as disclosed to the reader. */
  const vendorProblems = findUndeclaredVendors(
    REQUIRED_INJECTED_ORIGINS,
    VENDOR_DISCLOSURE,
    readPrivacyCopy(),
  );

  if (vendorProblems.length) {
    console.error('[csp] measurement vendors and the privacy copy disagree:');
    for (const problem of vendorProblems) {
      console.error(`  - ${problem}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`[csp] policy shape OK (${parseDirectives(policy).size} directives).`);

  if (process.argv.includes('--build')) {
    console.log('[csp] building...');
    const build = spawnSync('npm', ['run', 'build:pages'], { cwd: ROOT_DIR, stdio: 'inherit' });

    if (build.status !== 0) {
      console.error('[csp] build failed.');
      process.exitCode = 1;
      return;
    }
  }

  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    console.error(`[csp] no build at ${DIST_DIR}. Rerun with --build.`);
    process.exitCode = 1;
    return;
  }

  const builtPolicy = extractMetaCsp(fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf8'));

  if (builtPolicy !== policy) {
    console.error('[csp] the built index.html carries a different policy than src/index.html.');
    process.exitCode = 1;
    return;
  }

  const server = await startStaticServer(DIST_DIR);
  const browser = await chromium.launch();
  const violations = [];

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__cspViolations.push({
          directive: event.effectiveDirective || event.violatedDirective,
          blockedURI: event.blockedURI,
          source: `${event.sourceFile ?? ''}:${event.lineNumber ?? ''}`,
        });
      });
    });

    for (const route of ROUTES) {
      await page.goto(`${server.baseURL}${route}`, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForTimeout(1_500);

      const pageViolations = await page.evaluate(() => window.__cspViolations ?? []);

      for (const violation of pageViolations) {
        violations.push({ route, ...violation });
      }

      await page.evaluate(() => {
        window.__cspViolations = [];
      });

      console.log(`[csp] ${route}: ${pageViolations.length} violation(s).`);
    }
  } finally {
    await browser.close();
    await server.close();
  }

  if (violations.length) {
    console.error(`\n[csp] ${violations.length} violation(s) - the policy would break the app:`);
    for (const violation of violations) {
      console.error(
        `  - ${violation.route}: ${violation.directive} blocked ${violation.blockedURI} (${violation.source})`,
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log(`\n[csp] OK - ${ROUTES.length} routes served under the policy with zero violations.`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
