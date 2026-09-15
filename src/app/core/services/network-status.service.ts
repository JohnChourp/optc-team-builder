import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/**
 * Whether the reader has a connection. The app's single answer to that question.
 *
 * 869f135r8. Before this, `navigator.onLine` appeared **zero times** in
 * `src/app`. The app was not offline-unaware in the sense of handling it badly -
 * it did not know the concept existed. So the things that need a connection
 * failed one at a time, each in its own way, and nothing ever said "this part
 * needs a network, the rest does not".
 *
 * That matters more here than in most apps. `ngsw-config.json` prefetches the
 * app shell, the i18n bundles and the whole dataset, so the catalogue, both
 * builders, saved teams and boxes genuinely work with no connection at all. A
 * companion app for a phone game is used on trains, in queues and on bad hotel
 * wifi - offline is a normal Tuesday, not an edge case - and the reader was being
 * told nothing about a state the app handles well.
 *
 * `navigator.onLine` is the right primitive and a famously weak one: `true` means
 * "there is an interface", not "the internet is reachable". It is used here for
 * exactly what it can answer honestly - `false` is reliable, and that is the
 * direction the reader needs. Nothing in this app claims a feature WILL work
 * because `onLine` is `true`; it claims a feature will NOT work when it is
 * `false`, which is the claim `navigator.onLine` can actually support.
 */
@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly onlineState = signal(true);

  /** `false` only when the browser is certain there is no connection. */
  public readonly online = this.onlineState.asReadonly();

  public constructor() {
    const view = this.document.defaultView;

    if (!view) {
      return;
    }

    this.onlineState.set(view.navigator?.onLine ?? true);

    const update = (): void => {
      this.onlineState.set(view.navigator?.onLine ?? true);
    };

    view.addEventListener('online', update);
    view.addEventListener('offline', update);

    this.destroyRef.onDestroy(() => {
      view.removeEventListener('online', update);
      view.removeEventListener('offline', update);
    });
  }
}

/**
 * Read without an injector.
 *
 * `classifyFailure` runs inside a catch, often in a pure utility with no
 * component context, and an error handler is the worst possible place to
 * discover that a service is unavailable. This asks the platform directly and
 * treats "cannot tell" as online, because claiming a reader is offline when they
 * are not sends them to check their wifi over a real bug.
 */
export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
