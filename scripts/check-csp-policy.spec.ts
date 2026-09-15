import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  extractMetaCsp,
  parseDirectives,
  REQUIRED_INJECTED_ORIGINS,
  validatePolicyShape,
} from './check-csp-policy.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const indexHtml = readFileSync(resolve(ROOT, 'src/index.html'), 'utf8');

describe('extractMetaCsp', () => {
  it('reads the whole policy, not just the part before the first quoted keyword', () => {
    const policy = extractMetaCsp(indexHtml);

    expect(policy).not.toBeNull();
    // The regression this pins: a `[^"']+` capture stops dead at `'self'` and yields one directive.
    expect(parseDirectives(policy as string).size).toBeGreaterThan(5);
    expect(policy).toContain("object-src 'none'");
  });

  it('returns null when the document carries no policy', () => {
    expect(extractMetaCsp('<html><head><title>x</title></head></html>')).toBeNull();
  });
});

describe('validatePolicyShape', () => {
  it('accepts the shipped policy', () => {
    expect(validatePolicyShape(extractMetaCsp(indexHtml) as string)).toEqual([]);
  });

  it('rejects a policy that drops a required directive', () => {
    const errors = validatePolicyShape("default-src 'self'; object-src 'none'");

    expect(errors.join(' ')).toContain('missing required directive: script-src');
  });

  /**
   * 869f13285. GitHub Pages cannot set headers, and `frame-ancestors` is ignored when the policy
   * is delivered as a meta tag. Listing it would read as clickjacking protection the site does not
   * have, which is worse than the honest absence.
   */
  it('rejects a directive that a meta policy silently ignores', () => {
    const errors = validatePolicyShape(
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; worker-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    );

    expect(errors.join(' ')).toContain('frame-ancestors is ignored');
  });

  it("rejects 'unsafe-eval', which sql.js does not need", () => {
    const errors = validatePolicyShape(
      "default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; worker-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
    );

    expect(errors.join(' ')).toContain("must not allow 'unsafe-eval'");
  });

  it.each(REQUIRED_INJECTED_ORIGINS)(
    'rejects a policy missing $origin, injected by $injectedBy',
    ({ directive, origin }) => {
      const shipped = extractMetaCsp(indexHtml) as string;
      const withoutOrigin = shipped
        .split(';')
        .map((part) =>
          part.trim().startsWith(directive)
            ? part.replace(` ${origin}`, '')
            : part,
        )
        .join(';');

      expect(validatePolicyShape(withoutOrigin).join(' ')).toContain(origin);
    },
  );

  it("rejects a policy missing 'wasm-unsafe-eval', which would break the dataset engine", () => {
    const errors = validatePolicyShape(
      "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; worker-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
    );

    expect(errors.join(' ')).toContain("'wasm-unsafe-eval'");
  });
});

describe('the shipped policy', () => {
  it('allows every origin the app actually reaches at runtime', () => {
    const directives = parseDirectives(extractMetaCsp(indexHtml) as string);

    // Proven against a served build by `npm run security:csp`; pinned here so a hand edit that
    // removes one is caught without a browser.
    expect(directives.get('connect-src')).toContain('https://www.googleapis.com');
    expect(directives.get('script-src')).toContain('https://www.googletagmanager.com');
    // Microsoft Clarity is injected by the GTM container and appears nowhere else in this repo.
    expect(directives.get('script-src')).toContain('https://www.clarity.ms');
    /*
     * Cloudflare Web Analytics, injected by Cloudflare at the edge. `npm run security:csp` cannot
     * catch this one - it serves the build locally, with no CDN in front - so v0.4.43 shipped a
     * policy that blocked it and the public-entry synthetics caught it in production. Pinned here
     * so the same edit cannot pass a local run twice.
     */
    expect(directives.get('script-src')).toContain('https://static.cloudflareinsights.com');
    expect(directives.get('connect-src')).toContain('https://cloudflareinsights.com');
    expect(directives.get('style-src')).toContain('https://fonts.googleapis.com');
    expect(directives.get('font-src')).toContain('https://fonts.gstatic.com');
    // The three builder workers are constructed from bundled blob URLs.
    expect(directives.get('worker-src')).toContain('blob:');
  });

  it('ships a referrer policy alongside it', () => {
    expect(indexHtml).toContain('<meta name="referrer" content="strict-origin-when-cross-origin">');
  });
});
