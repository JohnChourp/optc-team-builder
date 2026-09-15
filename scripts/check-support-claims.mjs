#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * The "What this app supports" screen cannot drift away from the configuration.
 *
 * 869f17h3g. That screen tells a player which browsers are tested, what the
 * Android app asks for and why, and what keeps working without a connection.
 * Every one of those is a promise, and every one of them is decided by a file
 * somewhere else - a manifest, a Playwright config, a service-worker config.
 *
 * Without this, adding one permission makes the screen quietly untrue to every
 * reader, and nothing goes red. So the screen's claims are declared as data in
 * `supported.data.ts` and checked here against the real thing:
 *
 *   A. the declared Android permissions are exactly the manifest's, in both
 *      directions - a new permission fails, and so does a stale claim;
 *   B. every declared permission has a row on the screen, so the count a player
 *      reads matches the count the manifest holds;
 *   C. the browser engines claimed as tested are exactly Playwright's projects;
 *   D. the offline asset groups named are exactly ngsw-config's.
 *
 * Run: npm run i18n:support-claims
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const MANIFEST_PATH = 'android/app/src/main/AndroidManifest.xml';
export const PLAYWRIGHT_PATH = 'playwright.config.ts';
export const NGSW_PATH = 'ngsw-config.json';

export function parseManifestPermissions(xml) {
  return [...xml.matchAll(/<uses-permission[^>]*android:name="([^"]+)"/gu)].map((m) => m[1]).sort();
}

export function parsePlaywrightProjects(config) {
  const projects = config.slice(config.indexOf('projects:'));

  return [...projects.matchAll(/name: '([a-z]+)'/gu)].map((m) => m[1]);
}

export function parseAssetGroups(ngsw) {
  return (ngsw.assetGroups ?? []).map((group) => group.name);
}

/**
 * The screen's claims, read out of the source text rather than imported.
 *
 * Importing the `.ts` from this `.mjs` works only through Node's type stripping,
 * warns on every run, and would make this check depend on the runtime's TypeScript
 * support rather than on the file's contents. Every other guard here reads source,
 * so this one does too.
 */
export function parseSupportedData(source) {
  const stringArray = (name) => {
    const match = source.match(new RegExp(`${name} = \\[([\\s\\S]*?)\\]`, 'u'));

    return match ? [...match[1].matchAll(/'([^']+)'/gu)].map((entry) => entry[1]) : [];
  };

  const sections = [...source.matchAll(/\{ id: '([a-zA-Z]+)', rows: \[([^\]]*)\] \}/gu)].map(
    ([, id, rows]) => ({ id, rows: [...rows.matchAll(/'([^']+)'/gu)].map((entry) => entry[1]) }),
  );

  return {
    DECLARED_ANDROID_PERMISSIONS: stringArray('DECLARED_ANDROID_PERMISSIONS'),
    TESTED_BROWSER_ENGINES: stringArray('TESTED_BROWSER_ENGINES'),
    OFFLINE_ASSET_GROUPS: stringArray('OFFLINE_ASSET_GROUPS'),
    SUPPORTED_SECTIONS: sections,
  };
}

export function checkSupportClaims({ manifest, playwright, ngsw, data }) {
  const errors = [];
  const declared = [...data.DECLARED_ANDROID_PERMISSIONS].sort();
  const actual = parseManifestPermissions(manifest);

  /* A. Both directions: a new permission and a stale claim are both defects. */
  for (const permission of actual) {
    if (!declared.includes(permission)) {
      errors.push(
        `${MANIFEST_PATH} declares ${permission}, which the supported screen does not mention. A player reading that screen would not know the app asks for it.`,
      );
    }
  }

  for (const permission of declared) {
    if (!actual.includes(permission)) {
      errors.push(
        `The supported screen claims ${permission} is requested, but ${MANIFEST_PATH} no longer declares it.`,
      );
    }
  }

  /* B. The screen has to have a row per permission, not just a matching list. */
  const permissionRows = data.SUPPORTED_SECTIONS.find((section) => section.id === 'permissions');

  if (!permissionRows) {
    errors.push('The supported screen has no `permissions` section.');
  } else {
    /* One row per permission, plus the "nothing else" row that bounds the list. */
    const expected = declared.length + 1;

    if (permissionRows.rows.length !== expected) {
      errors.push(
        `The supported screen lists ${permissionRows.rows.length} permission row(s) for ${declared.length} declared permission(s); expected ${expected} including the "nothing else" row.`,
      );
    }
  }

  /* C. */
  const projects = parsePlaywrightProjects(playwright);
  const claimedEngines = [...data.TESTED_BROWSER_ENGINES];

  for (const engine of claimedEngines) {
    if (!projects.includes(engine)) {
      errors.push(
        `The supported screen claims ${engine} is tested, but ${PLAYWRIGHT_PATH} declares no such project.`,
      );
    }
  }

  for (const project of projects) {
    if (!claimedEngines.includes(project)) {
      errors.push(
        `${PLAYWRIGHT_PATH} declares the project ${project}, which the supported screen does not claim. Either claim it or stop configuring it.`,
      );
    }
  }

  /* D. */
  const groups = parseAssetGroups(ngsw);
  const claimedGroups = [...data.OFFLINE_ASSET_GROUPS];

  for (const group of claimedGroups) {
    if (!groups.includes(group)) {
      errors.push(
        `The offline claim names the asset group '${group}', which ${NGSW_PATH} no longer has. What works without a connection has changed.`,
      );
    }
  }

  for (const group of groups) {
    if (!claimedGroups.includes(group)) {
      errors.push(
        `${NGSW_PATH} caches the asset group '${group}', which the offline claim does not account for.`,
      );
    }
  }

  return { errors };
}

export const DATA_PATH = 'src/app/pages/supported/supported.data.ts';

function main() {
  const read = (relative) => readFileSync(path.join(projectRoot, relative), 'utf8');
  const data = parseSupportedData(read(DATA_PATH));

  if (!data.DECLARED_ANDROID_PERMISSIONS.length || !data.SUPPORTED_SECTIONS.length) {
    console.error(`support claims check failed: could not read the claims out of ${DATA_PATH}.`);
    process.exit(1);
  }

  const { errors } = checkSupportClaims({
    manifest: read(MANIFEST_PATH),
    playwright: read(PLAYWRIGHT_PATH),
    ngsw: JSON.parse(read(NGSW_PATH)),
    data,
  });

  if (errors.length) {
    console.error('support claims check failed:\n');
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `[supported] ${data.DECLARED_ANDROID_PERMISSIONS.length} permission(s), ${data.TESTED_BROWSER_ENGINES.length} engine(s) and ${data.OFFLINE_ASSET_GROUPS.length} offline group(s) match the real configuration.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
