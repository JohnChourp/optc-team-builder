import { Injectable } from '@angular/core';

/**
 * Asks the browser not to evict this origin's storage.
 *
 * 869f17haa. Measured 2026-09-15: `navigator.storage.persisted()` is **false**,
 * and nothing in the app had ever called `persist()`. Meanwhile the storage-key
 * registry classifies 15 records as `durable-user-data` - saved teams, boxes,
 * presets - and on the web those live in localStorage, inside the same evictable
 * origin storage as the 33.2 MB the service worker prefetches.
 *
 * So a player's saved teams are evictable, and the app had never asked otherwise.
 *
 * What this can and cannot do, stated because the measurement could not settle it:
 * `persist()` returns **false on both WebKit and Chromium** in a fresh automation
 * context with no engagement signal, which is the expected answer there and says
 * nothing about a real installed, home-screen app. Browsers grant persistence on
 * their own heuristics - installation, engagement, bookmarks - and asking is the
 * only input this app has. Not asking guarantees the answer is no.
 *
 * Deliberately best-effort and silent:
 *
 *  - it never throws, because a storage hint must not be able to fail startup;
 *  - it never prompts - `persist()` shows no UI in any current engine, and if one
 *    ever adds a prompt, this being an app-initializer means the reader would meet
 *    it before they had any data worth keeping. Revisit then;
 *  - it guards `navigator`, because this app prerenders 4,619 character pages and
 *    the initializer runs in that build with no browser globals at all.
 */
@Injectable({ providedIn: 'root' })
export class StoragePersistenceService {
  /**
   * Resolves to the persistence state the browser reports afterwards, or `null`
   * when the API is unavailable. Callers may ignore it; nothing depends on it.
   */
  public async requestPersistence(): Promise<boolean | null> {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
      return null;
    }

    try {
      if (await navigator.storage.persisted()) {
        return true;
      }

      return await navigator.storage.persist();
    } catch {
      /*
       * Some engines reject in a non-secure or third-party context. A refused
       * storage hint is not a startup failure and must not read like one.
       */
      return null;
    }
  }
}
