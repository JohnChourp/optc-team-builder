import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkDocsIntegrity, formatFailures, isValidClickUpTaskUrl } from './check-docs-integrity.mjs';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeWorkspace(files: Record<string, string>) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'optc-docs-integrity-'));
  tempDirs.push(rootDir);
  const appRoot = path.join(rootDir, 'optc-team-builder');
  const brainRoot = path.join(rootDir, 'optc-team-builder-brain');
  await mkdir(appRoot, { recursive: true });
  await mkdir(brainRoot, { recursive: true });

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  }

  return { appRoot, brainRoot };
}

async function runWorkspace(files: Record<string, string>) {
  const { appRoot, brainRoot } = await makeWorkspace(files);
  return checkDocsIntegrity({ appRoot, brainRoot });
}

describe('check-docs-integrity', () => {
  it('passes valid Markdown links, file references, public URLs, ClickUp URLs, and live artifact paths', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        'See the [guide](docs/guide.md#valid-heading).',
        'Evidence lives in `../optc-team-builder-brain/audits/869dwc3zd-docs-integrity.md`.',
        'Local screenshots may live in `../optc-team-builder-brain/live-artifacts/869dwc3zd/post.png`.',
        'Public route: https://optcteambuilder.com/tabs/manual-team-builder/',
        'Human sitemap: https://optcteambuilder.com/sitemap.html',
        'Task: https://app.clickup.com/t/90121749478/869dwc3zd',
      ].join('\n'),
      'optc-team-builder/docs/guide.md': '# Valid Heading\n',
      'optc-team-builder-brain/audits/869dwc3zd-docs-integrity.md': '# Audit\n',
    });

    expect(result.failures).toEqual([]);
    expect(formatFailures(result)).toContain('checked 3 Markdown files');
  });

  it('fails broken Markdown links and missing target anchors', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        '[Missing doc](docs/missing.md)',
        '[Missing anchor](docs/guide.md#missing-heading)',
      ].join('\n'),
      'optc-team-builder/docs/guide.md': '# Present Heading\n',
    });

    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'Missing linked file: docs/missing.md' }),
        expect.objectContaining({ message: 'Missing Markdown anchor "#missing-heading" in docs/guide.md.' }),
      ]),
    );
  });

  it('honors configured sibling roots for deep relative brain links', async () => {
    const result = await runWorkspace({
      'optc-team-builder/scripts/fixtures/release-readiness/expected-ready-summary.md': [
        '# Expected',
        '',
        '[Brain audit](../../../../optc-team-builder-brain/audits/task.md)',
      ].join('\n'),
      'optc-team-builder-brain/audits/task.md': '# Task\n',
    });

    expect(result.failures).toEqual([]);
  });

  it('resolves repo-root Markdown links to files before treating them as public routes', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': '# App\n\n[Guide](/docs/guide.md#usage)\n',
      'optc-team-builder/docs/guide.md': '# Guide\n\n## Usage\n',
    });

    expect(result.failures).toEqual([]);
  });

  it('accepts known public routes with query strings', async () => {
    const result = await runWorkspace({
      'optc-team-builder/docs/data-schemas.md': [
        '# Schemas',
        '',
        '[Shared team](/tabs/manual-team-builder?teamShare=abc123)',
      ].join('\n'),
    });

    expect(result.failures).toEqual([]);
  });

  it('accepts generated public route aliases', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': '# App\n\n[Drive sync](/tabs/drive-sync/)\n',
    });

    expect(result.failures).toEqual([]);
  });

  it('accepts declared app tab routes', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        '[Saved teams](/tabs/saved-teams)',
        '[Saved enemies](/tabs/saved-enemies)',
        '[Character boxes](/tabs/character-boxes)',
      ].join('\n'),
    });

    expect(result.failures).toEqual([]);
  });

  it('rejects relative Markdown links that resolve outside checked repos', async () => {
    const result = await runWorkspace({
      'outside.md': '# Outside\n',
      'optc-team-builder/README.md': '# App\n\n[Outside](../outside.md)\n',
    });

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        message: 'Linked file resolves outside checked repos: ../outside.md',
      }),
    );
  });

  it('rejects code-span paths that resolve outside checked repos', async () => {
    const result = await runWorkspace({
      'outside.md': '# Outside\n',
      'optc-team-builder/README.md': '# App\n\nOutside reference: `../outside.md`.\n',
    });

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        message: 'Referenced file resolves outside checked repos: ../outside.md',
      }),
    );
  });

  it('accepts Markdown links with parenthesized titles', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': '# App\n\n[Guide](docs/guide.md (title))\n',
      'optc-team-builder/docs/guide.md': '# Guide\n',
    });

    expect(result.failures).toEqual([]);
  });

  it('fails stale repo-relative code-span file references', async () => {
    const result = await runWorkspace({
      'optc-team-builder/SEO_AUDIT.md': [
        '# SEO Audit',
        '',
        '- `src/app/pages/team-builder/team-builder.page.html`',
      ].join('\n'),
      'optc-team-builder/src/app/pages/manual-team-builder/manual-team-builder.page.html': '<main></main>\n',
    });

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        file: 'SEO_AUDIT.md',
        message: 'Missing referenced file: src/app/pages/team-builder/team-builder.page.html',
      }),
    );
  });

  it('fails stale OPTC public URLs and invalid ClickUp task URLs', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        'Old route: https://optcteambuilder.com/tabs/team-builder/',
        'Wrong workspace: https://app.clickup.com/t/123456789/not-this-task',
      ].join('\n'),
    });

    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Unknown OPTC public URL path: https://optcteambuilder.com/tabs/team-builder/',
        }),
        expect.objectContaining({
          message: 'Invalid ClickUp task URL for OPTC workspace: https://app.clickup.com/t/123456789/not-this-task',
        }),
      ]),
    );
  });

  it('fails non-HTTPS OPTC public URLs and still validates their public paths', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        'Old non-canonical route: http://optcteambuilder.com/tabs/team-builder/',
      ].join('\n'),
    });

    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'OPTC public URL must use HTTPS canonical origin: http://optcteambuilder.com/tabs/team-builder/',
        }),
        expect.objectContaining({
          message: 'Unknown OPTC public URL path: http://optcteambuilder.com/tabs/team-builder/',
        }),
      ]),
    );
  });

  it('fails www OPTC public URLs and still validates their public paths', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        'Old www route: https://www.optcteambuilder.com/tabs/team-builder/',
      ].join('\n'),
    });

    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'OPTC public URL must use HTTPS canonical origin: https://www.optcteambuilder.com/tabs/team-builder/',
        }),
        expect.objectContaining({
          message: 'Unknown OPTC public URL path: https://www.optcteambuilder.com/tabs/team-builder/',
        }),
      ]),
    );
  });

  it('does not duplicate stale URL failures from Markdown link destinations', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        '[Old route](https://optcteambuilder.com/tabs/team-builder/)',
      ].join('\n'),
    });

    expect(result.failures).toEqual([
      expect.objectContaining({
        message: 'Unknown OPTC public URL path: https://optcteambuilder.com/tabs/team-builder/',
      }),
    ]);
  });

  it('accepts published public assets in public URL and absolute Markdown links', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        'Public favicon: https://optcteambuilder.com/brand/favicon-master-v2-optimized.png',
        '[Verification file](/google84ad253f26cc78d3.html)',
        '[ICO](/favicon.ico)',
        '[Manifest](/manifest.webmanifest)',
        '[SVG](/assets/placeholders/character-card.svg)',
      ].join('\n'),
      'optc-team-builder/public/brand/favicon-master-v2-optimized.png': 'fake png',
      'optc-team-builder/public/google84ad253f26cc78d3.html': '<html></html>\n',
      'optc-team-builder/public/favicon.ico': 'fake ico',
      'optc-team-builder/public/manifest.webmanifest': '{}\n',
      'optc-team-builder/public/assets/placeholders/character-card.svg': '<svg></svg>\n',
    });

    expect(result.failures).toEqual([]);
  });

  it('fails legacy hash-routed OPTC public URLs and validates the hash path', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        'Legacy hash route: https://optcteambuilder.com/#/tabs/team-builder/',
      ].join('\n'),
    });

    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'OPTC public URL must not use hash routing: https://optcteambuilder.com/#/tabs/team-builder/',
        }),
        expect.objectContaining({
          message: 'Unknown OPTC public URL path: https://optcteambuilder.com/#/tabs/team-builder/',
        }),
      ]),
    );
  });

  it('does not treat lookalike domains as canonical OPTC public URLs', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        'External lookalike host: https://optcteambuilder.com.evil.example/tabs/team-builder/',
      ].join('\n'),
    });

    expect(result.failures).toEqual([]);
  });

  it('fails when a requested docs root cannot be scanned', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'optc-docs-integrity-missing-root-'));
    tempDirs.push(rootDir);
    const appRoot = path.join(rootDir, 'optc-team-builder');
    const brainRoot = path.join(rootDir, 'missing-brain');
    await mkdir(appRoot, { recursive: true });
    await writeFile(path.join(appRoot, 'README.md'), '# App\n');

    const result = await checkDocsIntegrity({ appRoot, brainRoot });

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        repo: 'brain',
        file: '.',
        message: expect.stringContaining('Unable to scan requested brain docs root'),
      }),
    );
  });

  it('ignores headings inside fenced code when validating anchors', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        'See [fake](docs/example.md#fake-heading).',
      ].join('\n'),
      'optc-team-builder/docs/example.md': [
        '# Example',
        '',
        '```md',
        '## Fake Heading',
        '```',
      ].join('\n'),
    });

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        message: 'Missing Markdown anchor "#fake-heading" in docs/example.md.',
      }),
    );
  });

  it('ignores Markdown links inside tilde and indented code blocks', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        '~~~md',
        '[Missing](docs/nope.md)',
        '~~~',
        '',
        '    [Also missing](docs/also-nope.md)',
      ].join('\n'),
    });

    expect(result.failures).toEqual([]);
  });

  it('still validates links inside nested Markdown lists', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        '- Parent',
        '    - [Missing nested guide](docs/missing.md)',
      ].join('\n'),
    });

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        message: 'Missing linked file: docs/missing.md',
      }),
    );
  });

  it('validates links on list continuation lines', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        '- See:',
        '    [Missing guide](docs/missing.md)',
      ].join('\n'),
    });

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        message: 'Missing linked file: docs/missing.md',
      }),
    );
  });

  it('validates links on nested list continuation lines', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        '- Parent',
        '    - Child:',
        '      [Missing nested continuation](docs/missing.md)',
      ].join('\n'),
    });

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        message: 'Missing linked file: docs/missing.md',
      }),
    );
  });

  it('preserves nested code blocks under list items', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        '- Example:',
        '        [Not a real link](docs/missing.md)',
      ].join('\n'),
    });

    expect(result.failures).toEqual([]);
  });

  it('preserves nested code blocks under nested list items', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        '- Parent',
        '    - Example:',
        '            [Not a real nested link](docs/missing.md)',
      ].join('\n'),
    });

    expect(result.failures).toEqual([]);
  });

  it('fails missing reference-style link definitions', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        'See [the guide][missing-guide].',
      ].join('\n'),
    });

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        message: 'Missing reference-style link definition: missing-guide',
      }),
    );
  });

  it('fails likely missing shortcut reference definitions', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        'See [Release guide].',
      ].join('\n'),
    });

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        message: 'Missing reference-style link definition: release guide',
      }),
    );
  });

  it('honors next-line ignores for likely missing shortcut references', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        '<!-- docs-integrity-ignore-next-line: literal historical shortcut syntax -->',
        'See [Release guide].',
      ].join('\n'),
    });

    expect(result.failures).toEqual([]);
  });

  it('ignores escaped reference labels', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        String.raw`Literal shortcut: \[Release guide].`,
        String.raw`Literal full reference: \[the guide][missing].`,
      ].join('\n'),
    });

    expect(result.failures).toEqual([]);
  });

  it('accepts reference definitions without a space after the colon', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        'See [the guide][guide].',
        '',
        '[guide]:docs/guide.md',
      ].join('\n'),
      'optc-team-builder/docs/guide.md': '# Guide\n',
    });

    expect(result.failures).toEqual([]);
  });

  it('does not treat compact OPTC game notation as reference-style links', async () => {
    const result = await runWorkspace({
      'optc-team-builder-brain/CAPTAIN_ABILITY_COVERAGE_GUIDE.md': [
        '# Captain Guide',
        '',
        'Orb flip [STR][INT] (all).',
      ].join('\n'),
    });

    expect(result.failures).toEqual([]);
  });

  it('validates reference-style link definitions and ignores footnotes', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        'See [the guide][guide].',
        '',
        '[guide]: docs/guide.md',
        '[^1]: Footnote prose is not a link definition.',
      ].join('\n'),
      'optc-team-builder/docs/guide.md': '# Guide\n',
    });

    expect(result.failures).toEqual([]);
  });

  it('keeps URLs at the start of footnotes visible to URL checks', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        '[^1]: https://optcteambuilder.com/tabs/team-builder/',
      ].join('\n'),
    });

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        message: 'Unknown OPTC public URL path: https://optcteambuilder.com/tabs/team-builder/',
      }),
    );
  });

  it('treats generic URI schemes as external links', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        '[Editor](vscode://file/docs/guide.md)',
        '[Mobile deep link](capacitor://localhost/tabs/characters)',
      ].join('\n'),
    });

    expect(result.failures).toEqual([]);
  });

  it('honors next-line ignores and validates live artifact path shape only', async () => {
    const result = await runWorkspace({
      'optc-team-builder-brain/README.md': [
        '# Brain',
        '',
        '<!-- docs-integrity-ignore-next-line: historical route from old SEO audit -->',
        'Historical route: https://optcteambuilder.com/tabs/team-builder/',
        'Accepted missing ignored artifact root: `live-artifacts/869dwc3zd/final.png`.',
        'Bad artifact shape: `live-artifacts/final.png`.',
      ].join('\n'),
    });

    expect(result.failures).toEqual([
      expect.objectContaining({
        message: 'Live artifact path must use live-artifacts/<task-id>/...: live-artifacts/final.png',
      }),
    ]);
  });

  it('validates Markdown live artifact links by shape only', async () => {
    const result = await runWorkspace({
      'optc-team-builder-brain/audits/task.md': [
        '# Audit',
        '',
        '[Accepted artifact](../live-artifacts/869dwc3zd/final.png)',
        '[Bad artifact](../live-artifacts/final.png)',
      ].join('\n'),
    });

    expect(result.failures).toEqual([
      expect.objectContaining({
        message: 'Live artifact path must use live-artifacts/<task-id>/...: ../live-artifacts/final.png',
      }),
    ]);
  });

  it('accepts line anchors on code-span file references', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        'Source: `scripts/example.mjs#L10`.',
      ].join('\n'),
      'optc-team-builder/scripts/example.mjs': 'export {};\n',
    });

    expect(result.failures).toEqual([]);
  });

  it('accepts Markdown fragments on code-span file references', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        'Source: `docs/guide.md#usage`.',
      ].join('\n'),
      'optc-team-builder/docs/guide.md': '# Guide\n\n## Usage\n',
    });

    expect(result.failures).toEqual([]);
  });

  it('treats parent-relative code-span paths as file references', async () => {
    const result = await runWorkspace({
      'optc-team-builder/docs/nested/page.md': [
        '# Nested',
        '',
        'Parent guide: `../guide.md`.',
      ].join('\n'),
      'optc-team-builder/docs/guide.md': '# Guide\n',
    });

    expect(result.failures).toEqual([]);
  });

  it('checks lowercase bare Markdown code-span filenames', async () => {
    const result = await runWorkspace({
      'optc-team-builder/docs/page.md': '# Page\n\nSee `guide.md`.\n',
    });

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        message: 'Missing referenced file: guide.md',
      }),
    );
  });

  it('checks bare same-directory code-span filenames with known extensions', async () => {
    const result = await runWorkspace({
      'optc-team-builder/e2e/README.md': [
        '# E2E',
        '',
        'Existing spec: `smoke.spec.ts`.',
        'Missing fixture: `sample-characters.json`.',
      ].join('\n'),
      'optc-team-builder/e2e/smoke.spec.ts': 'export {};\n',
    });

    expect(result.failures).toEqual([
      expect.objectContaining({
        message: 'Missing referenced file: sample-characters.json',
      }),
    ]);
  });

  it('allows generated Markdown artifact filenames', async () => {
    const result = await runWorkspace({
      'optc-team-builder/e2e/README.md': [
        '# E2E',
        '',
        'Artifacts include `performance-budget-summary.md` and `performance-budget-history.md`.',
      ].join('\n'),
    });

    expect(result.failures).toEqual([]);
  });

  it('ignores inline-code Markdown examples, numeric template filenames, and PR placeholder URLs', async () => {
    const result = await runWorkspace({
      'optc-team-builder-brain/.github/pull_request_template.md': [
        'ClickUp task: https://app.clickup.com/t/90121749478/... or none - <reason>',
      ].join('\n'),
      'optc-team-builder-brain/audits/task.md': [
        '# Task',
        '',
        'Inline examples such as `` `[missing](docs/nope.md)` `` are not rendered links.',
        'Future audit drafts may use `1234.md` before becoming `completed_1234.md`.',
      ].join('\n'),
    });

    expect(result.failures).toEqual([]);
  });

  it('ignores multi-backtick inline-code Markdown examples', async () => {
    const result = await runWorkspace({
      'optc-team-builder-brain/audits/task.md': [
        '# Task',
        '',
        'Literal double-backtick example: ``[missing](docs/nope.md)``.',
      ].join('\n'),
    });

    expect(result.failures).toEqual([]);
  });

  it('collects Setext headings as Markdown anchors', async () => {
    const result = await runWorkspace({
      'optc-team-builder/README.md': '# App\n\n[Usage](docs/guide.md#usage)\n',
      'optc-team-builder/docs/guide.md': 'Usage\n-----\n',
    });

    expect(result.failures).toEqual([]);
  });
});

describe('isValidClickUpTaskUrl', () => {
  it('accepts OPTC workspace URLs and short custom task URLs', () => {
    expect(isValidClickUpTaskUrl('https://app.clickup.com/t/90121749478/869dwc3zd')).toBe(true);
    expect(isValidClickUpTaskUrl('https://app.clickup.com/t/869dwc3zd')).toBe(true);
  });

  it('rejects workspace-only, numeric short, and wrong workspace URLs', () => {
    expect(isValidClickUpTaskUrl('https://app.clickup.com/t/90121749478')).toBe(false);
    expect(isValidClickUpTaskUrl('https://app.clickup.com/t/123456789')).toBe(false);
    expect(isValidClickUpTaskUrl('https://app.clickup.com/t/123456789/869dwc3zd')).toBe(false);
  });
});
