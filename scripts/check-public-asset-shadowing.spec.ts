import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  formatPublicAssetShadowingResult,
  GENERATOR_OWNED_OUTPUTS,
  inspectPublicAssetShadowing,
  readGeneratorConstants,
} from './check-public-asset-shadowing.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const publicDir = path.join(projectRoot, 'public');
const generatorSource = readFileSync(
  path.join(projectRoot, 'scripts', 'generate-seo-pages.mjs'),
  'utf8',
);
const indexNowKey = '0e9b739514c64e9a9a762120955f79dc';

/**
 * The real `public/`, plus a helper for building a hypothetical one.
 *
 * Deleting the stale sitemap is the fix; the cases below are the ways it could
 * come back, or the ways a mirror could quietly stop mirroring.
 */
const realPublicFiles: Record<string, string> = {
  'robots.txt': readFileSync(path.join(publicDir, 'robots.txt'), 'utf8'),
  [`${indexNowKey}.txt`]: readFileSync(path.join(publicDir, `${indexNowKey}.txt`), 'utf8'),
};

function withPublicFiles(files: Record<string, string>) {
  return {
    generatorSource,
    publicFileExists: (relativePath: string) => relativePath in files,
    readPublicFile: (relativePath: string) => files[relativePath],
  };
}

describe('public asset shadowing', () => {
  it('accepts the repository as it stands', () => {
    const result = inspectPublicAssetShadowing({
      generatorSource,
      publicFileExists: (relativePath: string) => existsSync(path.join(publicDir, relativePath)),
      readPublicFile: (relativePath: string) =>
        readFileSync(path.join(publicDir, relativePath), 'utf8'),
    });

    expect(result.errors).toEqual([]);
    expect(formatPublicAssetShadowingResult(result)).toContain('none shadowed');
  });

  it('has actually removed the committed sitemap', () => {
    expect(existsSync(path.join(publicDir, 'sitemap.xml'))).toBe(false);
  });

  it('reads the generator constants from its source, not from a build', () => {
    const constants = readGeneratorConstants(generatorSource);

    expect(constants.siteBaseUrl).toBe('https://optcteambuilder.com');
    expect(constants.indexNowKey).toBe(indexNowKey);
    expect(constants.writes['sitemap.xml']).toBe(true);
  });

  it('goes red when the stale sitemap comes back - the defect itself', () => {
    /*
     * A committed sitemap fails on EXISTENCE, so the content is not what is
     * under test and a short stand-in is exactly as strong as the real file.
     *
     * An earlier draft read the real one with `git show HEAD~1:public/sitemap.xml`.
     * That is the same trap 869f12x4n fell into one PR earlier: a case pinned to
     * a ref stops working the moment the tree moves - here, the first commit
     * after this one, because `HEAD~1` no longer has the file this PR deletes.
     * Nothing in this spec now depends on git.
     */
    const result = inspectPublicAssetShadowing(
      withPublicFiles({
        ...realPublicFiles,
        'sitemap.xml':
          '<?xml version="1.0" encoding="UTF-8"?>\n<urlset><url><loc>https://optcteambuilder.com/</loc></url></urlset>\n',
      }),
    );

    expect(result.errors.join('\n')).toContain('public/sitemap.xml shadows a file');
  });

  it('goes red on a committed sitemap.html too', () => {
    const result = inspectPublicAssetShadowing(
      withPublicFiles({ ...realPublicFiles, 'sitemap.html': '<html></html>' }),
    );

    expect(result.errors.join('\n')).toContain('public/sitemap.html shadows a file');
  });

  it('goes red when the robots.txt mirror drifts', () => {
    const drifted = realPublicFiles['robots.txt'].replace('optcteambuilder.com', 'example.com');
    const result = inspectPublicAssetShadowing(
      withPublicFiles({ ...realPublicFiles, 'robots.txt': drifted }),
    );

    expect(result.errors.join('\n')).toContain('has drifted from what generate-seo-pages.mjs writes');
  });

  it('goes red when a declared mirror is missing entirely', () => {
    const result = inspectPublicAssetShadowing(
      withPublicFiles({ [`${indexNowKey}.txt`]: realPublicFiles[`${indexNowKey}.txt`] }),
    );

    expect(result.errors.join('\n')).toContain('public/robots.txt is missing');
  });

  it('goes red when the IndexNow key file holds the wrong key', () => {
    const result = inspectPublicAssetShadowing(
      withPublicFiles({ ...realPublicFiles, [`${indexNowKey}.txt`]: 'deadbeef' }),
    );

    expect(result.errors.join('\n')).toContain('must contain exactly the IndexNow key');
  });

  it('goes red when the generator stops writing something the list claims', () => {
    const result = inspectPublicAssetShadowing({
      ...withPublicFiles(realPublicFiles),
      generatorSource: generatorSource.replace(
        "await writeFile(path.join(outputDir, 'sitemap.xml'), sitemap);",
        '',
      ),
    });

    expect(result.errors.join('\n')).toContain('and it no longer does');
  });

  it('rejects a placeholder reason', () => {
    const result = inspectPublicAssetShadowing({
      ...withPublicFiles(realPublicFiles),
      outputs: GENERATOR_OWNED_OUTPUTS.map((output) =>
        output.publicPath === 'sitemap.xml' ? { ...output, reason: 'n/a' } : output,
      ),
    });

    expect(result.errors.join('\n')).toContain('needs a real reason');
  });

  it('reports unreadable generator constants instead of passing on nothing', () => {
    const result = inspectPublicAssetShadowing({
      ...withPublicFiles(realPublicFiles),
      generatorSource: 'const nothing = 1;',
    });

    expect(result.errors.join('\n')).toContain('no longer declares its site base URL');
  });
});
