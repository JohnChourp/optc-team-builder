import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  APP_CONFIG_BUILD_TARGETS,
  SECTION_END,
  SECTION_START,
  WRITER_PATH,
  deriveAppConfigTargets,
  describeSupply,
  formatAppConfigTargetsMarkdown,
  measureUnsupplied,
  parseWriter,
  readAppConfigTargets,
  readWorkflows,
  resolveWriterRuns,
  stepInvokesScript,
} from './lib/app-config-targets.mjs';

/*
 * 869f63gu4. Which app-config.js each build gets. The website carried sign-in and analytics and
 * the APK carried neither, and nothing said so - so the table is DERIVED from the writer, the npm
 * script chain and the workflows, and these tests keep it derived and keep it complete.
 */

type Workflow = { jobs: Record<string, { env?: Record<string, string>; steps: Record<string, unknown>[] }> };
type WorkflowFile = { file: string; workflow: Workflow };

const writerSource = readFileSync(WRITER_PATH, 'utf8');
const packageScripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts as Record<string, string>;
const writer = parseWriter(writerSource);
const unsupplied = measureUnsupplied(process.cwd(), writer.variables);

function world(mutate: (workflows: WorkflowFile[]) => void = () => {}, scripts = packageScripts) {
  const workflows = structuredClone(readWorkflows(process.cwd())) as WorkflowFile[];
  mutate(workflows);

  return deriveAppConfigTargets({ writerSource, unsupplied, workflows, packageScripts: scripts });
}

function step(workflows: WorkflowFile[], file: string, job: string, name: string) {
  const found = workflows.find((entry) => entry.file === file)?.workflow.jobs[job]?.steps.find((s) => s['name'] === name);

  expect(found, `${file} > ${job} > ${name} must exist for this test to mean anything`).toBeDefined();

  return found as { env?: Record<string, string>; run?: string; name: string };
}

describe('app-config targets - read from the writer, not listed', () => {
  it('reads every key, the variable it comes from, and the two gates from the writer syntax', () => {
    expect(writer.keys).toEqual([
      { key: 'ga4MeasurementId', variable: 'APP_GA4_MEASUREMENT_ID' },
      { key: 'googleDriveBackendUrl', variable: 'APP_GOOGLE_DRIVE_BACKEND_URL' },
      { key: 'googleDriveFolderName', variable: 'APP_GOOGLE_DRIVE_FOLDER_NAME' },
      { key: 'googleIosClientId', variable: 'APP_GOOGLE_IOS_CLIENT_ID' },
      { key: 'googleWebClientId', variable: 'APP_GOOGLE_WEB_CLIENT_ID' },
    ]);
    expect(writer.gates).toEqual([
      { key: 'googleIosClientId', flags: ['--require-google-ios-client-id'], variables: ['APP_REQUIRE_GOOGLE_IOS_CLIENT_ID'] },
      { key: 'googleWebClientId', flags: ['--require-google-web-client-id'], variables: ['APP_REQUIRE_GOOGLE_WEB_CLIENT_ID'] },
    ]);
  });

  it('does not read a variable out of a comment that quotes one', () => {
    const parsed = parseWriter(
      [
        '// const ghost = normalize(process.env["APP_GHOST"]);',
        '/* process.env["APP_ALSO_GHOST"] */',
        'const realKey = normalize(process.env["APP_REAL"]);',
      ].join('\n'),
    );

    expect(parsed.keys).toEqual([{ key: 'realKey', variable: 'APP_REAL' }]);
    expect(parsed.variables).toEqual(['APP_REAL']);
  });

  it('measures what each key holds with nothing supplied by running a copy, and leaves the real file alone', () => {
    const realConfig = 'public/app-config.js';
    const before = existsSync(realConfig) ? readFileSync(realConfig, 'utf8') : null;
    const measured = measureUnsupplied(process.cwd(), writer.variables);
    const after = existsSync(realConfig) ? readFileSync(realConfig, 'utf8') : null;

    // Only the folder name has a default; that is why the APK carries it and nothing else.
    expect(measured).toEqual({
      ga4MeasurementId: 'empty',
      googleDriveBackendUrl: 'empty',
      googleDriveFolderName: 'default',
      googleIosClientId: 'empty',
      googleWebClientId: 'empty',
    });
    expect(after).toBe(before);
  });

  it('follows npm run to the call that writes the file, and the flags it passes', () => {
    expect(resolveWriterRuns(packageScripts, 'build:pages')).toEqual([
      { script: 'config:app:web-strict', flags: ['--require-google-web-client-id'] },
    ]);
    expect(resolveWriterRuns(packageScripts, 'build:ionic')).toEqual([{ script: 'config:app', flags: [] }]);
    expect(resolveWriterRuns({ 'build:x': 'ng build' }, 'build:x')).toEqual([]);
  });

  it('matches the build script as a whole name, in run:, in an env command, or as an env value', () => {
    expect(stepInvokesScript({ run: 'npm run build:pages' }, 'build:pages')).toBe(true);
    expect(stepInvokesScript({ env: { BUILD_MOBILE_COMMAND: 'npm run build:ionic && npx cap sync android' } }, 'build:ionic')).toBe(true);
    expect(stepInvokesScript({ env: { PWA_SHELL_BUILD_SCRIPT: 'build:pages' }, run: 'npm run test:pwa-shell' }, 'build:pages')).toBe(true);
    expect(stepInvokesScript({ run: 'npm run build:pages-preview' }, 'build:pages')).toBe(false);
    expect(stepInvokesScript({ run: 'npm run build' }, 'build:pages')).toBe(false);
  });
});

