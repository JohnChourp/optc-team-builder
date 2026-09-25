import { DOCUMENT } from '@angular/common';
import { ErrorHandler, Inject, Injectable, type Signal, signal } from '@angular/core';

/**
 * The last few things that went wrong, kept on this device and sent nowhere.
 *
 * 869f13d6y / 869f13d9w. Until this existed the app had **no error reporting of any
 * kind** - `ErrorHandler`, `window.onerror` and `unhandledrejection` were each zero
 * occurrences in `src`, and `main.ts` ended in `.catch((error) => console.error(error))`.
 * 19 of 22 pages catch their own failures and degrade gracefully, so a failure was
 * handled locally and then vanished. A player whose import died, whose storage quota
 * ran out, or whose worker would not start produced no signal at all, and the
 * maintainer learned about it only if that player wrote to them, in their own words,
 * without a version number.
 *
 * The owner chose the local-only shape on 2026-09-21, over opt-in transmission and
 * over leaving it blind. So:
 *
 *   - nothing is transmitted, ever, by this service. There is no endpoint and no
 *     consent prompt to get wrong;
 *   - the reader can see the log on Settings and can choose to include it in the
 *     diagnostics file they already export by hand;
 *   - it is `docs/measurement-position.md`'s rule applied to failure: read what is
 *     already on the reader's device, render it locally, transmit nothing.
 *
 * ## What the export carries, and what it deliberately does not
 *
 * {@link ErrorLogEntry.message} stays **on the device**. `buildStorageDiagnosticsPayload`
 * promises "COUNTS ONLY. No team names, no character ids, no box contents, no account",
 * and warns that the way that promise gets broken is by someone later adding "just the
 * names". An error message is exactly that hole: `Cannot read properties of undefined`
 * is harmless, and a message that interpolated a team name is not, and nothing in the
 * type distinguishes them.
 *
 * So {@link toDiagnosticsEntry} drops the message and keeps the four fields that cannot
 * carry the reader's content: when, which mechanism caught it, the error's constructor
 * name, and where in our own bundle it came from. "3 QuotaExceededError in the last
 * hour" is the diagnosis anyway. The reader still reads the full message on screen and
 * may quote it themselves - which is their choice to make and not ours.
 */

/** Which mechanism caught it. Kept because they fail in different ways. */
export type ErrorLogKind =
  /** Angular's own handler: anything thrown inside the framework's zone. */
  | 'angular'
  /** A `window.onerror` event: a synchronous throw that escaped everything. */
  | 'window'
  /** An `unhandledrejection`: a promise nobody caught, which Angular never sees. */
  | 'rejection'
  /**
   * 869f6td63. A file an import turned down. The screen caught it and told the reader, in their
   * language, what to do; this keeps the parser's own words, which the screen no longer shows.
   */
  | 'import';

export interface ErrorLogEntry {
  /** ISO-8601, so an export sorts and a reader can say "around then". */
  readonly at: string;
  readonly kind: ErrorLogKind;
  /**
   * The error's constructor name - `TypeError`, `QuotaExceededError`. Never the
   * message, so this field alone is safe to export.
   */
  readonly name: string;
  /** The reader's own copy of the message. NEVER exported - see the class docblock. */
  readonly message: string;
  /** Script and line inside our own bundle, when the event gave one. */
  readonly where?: string;
}

/** The export-safe projection: every field except {@link ErrorLogEntry.message}. */
export type ErrorLogDiagnosticsEntry = Omit<ErrorLogEntry, 'message'>;

export const ERROR_LOG_KEY = 'recentErrorLog';

/**
 * Twenty is the cap because a log the reader has to scroll is one they will not read,
 * and because a failure that repeats writes the same entry many times - the useful
 * window is the last handful, not the history.
 */
export const ERROR_LOG_LIMIT = 20;

/** Beyond this a message is a stack dump pasted into a sentence, not an explanation. */
export const ERROR_LOG_MESSAGE_LIMIT = 300;

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

/** Best-effort name and message from something that may not be an `Error` at all. */
export function describeThrown(thrown: unknown): { name: string; message: string } {
  if (thrown instanceof Error) {
    return {
      name: thrown.name || 'Error',
      message: truncate(thrown.message || String(thrown), ERROR_LOG_MESSAGE_LIMIT),
    };
  }

  if (typeof thrown === 'string') {
    return { name: 'Error', message: truncate(thrown, ERROR_LOG_MESSAGE_LIMIT) };
  }

  // A rejection can carry anything, including undefined. `String(...)` is the only
  // thing that cannot itself throw here, and losing the shape is acceptable.
  let rendered: string;
  try {
    rendered = String(thrown);
  } catch {
    rendered = 'Unknown error';
  }

  return { name: 'Error', message: truncate(rendered, ERROR_LOG_MESSAGE_LIMIT) };
}

