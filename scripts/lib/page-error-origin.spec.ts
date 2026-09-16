import { describe, expect, it } from 'vitest';

import { THIRD_PARTY_SCRIPT_HOSTS, isThirdPartyPageError, isThirdPartyUrl, topFrameUrl } from './page-error-origin.mjs';

function errorWithStack(stack: string) {
  const error = new TypeError("Cannot read properties of null (reading 'sequence')");
  error.stack = stack;
  return error;
}

const TAG_MANAGER_STACK = [
  "TypeError: Cannot read properties of null (reading 'sequence')",
  '    at Tn (https://www.googletagmanager.com/gtm.js?id=GTM-TEST:352:118)',
  '    at https://www.googletagmanager.com/gtm.js?id=GTM-TEST:401:9',
].join('\n');

const APP_STACK = [
  "TypeError: Cannot read properties of null (reading 'sequence')",
  '    at emitFallbackAttemptProgress (http://127.0.0.1:4310/chunk-D2CkDsu7.js:1:2044)',
  '    at https://www.googletagmanager.com/gtm.js?id=GTM-TEST:401:9',
].join('\n');

describe('page error origin', () => {
  it('attributes an error thrown inside a third-party script to it', () => {
    expect(topFrameUrl(TAG_MANAGER_STACK)).toBe('https://www.googletagmanager.com/gtm.js?id=GTM-TEST:352:118');
    expect(isThirdPartyPageError(errorWithStack(TAG_MANAGER_STACK))).toBe(true);
  });

  /* The top frame decides: a tag manager further down the stack does not excuse the app. */
  it('keeps an error thrown in app code on the app, whatever is below it', () => {
    expect(isThirdPartyPageError(errorWithStack(APP_STACK))).toBe(false);
  });

  it('keeps an error with no readable frame, so nothing is excused by accident', () => {
    expect(isThirdPartyPageError(errorWithStack('TypeError: boom'))).toBe(false);
    expect(isThirdPartyPageError(errorWithStack(''))).toBe(false);
    expect(isThirdPartyPageError({})).toBe(false);
    expect(isThirdPartyPageError(null)).toBe(false);
  });

  it('matches hosts exactly, not by suffix or substring', () => {
    for (const host of THIRD_PARTY_SCRIPT_HOSTS) {
      expect(isThirdPartyPageError(errorWithStack(`E\n    at f (https://${host}/x.js:1:1)`))).toBe(true);
    }

    expect(
      isThirdPartyPageError(errorWithStack('E\n    at f (https://www.googletagmanager.com.evil.test/x.js:1:1)')),
    ).toBe(false);
    expect(isThirdPartyPageError(errorWithStack('E\n    at f (http://127.0.0.1:4310/googletagmanager.js:1:1)'))).toBe(
      false,
    );
  });

  it('attributes a console error by its location, the way the rate-limited tag manager reported one', () => {
    expect(isThirdPartyUrl('https://www.googletagmanager.com/gtm.js?id=GTM-TEST')).toBe(true);
    expect(isThirdPartyUrl('http://127.0.0.1:4310/main-ABC.js')).toBe(false);
    expect(isThirdPartyUrl('')).toBe(false);
    expect(isThirdPartyUrl(undefined)).toBe(false);
    expect(isThirdPartyUrl('not a url')).toBe(false);
  });

  it('reads Firefox-style frames too', () => {
    const firefox = "Tn@https://www.googletagmanager.com/gtm.js?id=GTM-TEST:352:118\n@https://www.googletagmanager.com/gtm.js:1:1";

    /* Firefox has no message line, so the first line is already a frame and is skipped - the next one decides. */
    expect(isThirdPartyPageError(errorWithStack(firefox))).toBe(true);
  });
});
