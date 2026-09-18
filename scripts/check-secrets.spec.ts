import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { prePushRanges, scanCommits, scanDirectory, scanHistory, scanStaged } from './check-secrets.mjs';
import { installGitHooks } from './install-git-hooks.mjs';
import { SECRET_FIXTURES, fill } from './lib/secret-fixture.mjs';
import { SECRET_RULES, formatFinding, isProbablyBinary, scanText, scanUnifiedDiff } from './lib/secret-scan.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const read = (relativePath: string): string => readFileSync(resolve(ROOT, relativePath), 'utf8');
const ruleIds = SECRET_RULES.map((rule) => rule.id);

const temporaryDirectories: string[] = [];

function tempRepo(): string {
  const directory = mkdtempSync(join(tmpdir(), 'optc-secrets-'));
  temporaryDirectories.push(directory);
  const run = (...args: string[]) => spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
  run('init', '-q', '-b', 'main');
  run('config', 'user.email', 'test@example.invalid');
  run('config', 'user.name', 'Secret Scan Test');
  run('config', 'commit.gpgsign', 'false');
  run('config', 'core.autocrlf', 'false');
  return directory;
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

afterEach(() => {
  while (temporaryDirectories.length) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe('secret rules', () => {
  /*
   * 869f33bru. Bidirectional on purpose: a rule cannot ship without a value that proves it fires,
   * and a fixture cannot outlive the rule it proves. Deleting any rule turns this red.
   */
  it('has exactly one runtime fixture per rule', () => {
    expect(Object.keys(SECRET_FIXTURES).sort()).toEqual([...ruleIds].sort());
  });

  /*
   * Both as written and as an escaped JSON string - the usual way a key file or a config line is
   * pasted into code. The first draft of three rules matched only the first form.
   */
  it.each(ruleIds)('detects a %s, raw and JSON-escaped', (ruleId) => {
    const value = SECRET_FIXTURES[ruleId as keyof typeof SECRET_FIXTURES]();

    for (const text of [`leaked: ${value}\n`, `const leaked = ${JSON.stringify(value)};\n`]) {
      expect(scanText(text, { path: 'fixture.ts' }).map((finding) => finding.ruleId), text).toContain(ruleId);
    }
  });

  it('reports the line and column of a finding', () => {
    const text = ['first line', 'second line', `  key: "${SECRET_FIXTURES['google-api-key']()}"`].join('\n');

    expect(scanText(text, { path: 'a.ts' })).toEqual([
      expect.objectContaining({ path: 'a.ts', line: 3, column: 9, ruleId: 'google-api-key' }),
    ]);
  });

  it('never prints the value it found', () => {
    const value = SECRET_FIXTURES['github-token']();
    const [finding] = scanText(value, { path: 'a.ts' });

    expect(formatFinding(finding)).not.toContain(value);
    expect(formatFinding(finding)).toContain(`(${value.length} chars)`);
  });

  it('does not match a key shape embedded inside a longer token', () => {
    expect(scanText(`x${SECRET_FIXTURES['google-api-key']()}`)).toEqual([]);
    expect(scanText(`${SECRET_FIXTURES['aws-access-key-id']()}X`)).toEqual([]);
  });

  /*
   * The values this project publishes on purpose, and the placeholders documentation uses. If one
   * of these starts failing, the rule is wrong - there is no allowlist to add it to.
   */
  it.each([
    ['a GA4 measurement id', 'ga4MeasurementId: "G-ABC123DEF4"'],
    ['a Google OAuth client id', 'googleWebClientId: "123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com"'],
    ['a URL with placeholder credentials', 'postgres://user:password@localhost:5432/db'],
    ['a URL with env-var credentials', 'postgres://${DB_USER}:${DB_PASSWORD}@db.internal/app'],
    ['a URL with angle-bracket placeholders', 'mongodb+srv://<user>:<password>@cluster0.example.net'],
    ['i18n copy about passwords', '"password": "Enter your password to continue"'],
    ['a placeholder api key', 'api_key = "YOUR_API_KEY_GOES_HERE"'],
    ['a low-entropy assignment', 'password = "aaaaaaaaaaaaaaaa1111"'],
    ['a plain https URL', 'https://optcteambuilder.com/assets/data/optc-seed.sqlite.gz'],
    ['a git commit sha', 'commit 190f58527a3c1e0b9d6f4a2e8c7b5d3f1a9e0c2b'],
  ])('lets through %s', (_label, text) => {
    expect(scanText(text)).toEqual([]);
  });

  it('treats a buffer with a NUL byte as binary', () => {
    expect(isProbablyBinary(Buffer.from([0x50, 0x4b, 0x00, 0x01]))).toBe(true);
    expect(isProbablyBinary(Buffer.from('plain text', 'utf8'))).toBe(false);
  });
});

describe('scanUnifiedDiff', () => {
  it('scans added lines only, at the line they land on', () => {
    const value = SECRET_FIXTURES['stripe-secret-key']();
    const diff = [
      'diff --git a/src/config.ts b/src/config.ts',
      '--- a/src/config.ts',
      '+++ b/src/config.ts',
      '@@ -10,3 +10,4 @@ export const config = {',
      '   one: 1,',
      `-  removed: "${SECRET_FIXTURES['github-token']()}",`,
      '   two: 2,',
      `+  added: "${value}",`,
      '+  three: 3,',
    ].join('\n');

    expect(scanUnifiedDiff(diff, { commit: 'abc123' })).toEqual([
      expect.objectContaining({ path: 'src/config.ts', line: 12, ruleId: 'stripe-secret-key', commit: 'abc123' }),
    ]);
  });

  it('ignores a deleted file', () => {
    const diff = [
      'diff --git a/old.ts b/old.ts',
      '--- a/old.ts',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      `-${SECRET_FIXTURES['npm-token']()}`,
    ].join('\n');

    expect(scanUnifiedDiff(diff)).toEqual([]);
  });
});

describe('prePushRanges', () => {
  const zero = '0'.repeat(40);
  const local = 'a'.repeat(40);
  const remote = 'b'.repeat(40);

  it('scans only what the remote does not have yet', () => {
    expect(prePushRanges(`refs/heads/x ${local} refs/heads/x ${remote}\n`)).toEqual([[`${remote}..${local}`]]);
  });

  it('scans every commit not on the remote for a new branch', () => {
    expect(prePushRanges(`refs/heads/x ${local} refs/heads/x ${zero}\n`, 'origin')).toEqual([
      [local, '--not', '--remotes=origin'],
    ]);
  });

  it('skips a branch deletion', () => {
    expect(prePushRanges(`(delete) ${zero} refs/heads/x ${remote}\n`)).toEqual([]);
  });
});

describe('git layers, against a real temporary repository', () => {
  it('pre-commit: refuses a staged secret and passes a clean stage', () => {
    const repo = tempRepo();
    writeFileSync(join(repo, 'clean.txt'), 'nothing to see\n');
    git(repo, 'add', 'clean.txt');
    expect(scanStaged({ cwd: repo }).findings).toEqual([]);

    writeFileSync(join(repo, 'leak.env'), `TOKEN=${SECRET_FIXTURES['slack-token']()}\n`);
    git(repo, 'add', 'leak.env');
    expect(scanStaged({ cwd: repo }).findings.map((finding) => finding.ruleId)).toEqual(['slack-token']);
  });

  /* The case the pre-push layer exists for: added, committed, then deleted again - still in history. */
  it('pre-push: finds a secret that a later commit in the same push deleted', () => {
    const repo = tempRepo();
    writeFileSync(join(repo, 'README.md'), '# repo\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '--no-verify', '-m', 'base');
    const base = git(repo, 'rev-parse', 'HEAD');

    writeFileSync(join(repo, 'keys.ts'), `export const k = "${SECRET_FIXTURES['anthropic-api-key']()}";\n`);
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '--no-verify', '-m', 'oops');
    git(repo, 'rm', '-q', 'keys.ts');
    git(repo, 'commit', '-q', '--no-verify', '-m', 'remove it');

    const { findings } = scanCommits([`${base}..HEAD`], { cwd: repo });

    expect(findings).toEqual([expect.objectContaining({ path: 'keys.ts', ruleId: 'anthropic-api-key' })]);
  });

  /*
   * The audit mode. Read through `git cat-file --batch` in size-bounded chunks; a chunk of one byte
   * forces one object per batch, so the parser is proven at every boundary, not only in the middle.
   */
  it('history: finds a secret in any blob ever committed, whatever the chunk size', () => {
    const repo = tempRepo();
    writeFileSync(join(repo, 'a.txt'), 'plain\n');
    writeFileSync(join(repo, 'b.bin'), Buffer.from([0x00, 0x01, 0x02]));
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '--no-verify', '-m', 'one');
    writeFileSync(join(repo, 'c.txt'), `key=${SECRET_FIXTURES['clickup-token']()}\n`);
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '--no-verify', '-m', 'two');
    git(repo, 'rm', '-q', 'c.txt');
    git(repo, 'commit', '-q', '--no-verify', '-m', 'three');

    for (const chunkBytes of [1, 1024 * 1024]) {
      const { scanned, findings } = scanHistory({ cwd: repo, chunkBytes });

      expect(scanned, String(chunkBytes)).toBe(3);
      expect(findings, String(chunkBytes)).toEqual([
        expect.objectContaining({ path: 'c.txt', line: 1, ruleId: 'clickup-token' }),
      ]);
    }
  });

  it('installs the hooks path once, and never overwrites someone else’s', () => {
    const repo = tempRepo();

    expect(installGitHooks({ cwd: repo, env: {} })).toEqual({ status: 'installed' });
    expect(git(repo, 'config', '--local', '--get', 'core.hooksPath')).toBe('.githooks');
    expect(installGitHooks({ cwd: repo, env: {} })).toEqual({ status: 'already-installed' });

    git(repo, 'config', '--local', 'core.hooksPath', '.husky');
    expect(installGitHooks({ cwd: repo, env: {} }).status).toBe('conflict');
    expect(git(repo, 'config', '--local', '--get', 'core.hooksPath')).toBe('.husky');
  });

  /* A global hooksPath is somebody's setup as well; a local override would switch it off here. */
  it('reports a hooksPath set outside the repository instead of overriding it', () => {
    const repo = tempRepo();
    const globalConfig = join(repo, '..', `${repo.split(/[\\/]/u).pop()}-global.gitconfig`);
    temporaryDirectories.push(globalConfig);
    writeFileSync(globalConfig, '[core]\n\thooksPath = /opt/team-hooks\n');

    const previous = process.env.GIT_CONFIG_GLOBAL;
    process.env.GIT_CONFIG_GLOBAL = globalConfig;

    try {
      expect(installGitHooks({ cwd: repo, env: {} }).status).toBe('conflict');
      expect(spawnSync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: repo }).status).toBe(1);
    } finally {
      if (previous === undefined) {
        delete process.env.GIT_CONFIG_GLOBAL;
      } else {
        process.env.GIT_CONFIG_GLOBAL = previous;
      }
    }
  });

  it('does not touch git config in CI', () => {
    const repo = tempRepo();

    expect(installGitHooks({ cwd: repo, env: { CI: 'true' } }).status).toBe('skipped');
  });
});

