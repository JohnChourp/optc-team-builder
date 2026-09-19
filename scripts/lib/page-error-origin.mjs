/**
 * 869f138q7. Where an uncaught page error came from, read off its stack.
 *
 * The PWA shell check fails on any uncaught page error, and after the dataset started loading from
 * a database file the post-deploy `cache-freshness` job failed twice in three deploys on
 * `Cannot read properties of null (reading 'sequence')` - after fourteen clean runs. The check kept
 * only `error.message`, so the report could not say whose code threw. The only `.sequence` read in
 * the shipped app is in the Auto Team Builder, which neither checked page loads; the Google Tag
 * Manager container that `index.html` then loaded on every page (since 869f13c5m it loads only
 * after a reader accepts analytics) reads `a.D.sequence` on a timer, and a
 * faster app navigates through those pages sooner.
 *
 * The same run showed the other half: a console error with no URL in its text - "Failed to load
 * resource: the server responded with a status of 429" - whose location was the tag manager's
 * own script, rate-limited after repeated local runs. Console errors are attributed by their
 * location the same way.
 *
 * So an error whose top frame is a third-party script is recorded and reported, not failed on -
 * the check is about this app's service worker, and a tag manager's race is neither this app's
 * code nor something a deploy can fix. An error from the app's own code, or with no frame to read,
 * still fails.
 */

export const THIRD_PARTY_SCRIPT_HOSTS = Object.freeze([
  'www.googletagmanager.com',
  'www.google-analytics.com',
  'static.cloudflareinsights.com',
  'scripts.clarity.ms',
  'www.clarity.ms',
]);

const FRAME_URL = /(https?:\/\/[^\s)]+)/u;

/** The URL of the first stack frame, or `null` when the stack names none. */
export function topFrameUrl(stack) {
  for (const line of String(stack ?? '').split('\n').slice(1)) {
    const match = line.match(FRAME_URL);

    if (match) {
      return match[1];
    }
  }

  return null;
}

export function isThirdPartyUrl(url) {
  if (typeof url !== 'string' || url === '') {
    return false;
  }

  try {
    return THIRD_PARTY_SCRIPT_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function isThirdPartyPageError(error) {
  return isThirdPartyUrl(topFrameUrl(error?.stack));
}
