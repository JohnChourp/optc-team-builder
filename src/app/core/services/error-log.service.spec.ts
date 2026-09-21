import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ERROR_LOG_KEY,
  ERROR_LOG_LIMIT,
  ERROR_LOG_MESSAGE_LIMIT,
  ErrorLogService,
  LoggingErrorHandler,
  describeThrown,
  toDiagnosticsEntry,
} from './error-log.service';

/**
 * A `localStorage` that behaves, plus the two failure modes the service has to survive:
 * a getter that throws (private mode, blocked site data) and a setter that throws (quota).
 */
function createStorage(options?: { readThrows?: boolean; writeThrows?: boolean; seed?: string }) {
  const store = new Map<string, string>();

  if (options?.seed !== undefined) {
    store.set(ERROR_LOG_KEY, options.seed);
  }

  return {
    getItem: vi.fn((key: string) => {
      if (options?.readThrows) {
        throw new Error('storage unavailable');
      }

      return store.get(key) ?? null;
    }),
    setItem: vi.fn((key: string, value: string) => {
      if (options?.writeThrows) {
        throw new Error('QuotaExceededError');
      }

      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    read: () => store.get(ERROR_LOG_KEY),
  };
}

type Listener = (event: unknown) => void;

function createDocument(storage: ReturnType<typeof createStorage> | null) {
  const listeners = new Map<string, Listener[]>();

  const defaultView = {
    localStorage: storage,
    addEventListener: vi.fn((type: string, listener: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    }),
  };

  return {
    document: { defaultView } as unknown as Document,
    defaultView,
    emit: (type: string, event: unknown) => {
      for (const listener of listeners.get(type) ?? []) {
        listener(event);
      }
    },
    listenerCount: (type: string) => (listeners.get(type) ?? []).length,
  };
}

describe('describeThrown', () => {
  it('keeps the constructor name and the message of a real Error', () => {
    expect(describeThrown(new TypeError('nope'))).toEqual({ name: 'TypeError', message: 'nope' });
  });

  it('survives a rejection that carries something that is not an Error', () => {
    // A promise can reject with anything at all, including undefined - and this runs
    // inside the handler for things already going wrong, so it must not add a throw.
    expect(describeThrown(undefined).name).toBe('Error');
    expect(describeThrown('plain string')).toEqual({ name: 'Error', message: 'plain string' });
    expect(describeThrown({ toString: () => 'object-ish' }).message).toBe('object-ish');
  });

  it('truncates a message long enough to be a pasted stack', () => {
    const described = describeThrown(new Error('x'.repeat(ERROR_LOG_MESSAGE_LIMIT + 200)));

    expect(described.message).toHaveLength(ERROR_LOG_MESSAGE_LIMIT);
    expect(described.message.endsWith('…')).toBe(true);
  });
});

describe('ErrorLogService', () => {
  let storage: ReturnType<typeof createStorage>;
  let host: ReturnType<typeof createDocument>;

  beforeEach(() => {
    storage = createStorage();
    host = createDocument(storage);
  });

  it('records an entry and persists it', () => {
    const service = new ErrorLogService(host.document);

    service.record('angular', 'TypeError', 'nope');

    expect(service.entries()).toHaveLength(1);
    expect(service.entries()[0]).toMatchObject({ kind: 'angular', name: 'TypeError', message: 'nope' });
    expect(JSON.parse(storage.read() ?? '[]')).toHaveLength(1);
  });

  it('reads back what a previous session wrote', () => {
    const seeded = createStorage({
      seed: JSON.stringify([
        { at: '2026-09-20T10:00:00.000Z', kind: 'window', name: 'TypeError', message: 'earlier' },
      ]),
    });

    const service = new ErrorLogService(createDocument(seeded).document);

    // The whole point of persisting: the reader looks AFTER the reload, not during.
    expect(service.entries()[0]?.message).toBe('earlier');
  });

  it('keeps only the most recent entries', () => {
    const service = new ErrorLogService(host.document);

    for (let index = 0; index < ERROR_LOG_LIMIT + 5; index += 1) {
      service.record('angular', 'TypeError', `failure ${index}`);
    }

    expect(service.entries()).toHaveLength(ERROR_LOG_LIMIT);
    // Oldest dropped, newest kept - a repeating failure must not push the useful end out.
    expect(service.entries()[0]?.message).toBe('failure 5');
    expect(service.entries().at(-1)?.message).toBe(`failure ${ERROR_LOG_LIMIT + 4}`);
  });

  it('discards a stored value that is not a well-formed log', () => {
    for (const seed of ['not json at all', '{"not":"an array"}', '[{"kind":"invented"}]', '[null]']) {
      const service = new ErrorLogService(createDocument(createStorage({ seed })).document);

      expect(service.entries()).toEqual([]);
    }
  });

  it('survives storage that throws on read', () => {
    const service = new ErrorLogService(createDocument(createStorage({ readThrows: true })).document);

    // An error log that threw while being read would be its own first entry.
    expect(service.entries()).toEqual([]);
  });

  it('survives storage that throws on write, and still keeps the entry in memory', () => {
    const throwing = createStorage({ writeThrows: true });
    const service = new ErrorLogService(createDocument(throwing).document);

    expect(() => service.record('angular', 'TypeError', 'nope')).not.toThrow();
    // A quota failure is one of the things worth logging, so the write must not raise one.
    expect(service.entries()).toHaveLength(1);
  });

  it('works with no window at all, as during prerender', () => {
    const service = new ErrorLogService({ defaultView: null } as unknown as Document);

    expect(() => service.init()).not.toThrow();
    expect(() => service.record('angular', 'TypeError', 'nope')).not.toThrow();
    expect(service.entries()).toHaveLength(1);
  });

  it('records a window error with where it came from', () => {
    const service = new ErrorLogService(host.document);
    service.init();

    host.emit('error', {
      error: new TypeError('boom'),
      filename: 'https://optcteambuilder.com/main-ABC.js',
      lineno: 42,
    });

    expect(service.entries()[0]).toMatchObject({
      kind: 'window',
      name: 'TypeError',
      where: 'https://optcteambuilder.com/main-ABC.js:42',
    });
  });

  it('records an unhandled rejection, which Angular never sees', () => {
    const service = new ErrorLogService(host.document);
    service.init();

    host.emit('unhandledrejection', { reason: new RangeError('too far') });

    expect(service.entries()[0]).toMatchObject({ kind: 'rejection', name: 'RangeError' });
  });

  it('attaches its listeners exactly once', () => {
    const service = new ErrorLogService(host.document);

    service.init();
    service.init();

    // An initializer and a test can both reach init(); doubling would record twice.
    expect(host.listenerCount('error')).toBe(1);
    expect(host.listenerCount('unhandledrejection')).toBe(1);
  });

  it('clears the log and the stored value', () => {
    const service = new ErrorLogService(host.document);
    service.record('angular', 'TypeError', 'nope');

    service.clear();

    expect(service.entries()).toEqual([]);
    expect(storage.removeItem).toHaveBeenCalledWith(ERROR_LOG_KEY);
  });

  it('never lets a message reach the diagnostics projection', () => {
    const service = new ErrorLogService(host.document);
    service.record('angular', 'Error', 'Team "my secret team name" could not be saved', 'main.js:1');

    const [exported] = service.diagnosticsEntries();

    // THE load-bearing assertion of this file. A message can carry the reader's own
    // content and nothing in the type says which do, so none of them leave.
    expect(exported).not.toHaveProperty('message');
    expect(JSON.stringify(exported)).not.toContain('my secret team name');
    expect(exported).toMatchObject({ kind: 'angular', name: 'Error', where: 'main.js:1' });
  });

  it('projects a single entry the same way', () => {
    expect(
      toDiagnosticsEntry({
        at: '2026-09-21T00:00:00.000Z',
        kind: 'window',
        name: 'TypeError',
        message: 'private',
      }),
    ).toEqual({ at: '2026-09-21T00:00:00.000Z', kind: 'window', name: 'TypeError' });
  });
});

describe('LoggingErrorHandler', () => {
  it('records the failure and still logs it to the console', () => {
    const host = createDocument(createStorage());
    const service = new ErrorLogService(host.document);
    const handler = new LoggingErrorHandler(service);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    handler.handleError(new TypeError('handled'));

    expect(service.entries()[0]).toMatchObject({ kind: 'angular', name: 'TypeError', message: 'handled' });
    // The console stays: it is where a developer holding the device looks, and
    // trading it for a log nobody has opened yet would be a net loss.
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