/** Strips the message so an entry can leave the device. */
export function toDiagnosticsEntry(entry: ErrorLogEntry): ErrorLogDiagnosticsEntry {
  const { message: _message, ...rest } = entry;

  return rest;
}

/** Rejects anything that is not a well-formed entry, so a hand-edited value cannot render. */
function parseEntries(raw: string): ErrorLogEntry[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const kinds = new Set<string>(['angular', 'window', 'rejection', 'import']);

  return parsed
    .filter(
      (entry): entry is ErrorLogEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as ErrorLogEntry).at === 'string' &&
        typeof (entry as ErrorLogEntry).name === 'string' &&
        typeof (entry as ErrorLogEntry).message === 'string' &&
        kinds.has((entry as ErrorLogEntry).kind),
    )
    .slice(-ERROR_LOG_LIMIT);
}

@Injectable({ providedIn: 'root' })
export class ErrorLogService {
  private readonly entriesSignal = signal<readonly ErrorLogEntry[]>([]);

  /** Newest first, which is the order the reader wants and the storage order reversed. */
  public readonly entries: Signal<readonly ErrorLogEntry[]> = this.entriesSignal.asReadonly();

  private listening = false;

  public constructor(@Inject(DOCUMENT) private readonly document: Document) {
    this.entriesSignal.set(this.read());
  }

  /**
   * Attaches the two listeners Angular's `ErrorHandler` never sees.
   *
   * Idempotent, because an app initializer and a test can both reach it, and a
   * double-attached listener would record every failure twice.
   */
  public init(): void {
    const view = this.document.defaultView;

    if (this.listening || !view) {
      return;
    }

    this.listening = true;

    view.addEventListener('error', (event) => {
      const errorEvent = event as ErrorEvent;
      const described = describeThrown(errorEvent.error ?? errorEvent.message);
      const where =
        typeof errorEvent.filename === 'string' && errorEvent.filename
          ? `${errorEvent.filename}:${errorEvent.lineno ?? 0}`
          : undefined;

      this.record('window', described.name, described.message, where);
    });

    view.addEventListener('unhandledrejection', (event) => {
      const described = describeThrown((event as PromiseRejectionEvent).reason);

      this.record('rejection', described.name, described.message);
    });
  }

  /** Appends an entry, keeping at most {@link ERROR_LOG_LIMIT}. */
  public record(kind: ErrorLogKind, name: string, message: string, where?: string): void {
    const entry: ErrorLogEntry = {
      at: new Date().toISOString(),
      kind,
      name,
      message: truncate(message, ERROR_LOG_MESSAGE_LIMIT),
      ...(where ? { where } : {}),
    };

    const next = [...this.entriesSignal(), entry].slice(-ERROR_LOG_LIMIT);

    this.entriesSignal.set(next);
    this.write(next);
  }

  public clear(): void {
    this.entriesSignal.set([]);

    try {
      this.document.defaultView?.localStorage?.removeItem(ERROR_LOG_KEY);
    } catch {
      // Same reasoning as write(): a log that cannot be cleared must not throw
      // out of a button handler.
    }
  }

  /** The export-safe projection of the whole log, newest last. */
  public diagnosticsEntries(): ErrorLogDiagnosticsEntry[] {
    return this.entriesSignal().map(toDiagnosticsEntry);
  }

  private read(): ErrorLogEntry[] {
    try {
      const raw = this.document.defaultView?.localStorage?.getItem(ERROR_LOG_KEY);

      return raw ? parseEntries(raw) : [];
    } catch {
      // Private mode, blocked site data, or a prerender with no window. An error
      // log that throws while being read would be its own first entry.
      return [];
    }
  }

  private write(entries: readonly ErrorLogEntry[]): void {
    try {
      this.document.defaultView?.localStorage?.setItem(ERROR_LOG_KEY, JSON.stringify(entries));
    } catch {
      // A quota failure is one of the things worth logging, so writing the log
      // must never be able to raise one of its own.
    }
  }
}

/**
 * Angular's `ErrorHandler`, which logs to the console exactly as the default does
 * and additionally keeps the entry.
 *
 * Deliberately still `console.error`: the console is where a developer with the
 * device in hand looks, and removing that to add a log nobody has opened yet would
 * be a net loss.
 */
@Injectable()
export class LoggingErrorHandler implements ErrorHandler {
  public constructor(private readonly errorLog: ErrorLogService) {}

  public handleError(error: unknown): void {
    const described = describeThrown(error);

    this.errorLog.record('angular', described.name, described.message);

    console.error(error);
  }
}
