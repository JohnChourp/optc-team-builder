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
