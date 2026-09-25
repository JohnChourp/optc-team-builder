/**
 * What the Android WebView does differently from a browser, for each capability the app relies
 * on, and what the app does about it - every fact read from the code and config that decide it.
 *
 * 869f63gu1. `docs/native-surface.json` said Android was "proven to work by hand" and named none
 * of the ways the APK differs from the website. On 2026-09-23 its text had 0 mentions of
 * download, share, back button, SystemBars, WebView or the client id, while the published v0.6.4
 * APK wrote no export, copied share links naming https://localhost, swallowed the back key on
 * Home, let the system bars follow the phone, and had no Google sign-in.
 *
 * Each capability states two things in words - what the WebView does, what the app does - and
 * carries the facts those words depend on under `derived`. The facts are re-read on every run, so
 * a change in code or config makes the record stale; and `checkWebViewCapabilities` refuses a
 * record whose facts no longer support its words, so regenerating over a regression fails
 * instead of quietly describing it as fine.
 *
 * Code is read as SYNTAX: TypeScript through the compiler's parser, Java and XML with their
 * comments removed first, so a comment that quotes `givePlayerFile(` or `setDownloadListener(`
 * is never counted as a call.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { readAppConfigTargets } from './app-config-targets.mjs';

const FILE_HELPER = 'src/app/core/services/player-file-delivery.utils.ts';
const EXPORT_SITES_OWNER = 'src/app/core/services/player-file-delivery.sites.spec.ts';
const SHARE_LINKS = 'src/app/pages/saved-teams/saved-teams-export.utils.ts';
const SITE_ADDRESS = 'src/app/core/data/app-site-url.data.ts';
const CLIPBOARD_HELPER = 'src/app/shared/clipboard/clipboard-copy.utils.ts';
const BACK_BUTTON_SERVICE = 'src/app/core/services/android-back-button.service.ts';
const APP_CONFIG = 'src/app/app.config.ts';
const STYLES = 'android/app/src/main/res/values/styles.xml';
const COLORS = 'android/app/src/main/res/values/colors.xml';
const IONIC_THEME = 'src/theme/variables.scss';
const CAPACITOR_JAVA = 'node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor';

/* ------------------------------------------------------------------ reading code as syntax */

/** Removes `//` and block comments from Java, leaving string and char literals intact. */
export function stripCStyleComments(source) {
  let out = '';
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '"' || char === "'") {
      const end = findLiteralEnd(source, index, char);
      out += source.slice(index, end);
      index = end;
    } else if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      index = end === -1 ? source.length : end;
    } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
      out += ' ';
    } else {
      out += char;
      index += 1;
    }
  }

  return out;
}

function findLiteralEnd(source, start, quote) {
  let index = start + 1;

  while (index < source.length && source[index] !== quote && source[index] !== '\n') {
    index += source[index] === '\\' ? 2 : 1;
  }

  return Math.min(index + 1, source.length);
}

function stripXmlComments(source) {
  return source.replace(/<!--[\s\S]*?-->/gu, '');
}

function parseTs(source, fileName) {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function someNode(root, predicate) {
  let found = false;
  const visit = (node) => {
    if (found) return;

    if (predicate(node)) {
      found = true;
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(root);

  return found;
}

/** `object.method(...)`, matched on the names, not on the text. */
function isMethodCall(node, objectName, methodName) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === methodName &&
    (objectName === null || (ts.isIdentifier(node.expression.expression) && node.expression.expression.text === objectName))
  );
}

function isFunctionCall(node, name) {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name;
}

/** Whether `source` calls `name(...)` - a call, not a mention in a comment, string or import. */
export function callsFunction(source, fileName, name) {
  return source.includes(name) && someNode(parseTs(source, fileName), (node) => isFunctionCall(node, name));
}

/** Every module a file loads with `import('...')`. */
export function dynamicImports(source, fileName) {
  const found = new Set();
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      found.add(node.arguments[0].text);
    }

    ts.forEachChild(node, visit);
  };

  visit(parseTs(source, fileName));

  return [...found].sort();
}

/** Whether an `if (Capacitor.isNativePlatform())` returns `identifier` from its then-branch. */
export function returnsOnNative(source, fileName, identifier) {
  return someNode(
    parseTs(source, fileName),
    (node) =>
      ts.isIfStatement(node) &&
      isMethodCall(node.expression, 'Capacitor', 'isNativePlatform') &&
      someNode(
        node.thenStatement,
        (child) =>
          ts.isReturnStatement(child) &&
          child.expression !== undefined &&
          ts.isIdentifier(child.expression) &&
          child.expression.text === identifier,
      ),
  );
}