describe('scanDirectory', () => {
  it('scans a build output and names the file relative to it', () => {
    const directory = mkdtempSync(join(tmpdir(), 'optc-build-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'main.js'), `var k="${SECRET_FIXTURES['sendgrid-api-key']()}";`);
    writeFileSync(join(directory, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]));

    const { scanned, findings } = scanDirectory(directory);

    expect(scanned).toBe(2);
    expect(findings).toEqual([expect.objectContaining({ path: 'main.js', ruleId: 'sendgrid-api-key' })]);
  });
});

/*
 * 869f33bru. The owner asked for many layers. Each assertion below fails if one is removed, so a
 * layer cannot disappear in a refactor without this lane going red.
 */
describe('every layer is still wired', () => {
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

  it('installs the hooks on npm ci / npm install', () => {
    expect(pkg.scripts['prepare']).toBe('node ./scripts/install-git-hooks.mjs');
  });

  it('has a pre-commit and a pre-push hook that run the scanner', () => {
    expect(read('.githooks/pre-commit')).toContain('check-secrets.mjs" --staged');
    expect(read('.githooks/pre-push')).toContain('check-secrets.mjs" --pre-push');
  });

  it('scans the published site before it is deployed, and checks its config', () => {
    const buildPages = pkg.scripts['build:pages'];

    expect(buildPages).toContain('npm run security:app-config');
    expect(buildPages.trim().endsWith('node ./scripts/check-secrets.mjs --dir dist/optc-team-builder/browser')).toBe(true);
  });

  it('scans the web assets of the release APK before it is built', () => {
    const release = read('scripts/release-and-tag.sh');
    const scan = release.indexOf('scripts/check-secrets.mjs" --dir');

    expect(scan).toBeGreaterThan(release.indexOf('bash -lc "${BUILD_MOBILE_COMMAND}"'));
    expect(scan).toBeLessThan(release.indexOf('./gradlew clean assembleRelease'));
  });

  it('ignores the files credentials usually arrive in', () => {
    const ignore = read('.gitignore');

    for (const pattern of ['.env.*', '!.env.example', '*.keystore', '*.jks', '*.p12', '*.pem', '*service-account*.json']) {
      expect(ignore.split('\n')).toContain(pattern);
    }
  });

  it('fill is deterministic', () => {
    expect(fill(5)).toBe('abcde');
    expect(fill(3, 'xy')).toBe('xyx');
  });
});