describe('app-config targets - the table the real tree produces', () => {
  const { record, problems } = readAppConfigTargets();
  const target = (id: string) => record.targets.find((entry: { id: string }) => entry.id === id);

  it('has no problems, and covers every declared build', () => {
    expect(problems).toEqual([]);
    expect(record.targets.map((entry: { id: string }) => entry.id)).toEqual(APP_CONFIG_BUILD_TARGETS.map((entry) => entry.id));
  });

  it('builds the APK with nothing supplied, so only the default survives and nothing is required', () => {
    expect(target('apk')).toMatchObject({
      reachesPlayers: true,
      requires: [],
      keys: {
        ga4MeasurementId: 'nothing - empty',
        googleDriveBackendUrl: 'nothing - empty',
        googleDriveFolderName: "nothing - the writer's default",
        googleIosClientId: 'nothing - empty',
        googleWebClientId: 'nothing - empty',
      },
    });
  });

  it('builds the website from two steps that agree, and fails its build without the web client id', () => {
    const website = target('website');

    expect(website.steps.map((entry: { workflow: string; environment: string }) => [entry.workflow, entry.environment])).toEqual([
      ['.github/workflows/deploy-pages.yml', 'github-pages'],
      ['.github/workflows/release-android.yml', 'github-pages'],
    ]);
    expect(website.requires).toEqual([{ key: 'googleWebClientId', by: '--require-google-web-client-id' }]);
    expect(website.keys).toMatchObject({
      ga4MeasurementId: 'secret APP_GA4_MEASUREMENT_ID',
      googleIosClientId: 'secret APP_GOOGLE_IOS_CLIENT_ID',
      googleWebClientId: 'secret APP_GOOGLE_WEB_CLIENT_ID',
    });
  });

  it('says a fallback exists without ever copying it', () => {
    // The fallback is read out of the workflow here, at run time, so this file never holds it.
    const raw = readFileSync('.github/workflows/guide-discoverability.yml', 'utf8');
    const fallback = raw.match(/APP_GOOGLE_WEB_CLIENT_ID:.*\|\|\s*'([^']+)'/u)?.[1];

    expect(fallback, 'the fallback this test guards must exist').toBeTruthy();
    expect(target('guide-discoverability').keys.googleWebClientId).toBe(
      'secret APP_GOOGLE_WEB_CLIENT_ID, else a fallback written in the workflow',
    );
    expect(JSON.stringify(record)).not.toContain(fallback);
  });

  it('is what docs/release-contract.json and the register section carry', () => {
    const committed = JSON.parse(readFileSync('docs/release-contract.json', 'utf8'));
    const register = readFileSync('docs/release-secrets-register.md', 'utf8');
    const section = formatAppConfigTargetsMarkdown(record);

    expect(committed.appConfigByBuildTarget).toEqual(record);
    expect(section.startsWith(SECTION_START)).toBe(true);
    expect(section.endsWith(SECTION_END)).toBe(true);
    expect(register).toContain(section);
  });
});

