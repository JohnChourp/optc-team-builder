import { signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';

/**
 * The one way this app gives the player a file.
 *
 * 869f63gqg. Every export used to build a Blob and click an `<a download>` link itself -
 * eleven sites in eleven files, reached from Settings, Saved Teams, Saved Enemies, the
 * character page, Characters, and both builders. On the website that downloads the file.
 * In the Android app it did nothing at all: Capacitor 8.5.2's bridge registers no
 * `DownloadListener` and `MainActivity` adds none, so the WebView drops the request. No
 * file under `/sdcard`, no message, no log line - measured on the published v0.6.5 APK,
 * where Settings -> Export all data produced nothing while Import all data on the same row
 * opened Android's document picker.
 *
 * So the platform is decided here, once:
 *
 *   - **web** - exactly the anchor download every site used to do, unchanged and still
 *     synchronous, so the click stays inside the tap that asked for it;
 *   - **native** - the file is written to the app's cache with `@capacitor/filesystem` and
 *     handed to Android's share sheet with `@capacitor/share`, where the player chooses
 *     Files, Drive, a chat or another device. No permission is involved: the app's
 *     FileProvider already serves its cache directory (`res/xml/file_paths.xml`). While the
 *     sheet is open, the app shell shows {@link playerFileNotice} saying what it is for.
 *
 * Dismissing the share sheet is a decision, not a failure, and says nothing - the same rule
 * `SavedTeamsPage.copyTeamShareLink` follows for the web share sheet. A real failure says
 * so, in the failure vocabulary's words, instead of the silence this replaced.
 *
 * `player-file-delivery.sites.spec.ts` fails when an element's `download` is set anywhere
 * else in the app, which is how a twelfth export would skip the native path.
 */

export interface PlayerFile {
  /** The name the player sees - in the browser's downloads, or in the share sheet. */
  readonly filename: string;
  readonly contents: string;
  readonly mimeType: string;
}

/** Every export this app writes is JSON, and has always been sent with this type. */
export const JSON_EXPORT_MIME_TYPE = 'application/json;charset=utf-8';

/** What became of the file, for a caller that wants to know. None of them has to. */
export type PlayerFileOutcome = 'downloaded' | 'shared' | 'dismissed' | 'failed';

/** What the app shell tells the player about a native export - or nothing, when null. */
export type PlayerFileNotice = 'choose-destination' | 'failed';

/**
 * The exact rejection `@capacitor/share` uses when the player backs out of the sheet:
 * `call.reject("Share canceled")` in its `SharePlugin.java`. Matched whole, because a
 * substring such as "cancel" would also swallow a failure that merely mentions one.
 */
export const SHARE_SHEET_DISMISSED_MESSAGE = 'Share canceled';

/*
 * Module state rather than a service, because the eleven callers are plain functions in
 * `*.utils.ts` files with no injector, and every one of them is called from a page method
 * that the page specs construct without one. The shell reads it; nothing else writes it.
 */
const noticeState = signal<PlayerFileNotice | null>(null);

export const playerFileNotice = noticeState.asReadonly();

export function dismissPlayerFileNotice(): void {
  noticeState.set(null);
}

/**
 * Gives the player `file`: a download on the web, the share sheet on a phone.
 *
 * Never rejects. On the web it throws synchronously exactly where the old anchor code did,
 * and on a phone every failure is caught, logged and shown - so a caller may fire and forget.
 */
export function givePlayerFile(
  file: PlayerFile,
  documentRef: Document = document,
  urlRef: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
): Promise<PlayerFileOutcome> {
  if (!Capacitor.isNativePlatform()) {
    downloadInBrowser(file, documentRef, urlRef);

    return Promise.resolve('downloaded');
  }

  return shareFromDevice(file);
}

function downloadInBrowser(
  file: PlayerFile,
  documentRef: Document,
  urlRef: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>,
): void {
  const objectUrl = urlRef.createObjectURL(new Blob([file.contents], { type: file.mimeType }));
  const anchor = documentRef.createElement('a');

  anchor.href = objectUrl;
  anchor.download = file.filename;
  anchor.style.display = 'none';
  documentRef.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    documentRef.body.removeChild(anchor);
    urlRef.revokeObjectURL(objectUrl);
  }
}

async function shareFromDevice(file: PlayerFile): Promise<PlayerFileOutcome> {
  try {
    /*
     * Loaded here, on the native path only, so the website neither downloads nor runs
     * either plugin - Filesystem registers a global bridge helper the moment it is imported.
     */
    const [{ Directory, Encoding, Filesystem }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const { uri } = await Filesystem.writeFile({
      path: file.filename,
      data: file.contents,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    const sharing = Share.share({ title: file.filename, files: [uri] });

    noticeState.set('choose-destination');
    await sharing;
    noticeState.set(null);

    return 'shared';
  } catch (error) {
    if (isShareSheetDismissal(error)) {
      noticeState.set(null);

      return 'dismissed';
    }

    console.error(error);
    noticeState.set('failed');

    return 'failed';
  }
}

function isShareSheetDismissal(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    error.message === SHARE_SHEET_DISMISSED_MESSAGE
  );
}
