import { describe, expect, it, vi } from 'vitest';

import { classifyFailure } from './failure-message.utils';
import { isBrowserOffline } from './network-status.service';

/**
 * 869f135r8. `navigator.onLine` appeared ZERO times in `src/app` before this, so
 * these are the first tests the app has about having no connection at all.
 *
 * `NetworkStatusService` itself needs an injector and a `DOCUMENT`, which a page
 * spec in this repository does not have - so the behaviour worth pinning here is
 * the part that runs without one, and the classification that every failure
 * message depends on.
 */

function withNavigator<T>(onLine: boolean | undefined, run: () => T): T {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: onLine === undefined ? undefined : { onLine },
  });

  try {
    return run();
  } finally {
    if (original) {
      Object.defineProperty(globalThis, 'navigator', original);
    } else {
      Reflect.deleteProperty(globalThis, 'navigator');
    }
  }
}

describe('isBrowserOffline', () => {
  it('is true only when the browser says it is offline', () => {
    expect(withNavigator(false, isBrowserOffline)).toBe(true);
    expect(withNavigator(true, isBrowserOffline)).toBe(false);
  });

  /*
   * "Cannot tell" is treated as online on purpose. Claiming a reader is offline
   * when they are not sends them to check their wifi over what is really a bug,
   * and `navigator.onLine` can only support the negative claim.
   */
  it('treats an absent navigator as online rather than guessing offline', () => {
    expect(withNavigator(undefined, isBrowserOffline)).toBe(false);
  });
});

describe('classifyFailure while offline', () => {
  it('reports offline before anything else, so the reader gets the cause', () => {
    const quota = new DOMException('quota exceeded', 'QuotaExceededError');

    /*
     * The same error classifies differently depending on the connection, and that
     * is the point: a Drive upload that cannot reach Google is not a save that
     * failed, and "try again" is advice that cannot work until the connection
     * returns.
     */
    expect(withNavigator(true, () => classifyFailure(quota))).toBe('storageQuota');
    expect(withNavigator(false, () => classifyFailure(quota))).toBe('offline');
  });

  it('still reports offline for an error it could not otherwise classify', () => {
    expect(withNavigator(false, () => classifyFailure(new Error('boom')))).toBe('offline');
    expect(withNavigator(true, () => classifyFailure(new Error('boom')))).toBe('unexpected');
  });
});
