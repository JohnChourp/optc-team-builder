import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  extractMetaCsp,
  parseDirectives,
  REQUIRED_INJECTED_ORIGINS,
  validatePolicyShape,
  VENDOR_DISCLOSURE,
  findUndeclaredVendors,
  readPrivacyCopy,
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

/**
 * 869f135w2. The CSP proves a vendor is ALLOWED to load. It says nothing about
 * whether the reader was ever told, and measured 2026-09-16 three of the four
 * measurement surfaces this app ships are named nowhere in the privacy copy, in
 * either language.
 *
 * That gap is an owner decision — disclose them, or remove them — so it is
 * DECLARED in `VENDOR_DISCLOSURE` with a reason and a date rather than left
 * silently green. What these tests protect is the part that was missing entirely:
 * a fifth vendor could have been added and nothing would have asked.
 */
describe('measurement vendors against the privacy copy', () => {
  const privacyCopy = readPrivacyCopy();

  it('reads privacy copy at all, so an empty string cannot pass everything', () => {
    expect(privacyCopy.length).toBeGreaterThan(1000);
    expect(privacyCopy).toContain('Google Analytics');
  });

  it('accepts the shipped tree', () => {
    expect(findUndeclaredVendors(REQUIRED_INJECTED_ORIGINS, VENDOR_DISCLOSURE, privacyCopy)).toEqual(
      [],
    );
  });

  it('fails a vendor nobody declared — the case that did not exist before', () => {
    const problems = findUndeclaredVendors(
      [...REQUIRED_INJECTED_ORIGINS, { directive: 'script-src', origin: 'https://cdn.hotjar.com' }],
      VENDOR_DISCLOSURE,
      privacyCopy,
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('cdn.hotjar.com');
  });

  it('fails a row claiming disclosure the copy does not carry', () => {
    const lying = VENDOR_DISCLOSURE.map((entry) =>
      entry.term === 'Clarity' ? { ...entry, disclosed: true } : entry,
    );

    expect(
      findUndeclaredVendors(REQUIRED_INJECTED_ORIGINS, lying, privacyCopy)[0],
    ).toContain('appears nowhere in the privacy copy');
  });

  it('fails an undisclosed row with no reason or no date', () => {
    const bare = VENDOR_DISCLOSURE.map((entry) =>
      entry.term === 'Cloudflare' ? { ...entry, reason: undefined } : entry,
    );

    expect(findUndeclaredVendors(REQUIRED_INJECTED_ORIGINS, bare, privacyCopy).length).toBeGreaterThan(0);
  });

  it('tells you to flip the flag once the copy DOES name the vendor', () => {
    /*
     * The self-healing direction. Without it, disclosing Clarity tomorrow would
     * leave a row permanently lying in the other direction, and nothing would say so.
     */
    const problems = findUndeclaredVendors(
      REQUIRED_INJECTED_ORIGINS,
      VENDOR_DISCLOSURE,
      `${privacyCopy} Microsoft Clarity`,
    );

    expect(problems[0]).toContain('Flip');
  });
});