describe('app-config targets - the guard', () => {
  const committed = JSON.parse(readFileSync('docs/release-contract.json', 'utf8')).appConfigByBuildTarget;
  const releaseAndroid = '.github/workflows/release-android.yml';

  it('goes stale when a build step starts supplying a key', () => {
    // The mutation the table exists for: the APK given the web client id, record not regenerated.
    const { record, problems } = world((workflows) => {
      const apk = step(workflows, releaseAndroid, 'release', 'Run Android release');
      apk.env = { ...apk.env, APP_GOOGLE_WEB_CLIENT_ID: '${{ secrets.APP_GOOGLE_WEB_CLIENT_ID }}' };
    });

    expect(problems).toEqual([]);
    expect(record.targets.find((entry: { id: string }) => entry.id === 'apk').keys.googleWebClientId).toBe(
      'secret APP_GOOGLE_WEB_CLIENT_ID',
    );
    expect(record).not.toEqual(committed);
  });

  it('fails when a declared build step moves', () => {
    const { problems } = world((workflows) => {
      step(workflows, releaseAndroid, 'release', 'Run Android release').name = 'Run the Android release';
    });

    expect(problems).toEqual([expect.stringContaining('"Run Android release" was not found')]);
  });

  it('fails when the two website builds are given different keys', () => {
    const { problems } = world((workflows) => {
      delete step(workflows, releaseAndroid, 'deploy-pages', 'Build GitHub Pages artifact').env?.['APP_GA4_MEASUREMENT_ID'];
    });

    expect(problems).toEqual([expect.stringContaining('website is built by 2 steps that supply different keys')]);
  });

  it.each([
    [
      'a job-level env',
      (workflows: WorkflowFile[]) => {
        const job = workflows.find((entry) => entry.file === '.github/workflows/test.yml')!.workflow.jobs;
        const [first] = Object.keys(job);
        job[first!]!.env = { APP_GA4_MEASUREMENT_ID: '${{ secrets.APP_GA4_MEASUREMENT_ID }}' };
      },
    ],
    [
      'a run: that exports it to later steps',
      (workflows: WorkflowFile[]) => {
        const release = workflows.find((entry) => entry.file === releaseAndroid)!.workflow.jobs['release']!;
        release.steps.push({ name: 'Export', run: 'echo "APP_GOOGLE_WEB_CLIENT_ID=x" >> "$GITHUB_ENV"' });
      },
    ],
    [
      'a value that inlines it into the build command',
      (workflows: WorkflowFile[]) => {
        const apk = step(workflows, releaseAndroid, 'release', 'Run Android release');
        apk.env = { ...apk.env, BUILD_MOBILE_COMMAND: 'APP_GOOGLE_WEB_CLIENT_ID=x npm run build:ionic && npx cap sync android' };
      },
    ],
  ])('fails when a workflow names a writer variable outside a declared step: %s', (_shape, mutate) => {
    const { problems } = world(mutate);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("outside a declared build step's env:");
  });

  it('does not count a secret that shares a variable name but is passed to another variable', () => {
    // Negative control for the rule above: the secrets are NAMED like the variables.
    const { problems } = world((workflows) => {
      const release = workflows.find((entry) => entry.file === releaseAndroid)!.workflow.jobs['release']!;
      release.steps.push({ name: 'Other', env: { SOMETHING_ELSE: '${{ secrets.APP_GA4_MEASUREMENT_ID }}' }, run: 'true' });
    });

    expect(problems).toEqual([]);
  });

  it('fails on a variable the writer never reads, which is how a misspelt secret reaches no key', () => {
    const { problems } = world((workflows) => {
      const website = step(workflows, '.github/workflows/deploy-pages.yml', 'build', 'Build GitHub Pages artifact');
      website.env = { ...website.env, APP_GA: '${{ secrets.APP_GA }}' };
    });

    expect(problems).toEqual(
      expect.arrayContaining([expect.stringContaining('supplies APP_GA, which scripts/write-app-config.mjs never reads')]),
    );
  });

  it('fails when a build script stops running the writer', () => {
    const scripts = { ...packageScripts, 'build:pages': 'ng build --configuration production' };
    const { problems } = world(undefined, scripts);

    expect(problems).toEqual(
      expect.arrayContaining([expect.stringContaining('`npm run build:pages` never runs scripts/write-app-config.mjs')]),
    );
  });

  it('names where a literal comes from, and never the literal', () => {
    const literal = 'Fixture Folder Written Inline';
    const { record } = world((workflows) => {
      const apk = step(workflows, releaseAndroid, 'release', 'Run Android release');
      apk.env = { ...apk.env, APP_GOOGLE_DRIVE_FOLDER_NAME: literal };
    });

    expect(record.targets.find((entry: { id: string }) => entry.id === 'apk').keys.googleDriveFolderName).toBe(
      'a value written in the workflow',
    );
    expect(JSON.stringify(record)).not.toContain(literal);
  });

  it('describes every supply shape without quoting it', () => {
    expect(describeSupply('${{ secrets.A_SECRET }}')).toBe('secret A_SECRET');
    expect(describeSupply("${{ secrets.A_SECRET || 'x' }}")).toBe('secret A_SECRET, else a fallback written in the workflow');
    expect(describeSupply('${{ vars.A_VARIABLE }}')).toBe('configuration variable A_VARIABLE');
    expect(describeSupply('prefix-${{ github.sha }}')).toBe('an expression in the workflow');
    expect(describeSupply('')).toBe('an empty value in the workflow');
  });
});