/** Whether `provideAppInitializer(() => inject(Service).init())` starts `service` at boot. */
export function startsAtBoot(source, fileName, service) {
  return someNode(
    parseTs(source, fileName),
    (node) =>
      isFunctionCall(node, 'provideAppInitializer') &&
      someNode(
        node,
        (child) =>
          isMethodCall(child, null, 'init') &&
          ts.isCallExpression(child.expression.expression) &&
          isFunctionCall(child.expression.expression, 'inject') &&
          child.expression.expression.arguments.some((argument) => ts.isIdentifier(argument) && argument.text === service),
      ),
  );
}

/** Whether a `Capacitor.getPlatform()` call is compared with the string 'android'. */
function comparesPlatformWithAndroid(root) {
  return someNode(
    root,
    (node) =>
      ts.isBinaryExpression(node) &&
      [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(node.operatorToken.kind) &&
      [node.left, node.right].some((side) => isMethodCall(side, 'Capacitor', 'getPlatform')) &&
      [node.left, node.right].some((side) => ts.isStringLiteralLike(side) && side.text === 'android'),
  );
}

/* ------------------------------------------------------------------ reading config */

/** `server: { androidScheme, hostname }` in capacitor.config.ts - null for each one not set. */
export function parseServerConfig(capacitorSource) {
  const block = capacitorSource.match(/^\s*server:\s*\{([\s\S]*?)\}/mu)?.[1] ?? '';
  const read = (key) => block.match(new RegExp(`\\b${key}:\\s*["']([^"']+)["']`, 'u'))?.[1] ?? null;

  return { androidScheme: read('androidScheme'), hostname: read('hostname') };
}

/** Capacitor's own defaults for the WebView's scheme and host, read from its Java. */
export function readCapacitorDefaults(capConfigJava, bridgeJava) {
  const config = stripCStyleComments(capConfigJava);
  const hostname = config.match(/private\s+String\s+hostname\s*=\s*"([^"]+)"/u)?.[1] ?? null;
  const schemeRef = config.match(/private\s+String\s+androidScheme\s*=\s*(?:"([^"]+)"|([A-Z_]+))/u);
  const scheme =
    schemeRef?.[1] ??
    (schemeRef?.[2]
      ? stripCStyleComments(bridgeJava).match(new RegExp(`static\\s+final\\s+String\\s+${schemeRef[2]}\\s*=\\s*"([^"]+)"`, 'u'))?.[1]
      : null) ??
    null;

  return { androidScheme: scheme, hostname };
}

/** The style Capacitor's BridgeActivity switches to after the splash: `R.style.X` in its Java. */
export function readBridgeTheme(bridgeActivityJava) {
  return stripCStyleComments(bridgeActivityJava).match(/\bsetTheme\(\s*R\.style\.(\w+)\s*\)/u)?.[1] ?? null;
}

/** A style's parent and windowBackground; `rName` is its R-class name, dots as underscores. */
export function parseAndroidStyle(stylesXml, rName) {
  for (const [, name, parent, body] of stripXmlComments(stylesXml).matchAll(
    /<style\s+name="([^"]+)"\s+parent="([^"]+)"\s*>([\s\S]*?)<\/style>/gu,
  )) {
    if (name.replaceAll('.', '_') === rName) {
      return {
        name,
        parent,
        windowBackground: body.match(/<item\s+name="android:windowBackground">\s*([^<\s]+)\s*<\/item>/u)?.[1] ?? null,
      };
    }
  }

  return null;
}

/** `@color/name` resolved against colors.xml. */
export function resolveColor(colorsXml, reference) {
  const name = reference?.match(/^@color\/(\w+)$/u)?.[1];

  return name
    ? (stripXmlComments(colorsXml).match(new RegExp(`<color\\s+name="${name}">\\s*([^<\\s]+)\\s*</color>`, 'u'))?.[1] ?? null)
    : null;
}

