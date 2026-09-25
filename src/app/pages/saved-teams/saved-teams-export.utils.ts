import { Capacitor } from '@capacitor/core';

import { APP_SITE_BASE_URL } from '../../core/data/app-site-url.data';
import { type SavedTeam } from '../../core/models/optc.models';
import {
  givePlayerFile,
  JSON_EXPORT_MIME_TYPE,
} from '../../core/services/player-file-delivery.utils';
import {
  SAVED_TEAM_SHARE_QUERY_PARAM,
  buildSavedTeamShareCode,
  buildSavedTeamsExportFilename,
  type SavedTeamsTransferPayload,
} from './saved-teams-transfer.utils';

/**
 * The two ways a saved team leaves this device: the export file and the share link.
 *
 * 869f63gqg. Both used to live in `saved-teams-transfer.utils.ts`, and both needed to learn
 * which platform they run on - in the Android app the export had to stop clicking a download
 * link nothing handled, and the share link had to stop naming `https://localhost`. That needs
 * runtime imports, and the transfer module must not have any: `perf-saved-team-codecs.mjs`
 * imports it from a `data:` URL and `perf-explanation-compare.mjs` serves it to a page on its
 * own, and a module loaded that way cannot resolve an import. So the codec stayed where it is,
 * and the two functions that talk to the platform moved here.
 */

export function downloadSavedTeamsExport(
  payload: SavedTeamsTransferPayload | null,
  documentRef: Document = document,
  urlRef: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
): void {
  if (!payload) {
    return;
  }

  void givePlayerFile(
    {
      filename: buildSavedTeamsExportFilename(payload.exportedAt),
      contents: JSON.stringify(payload, null, 2) + '\n',
      mimeType: JSON_EXPORT_MIME_TYPE,
    },
    documentRef,
    urlRef,
  );
}

export function buildSavedTeamShareUrl(
  team: SavedTeam,
  origin = resolveShareLinkOrigin(),
  exportedAt = new Date().toISOString(),
): string {
  const shareCode = buildSavedTeamShareCode(team, exportedAt);
  const sharePath = '/tabs/manual-team-builder';

  if (!origin.length) {
    return `${sharePath}?${SAVED_TEAM_SHARE_QUERY_PARAM}=${shareCode}`;
  }

  const shareUrl = new URL(sharePath, origin);

  shareUrl.searchParams.set(SAVED_TEAM_SHARE_QUERY_PARAM, shareCode);

  return shareUrl.toString();
}

/**
 * The host a share link names.
 *
 * In the Android app the WebView's origin is `https://localhost`, so a link built from it opens
 * nothing on the phone of the friend who taps it - measured on the published APK. There the
 * link names the published site. On the web it keeps naming the site it was copied from, so a
 * preview or a local server still shares links that open on that same server.
 */
function resolveShareLinkOrigin(): string {
  if (Capacitor.isNativePlatform()) {
    return APP_SITE_BASE_URL;
  }

  return typeof globalThis.location?.origin === 'string' ? globalThis.location.origin : '';
}
