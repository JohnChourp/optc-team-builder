/**
 * The native surface as data: app id, platforms, plugins, permissions, distribution.
 *
 * 869f13d80. Five files held one surface and nothing summarised it -
 * `capacitor.config.ts`, `android/app/build.gradle`, the Android manifest,
 * `apk-updater.plugin.ts`, and (until 2026-09-20) an `ios/` project. That is the part of
 * this repository with the highest consequence per line: a permission, a plugin, an app id,
 * a signing config.
 *
 * The permissions half is deliberately NOT re-derived here. `check-support-claims.mjs`
 * already generates it from the manifest and fails in both directions against the
 * `/supported` screen, so a second reader of the same file would be a second thing to
 * drift. This record cites that guard instead of repeating it - which is the whole reason
 * the task asked for a record rather than another checker.
 */

/** Parses `appId`, `appName`, `webDir` and the plugin block out of the Capacitor config. */
export function parseCapacitorConfig(source) {
  const scalar = (key) => source.match(new RegExp(`${key}:\\s*["']([^"']+)["']`, 'u'))?.[1] ?? null;
  const pluginBlock = source.match(/plugins:\s*\{([\s\S]*?)\n\s{2}\},/u)?.[1] ?? '';

  const plugins = [];
  for (const match of pluginBlock.matchAll(/^\s{4}(\w+):\s*\{([\s\S]*?)^\s{4}\},/gmu)) {
    const [, name, body] = match;
    const providers = [...body.matchAll(/^\s*(\w+):\s*(true|false),?$/gmu)]
      .map(([, provider, enabled]) => ({ provider, enabled: enabled === 'true' }))
      .sort((a, b) => a.provider.localeCompare(b.provider));
    /*
     * 869f6tcz0. A plugin can be configured by a value rather than by switching providers
     * on: `SystemBars: { style: "DARK" }` enables nothing and says how the shell looks.
     * Recorded as it is written, so the record carries it and the check below can tell it
     * from a plugin configured with nothing at all.
     */
    const settings = Object.fromEntries(
      [...body.matchAll(/^\s*(\w+):\s*["']([^"']*)["'],?$/gmu)].map(([, key, value]) => [key, value]),
    );

    plugins.push({ name, providers, ...(Object.keys(settings).length > 0 ? { settings } : {}) });
  }

  return { appId: scalar('appId'), appName: scalar('appName'), webDir: scalar('webDir'), plugins };
}

/** The Android identity, read from the real gradle file. */
export function parseAndroidIdentity(source) {
  return {
    namespace: source.match(/namespace\s*=\s*"([^"]+)"/u)?.[1] ?? null,
    applicationId: source.match(/applicationId\s+"([^"]+)"/u)?.[1] ?? null,
    minSdk: null,
    targetSdk: null,
  };
}

/** `minSdkVersion = 24` and friends live in variables.gradle, not build.gradle. */
export function parseSdkVersions(source) {
  const read = (key) => Number(source.match(new RegExp(`${key}\\s*=\\s*(\\d+)`, 'u'))?.[1] ?? NaN);

  return { minSdk: read('minSdkVersion'), targetSdk: read('targetSdkVersion'), compileSdk: read('compileSdkVersion') };
}

/** Manifest facts that are NOT permissions - those belong to check-support-claims.mjs. */
export function parseManifestBehaviour(source) {
  const configChanges = source.match(/android:configChanges="([^"]+)"/u)?.[1] ?? '';

  return {
    configChanges: configChanges ? configChanges.split('|').sort() : [],
    launchMode: source.match(/android:launchMode="([^"]+)"/u)?.[1] ?? null,
    // Undeclared means `true` from API 24, which is why split screen already works.
    resizeableActivityDeclared: /android:resizeableActivity=/u.test(source),
    permissionCount: [...source.matchAll(/<uses-permission[^>]*android:name="([^"]+)"/gu)].length,
  };
}

/**
 * What must stay true of the surface. Each entry is a claim a reader would otherwise have
 * to re-derive from five files, and each is checked rather than asserted.
 */
export function checkNativeSurface(surface) {
  const problems = [];

  if (surface.capacitor.appId !== surface.android.applicationId) {
    problems.push(
      `capacitor.config.ts declares appId ${surface.capacitor.appId} and build.gradle declares applicationId ${surface.android.applicationId}. A mismatch ships an app that cannot update itself.`,
    );
  }

  if (surface.capacitor.appId !== surface.android.namespace) {
    problems.push(
      `appId ${surface.capacitor.appId} and namespace ${surface.android.namespace} disagree.`,
    );
  }

  /*
   * The plugin providers are the highest-consequence line in the whole record: switching
   * one from false to true adds an authentication path, a dependency and a disclosure
   * obligation, and nothing else in the repository would notice.
   */
  for (const plugin of surface.capacitor.plugins) {
    const enabled = plugin.providers.filter((p) => p.enabled).map((p) => p.provider);

    if (plugin.providers.length === 0) {
      if (!plugin.settings) {
        problems.push(
          `${plugin.name} is configured with no providers and no settings, so the record cannot say what it enables.`,
        );
      }

      continue;
    }

    if (enabled.length === 0) {
      problems.push(`${plugin.name} has every provider disabled. Remove the plugin, or the config claims a capability nothing uses.`);
    }
  }

  // Split screen depends on these, measured in 869f13d9z.
  for (const required of ['screenSize', 'screenLayout', 'smallestScreenSize', 'orientation']) {
    if (!surface.android.configChanges.includes(required)) {
      problems.push(
        `AndroidManifest no longer declares configChanges "${required}". The activity would be recreated on a split-screen resize, and a restored session would lose its place (869f13d9z).`,
      );
    }
  }

  if (surface.android.minSdk < 24) {
    problems.push(
      `minSdkVersion is ${surface.android.minSdk}. Below 24 an undeclared resizeableActivity no longer defaults to true, so the split-screen claim in the record would stop being free.`,
    );
  }

  if (surface.distribution.channel !== 'github-release-sideload') {
    problems.push(
      `The distribution channel is recorded as ${surface.distribution.channel}. Store distribution removes REQUEST_INSTALL_PACKAGES and the self-updater, so the /supported copy and the owner's 2026-09-21 decision both need revisiting.`,
    );
  }

  return problems;
}