/** The dark-only app's own background, `--ion-background-color` in the Ionic theme. */
export function parseIonicBackground(scss) {
  return stripCStyleComments(scss).match(/--ion-background-color:\s*(#[0-9a-fA-F]{3,8})\s*;/u)?.[1] ?? null;
}

/** Whether the manifest's FileProvider serves the app's cache directory. */
export function fileProviderServesCache(manifestXml, readXmlResource) {
  const provider = stripXmlComments(manifestXml).match(
    /<provider\b[^>]*android:name="androidx\.core\.content\.FileProvider"[^>]*>([\s\S]*?)<\/provider>/u,
  );
  const resource = provider?.[1].match(/android:resource="@xml\/(\w+)"/u)?.[1];

  return resource ? /<cache-path\b/u.test(stripXmlComments(readXmlResource(resource) ?? '')) : false;
}

/* ------------------------------------------------------------------ the facts */

function listFiles(root, dir, predicate) {
  const base = path.join(root, dir);

  if (!existsSync(base)) return [];

  return readdirSync(base, { recursive: true })
    .map((entry) => `${dir}/${String(entry).replaceAll('\\', '/')}`)
    .filter(predicate)
    .sort();
}

/**
 * Every fact the capabilities below depend on, read from the tree at `root`. `capacitor` is the
 * config the native surface already parsed, so the SystemBars style has one reader.
 */
export function readWebViewFacts(root, { capacitor, capacitorSource, manifestSource, namespace }) {
  const read = (file) => readFileSync(path.join(root, file), 'utf8');
  const readIfPresent = (file) => (existsSync(path.join(root, file)) ? read(file) : null);
  const dependencies = JSON.parse(read('package.json')).dependencies ?? {};

  const activity = stripXmlComments(manifestSource).match(/<activity\b[^>]*android:name="([^"]+)"/u)?.[1] ?? null;
  const activityClass = activity?.startsWith('.') ? `${namespace}${activity}` : activity;
  const activityBase = activityClass ? `android/app/src/main/java/${activityClass.replaceAll('.', '/')}` : null;
  const activitySource = activityBase ? (readIfPresent(`${activityBase}.java`) ?? readIfPresent(`${activityBase}.kt`)) : null;
  const capacitorJava = listFiles(root, CAPACITOR_JAVA, (file) => file.endsWith('.java')).map(read);

  const shipped = listFiles(
    root,
    'src/app',
    (file) => file.endsWith('.ts') && !file.endsWith('.spec.ts') && !file.startsWith('src/app/testing/'),
  );
  const helperSource = read(FILE_HELPER);
  const server = parseServerConfig(capacitorSource);
  const defaults = readCapacitorDefaults(read(`${CAPACITOR_JAVA}/CapConfig.java`), read(`${CAPACITOR_JAVA}/Bridge.java`));
  const scheme = server.androidScheme ?? defaults.androidScheme;
  const host = server.hostname ?? defaults.hostname;
  const bridgeTheme = readBridgeTheme(read(`${CAPACITOR_JAVA}/BridgeActivity.java`));
  const style = bridgeTheme ? parseAndroidStyle(read(STYLES), bridgeTheme) : null;
  const windowBackgroundColor = resolveColor(read(COLORS), style?.windowBackground);
  const ionicBackgroundColor = parseIonicBackground(read(IONIC_THEME));
  const systemBars = capacitor.plugins.find((plugin) => plugin.name === 'SystemBars')?.settings?.style ?? null;
  const backButtonSource = read(BACK_BUTTON_SERVICE);
  const backButton = parseTs(backButtonSource, BACK_BUTTON_SERVICE);
  const { record: appConfig } = readAppConfigTargets(root);
  const suppliesWebClientId = (id) => {
    const cell = appConfig.targets.find((target) => target.id === id)?.keys?.googleWebClientId;

    return cell === undefined ? null : !cell.startsWith('nothing');
  };

  return {
    downloads: {
      mainActivityRead: activitySource !== null,
      capacitorBridgeRead: capacitorJava.length > 0,
      downloadListenerRegistered: [activitySource ?? '', ...capacitorJava].some((source) =>
        /\bsetDownloadListener\s*\(/u.test(stripCStyleComments(source)),
      ),
      helperBranchesOnNativePlatform: someNode(parseTs(helperSource, FILE_HELPER), (node) =>
        isMethodCall(node, 'Capacitor', 'isNativePlatform'),
      ),
      helperNativeImports: dynamicImports(helperSource, FILE_HELPER),
      exportSitesCallingHelper: shipped.filter((file) => file !== FILE_HELPER && callsFunction(read(file), file, 'givePlayerFile'))
        .length,
      dependencies: {
        '@capacitor/filesystem': Object.hasOwn(dependencies, '@capacitor/filesystem'),
        '@capacitor/share': Object.hasOwn(dependencies, '@capacitor/share'),
      },
      fileProviderServesCache: fileProviderServesCache(manifestSource, (name) =>
        readIfPresent(`android/app/src/main/res/xml/${name}.xml`),
      ),
    },
    origin: {
      webViewOrigin: scheme && host ? `${scheme}://${host}` : null,
      originFrom:
        server.androidScheme || server.hostname
          ? 'the server block of capacitor.config.ts'
          : "Capacitor's own defaults - capacitor.config.ts sets no server block",
      nativeShareLinksNameTheSite: returnsOnNative(read(SHARE_LINKS), SHARE_LINKS, 'APP_SITE_BASE_URL'),
    },
    clipboard: {
      secureContext: scheme === 'https',
      helperUsesClipboardApi: someNode(parseTs(read(CLIPBOARD_HELPER), CLIPBOARD_HELPER), (node) =>
        isMethodCall(node, null, 'writeText'),
      ),
      clipboardPluginInstalled: Object.hasOwn(dependencies, '@capacitor/clipboard'),
    },
    backButton: {
      appPluginInstalled: Object.hasOwn(dependencies, '@capacitor/app'),
      listensForIonBackButton: someNode(
        backButton,
        (node) =>
          isMethodCall(node, null, 'addEventListener') &&
          node.arguments[0] !== undefined &&
          ts.isStringLiteralLike(node.arguments[0]) &&
          node.arguments[0].text === 'ionBackButton',
      ),
      androidOnly: comparesPlatformWithAndroid(backButton),
      minimizesApp: someNode(backButton, (node) => isMethodCall(node, 'App', 'minimizeApp')),
      startedAtBoot: startsAtBoot(read(APP_CONFIG), APP_CONFIG, 'AndroidBackButtonService'),
    },
    systemBars: {
      style: systemBars,
      activityTheme: style?.name ?? null,
      themeParent: style?.parent ?? null,
      windowBackground: style?.windowBackground ?? null,
      windowBackgroundColor,
      ionicBackgroundColor,
      matchesIonicBackground:
        windowBackgroundColor !== null &&
        ionicBackgroundColor !== null &&
        windowBackgroundColor.toLowerCase() === ionicBackgroundColor.toLowerCase(),
    },
    googleSignIn: {
      apkSuppliesWebClientId: suppliesWebClientId('apk'),
      websiteSuppliesWebClientId: suppliesWebClientId('website'),
      gateSpecs: listFiles(root, 'src/app', (file) => file.endsWith('-google-sign-in-gate.spec.ts')).length,
    },
  };
}

/* ------------------------------------------------------------------ the record */

const LIVE = 'optc-team-builder-brain/live-artifacts';

/** The record: fixed words per capability, the facts they depend on, and where they were proven. */
export function buildWebViewCapabilities(facts) {
  const { downloads, origin, clipboard, backButton, systemBars, googleSignIn } = facts;

  return [
    {
      id: 'downloads',
      capability: 'giving the player a file - every export',
      webView:
        'An <a download> link does nothing: neither MainActivity nor Capacitor\'s bridge registers a DownloadListener, so the WebView drops the request - no file, no message, no log line.',
      app: `Every export goes through givePlayerFile (${FILE_HELPER}). In the APK it writes the file to the app cache with @capacitor/filesystem and opens Android's share sheet with @capacitor/share; the FileProvider already serves the cache directory, so no permission is added. The website keeps the anchor download.`,
      derived: downloads,
      exportSiteNamesOwnedBy: EXPORT_SITES_OWNER,
      evidence: `Before: 2026-09-23 on the published v0.6.4 APK and 2026-09-24 on v0.6.5, Settings > Export all data wrote nothing. After: 2026-09-25 on a debug build of #613 (869f63gqg) the share sheet opened with a valid all-data export. ${LIVE}/869f63gp1/`,
    },
    {
      id: 'web-share',
      capability: 'sharing a link',
      webView: `navigator.share does not exist in the Android WebView, so Saved Teams' Share falls through to copying the link. The WebView's own origin is ${origin.webViewOrigin}, so a link built from location.origin opens nothing on anyone else's phone.`,
      app: `In the APK a share link names the published site - APP_SITE_BASE_URL in ${SITE_ADDRESS} - and on the website it keeps location.origin (${SHARE_LINKS}).`,
      derived: origin,
      evidence: `Before: 2026-09-23 on the published v0.6.4 APK (Android System WebView 152) navigator.share was absent and the copied link named https://localhost. After: 2026-09-25 on a debug build of #613 the copied link named the published site and opened the team there. ${LIVE}/869f63gp1/`,
    },
    {
      id: 'clipboard',
      capability: 'copying text',
      webView: `navigator.clipboard.writeText works, because the page is a secure context: it is served from ${origin.webViewOrigin}.`,
      app: `copyTextToClipboard (${CLIPBOARD_HELPER}) is the one writer, with a manual-copy fallback when the clipboard refuses. No Capacitor clipboard plugin is installed, and none is needed.`,
      derived: clipboard,
      evidence: `2026-09-23 on the published v0.6.4 APK the copy fell back from Web Share and succeeded, with the wrong host. 2026-09-25 on a debug build of #613 the copied link was read back by pasting it into a text field. ${LIVE}/869f63gp1/`,
    },
    {
      id: 'back-button',
      capability: 'the hardware back key',
      webView:
        '@capacitor/app hands every back press to Ionic once anything listens for backbutton. Ionic closes an overlay or the side menu, or pops the route; on the root screen nothing took the key, so it was swallowed and the app stayed in front.',
      app: `AndroidBackButtonService (${BACK_BUTTON_SERVICE}), started at boot from ${APP_CONFIG}, registers the lowest-priority ionBackButton handler on native Android only, and minimizes the app when no outlet has a page behind the current one.`,
      derived: backButton,
      evidence: `Before: 2026-09-23 on v0.6.4 and 2026-09-24 on v0.6.5, two presses on Home left the app resumed. After: 2026-09-25 on a debug build of #606 (869f6tcyk) one press brought the launcher to the front, and reopening returned to the same task. ${LIVE}/869f6tcxz/`,
    },
    {
      id: 'system-bars',
      capability: 'the status and navigation bars',
      webView: `With no style set, Capacitor's SystemBars applies DEFAULT, which follows the phone. The theme Capacitor switches to after the splash, ${systemBars.activityTheme}, inherits ${systemBars.themeParent}${
        /DayNight/u.test(systemBars.themeParent ?? '')
          ? ', so the window behind the bars follows the phone too - white bars around the dark-only app on a light device.'
          : '.'
      }`,
      app: `SystemBars is configured ${systemBars.style} in capacitor.config.ts - light icons - and the theme's windowBackground is ${systemBars.windowBackground}, ${systemBars.windowBackgroundColor}, the same colour as the app's --ion-background-color in ${IONIC_THEME}.`,
      derived: systemBars,
      evidence: `Before: 2026-09-24 on v0.6.5 the bars read rgb(250,250,250) on a light device and rgb(48,48,48) on a dark one. After: 2026-09-25 on a debug build of #606 (869f6tcz0) both read rgb(7,11,23) in both modes. ${LIVE}/869f6tcxz/`,
    },
    {
      id: 'google-sign-in',
      capability: 'Google sign-in and Drive sync',
      webView:
        "The APK's app-config.js has no web client id: release-android.yml's Run Android release step supplies no APP_GOOGLE_WEB_CLIENT_ID - only the website's builds do - so GoogleAccountService.isAvailable is false in the APK.",
      app: 'Every Google sign-in and Drive surface is gated on GoogleAccountService.isAvailable, so the APK offers Export all data and Import all data in Settings instead of a sign-in that cannot work. The gate specs pin each surface, and sign-in comes back by itself once an Android build carries the id.',
      derived: googleSignIn,
      configOwnedBy: 'docs/release-contract.json (appConfigByBuildTarget), readable in docs/release-secrets-register.md',
      evidence: `Before: 2026-09-24 on v0.6.5 the side menu showed a disabled Log in row and Home offered SET UP DRIVE SYNC into a dead end. After: 2026-09-25 on a debug build of #613 (869f63gqt) there is no Log in row and Home's first action is IMPORT A FILE. ${LIVE}/869f63gp1/`,
    },
  ];
}

const EXPECTED_IDS = ['downloads', 'web-share', 'clipboard', 'back-button', 'system-bars', 'google-sign-in'];

/**
 * Every place the record's words would now be untrue. The words are fixed, so a regression has
 * to fail here rather than be regenerated into a record that still says all is well.
 */
export function checkWebViewCapabilities(capabilities) {
  const problems = [];
  const byId = new Map(capabilities.map((capability) => [capability.id, capability.derived ?? {}]));

  for (const id of EXPECTED_IDS) {
    if (!byId.has(id)) problems.push(`The record carries no "${id}" WebView capability.`);
  }

  const downloads = byId.get('downloads') ?? {};
  const origin = byId.get('web-share') ?? {};
  const clipboard = byId.get('clipboard') ?? {};
  const backButton = byId.get('back-button') ?? {};
  const systemBars = byId.get('system-bars') ?? {};
  const googleSignIn = byId.get('google-sign-in') ?? {};
  const say = (id, fact, why) => problems.push(`${id}: ${fact} - ${why}`);

  if (!downloads.mainActivityRead || !downloads.capacitorBridgeRead) {
    say('downloads', 'MainActivity or the Capacitor bridge source was not read', 'so "no DownloadListener" would be true of nothing.');
  }

  if (downloads.downloadListenerRegistered !== false) {
    say('downloads', 'a DownloadListener is now registered', 'the WebView may download after all. Re-verify an export on the emulator and rewrite this entry.');
  }

  if (!downloads.helperBranchesOnNativePlatform) {
    say('downloads', 'givePlayerFile no longer branches on Capacitor.isNativePlatform()', 'so an APK export is an anchor download again, which writes nothing (869f63gqg).');
  }

  for (const plugin of ['@capacitor/filesystem', '@capacitor/share']) {
    if (!(downloads.helperNativeImports ?? []).includes(plugin) || !downloads.dependencies?.[plugin]) {
      say('downloads', `the native export path no longer both imports and depends on ${plugin}`, 'so the share sheet cannot open.');
    }
  }

  if (!(downloads.exportSitesCallingHelper > 0)) {
    say('downloads', 'no export site calls givePlayerFile', 'the count this record carries is of nothing.');
  }

  if (!downloads.fileProviderServesCache) {
    say('downloads', "the FileProvider no longer serves the cache directory", 'so the share sheet cannot read the file the export writes.');
  }

  if (!origin.webViewOrigin) {
    say('web-share', "the WebView's origin could not be read from capacitor.config.ts or Capacitor's defaults", 'so this record cannot say what location.origin is in the APK.');
  }

  if (!origin.nativeShareLinksNameTheSite) {
    say('web-share', 'share links no longer name APP_SITE_BASE_URL on native', `so a copied link names ${origin.webViewOrigin ?? "the WebView's origin"} again and opens nothing (869f63gqg).`);
  }

  if (!clipboard.secureContext) {
    say('clipboard', `the WebView origin ${origin.webViewOrigin ?? ''} is not https`, 'so the page is not a secure context and navigator.clipboard is unavailable.');
  }

  if (!clipboard.helperUsesClipboardApi) {
    say('clipboard', 'copyTextToClipboard no longer calls clipboard.writeText', 'so this entry no longer describes how the app copies.');
  }

  for (const [fact, why] of [
    ['appPluginInstalled', '@capacitor/app is what delivers the key to Ionic.'],
    ['listensForIonBackButton', 'no handler is registered, so back on Home is swallowed again (869f6tcyk).'],
    ['androidOnly', 'the handler is no longer limited to native Android.'],
    ['minimizesApp', 'the handler no longer minimizes the app.'],
    ['startedAtBoot', 'nothing starts the service, so back on Home is swallowed again (869f6tcyk).'],
  ]) {
    if (!backButton[fact]) say('back-button', `${fact} is false`, why);
  }

  if (systemBars.style !== 'DARK') {
    say(
      'system-bars',
      systemBars.style ? `SystemBars style is ${systemBars.style}, not DARK` : 'SystemBars sets no style, so it is DEFAULT, not DARK',
      'so the bars follow the phone around the dark-only app again (869f6tcz0).',
    );
  }

  if (!systemBars.matchesIonicBackground) {
    say(
      'system-bars',
      `the window behind the bars is ${systemBars.windowBackgroundColor ?? 'unset'} and the app is ${systemBars.ionicBackgroundColor ?? 'unknown'}`,
      'so the bars no longer match the app (869f6tcz0).',
    );
  }

  if (googleSignIn.apkSuppliesWebClientId !== false) {
    say(
      'google-sign-in',
      "release-android.yml's APK build now supplies APP_GOOGLE_WEB_CLIENT_ID, or it could not be read",
      'so "no sign-in in the APK" is no longer known to be true. Prove sign-in on the emulator, then rewrite this entry.',
    );
  }

  if (!(googleSignIn.gateSpecs > 0)) {
    say('google-sign-in', 'no *-google-sign-in-gate.spec.ts exists', 'nothing pins the gating this entry describes.');
  }

  return problems;
}
