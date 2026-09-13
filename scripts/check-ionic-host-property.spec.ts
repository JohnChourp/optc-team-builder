import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readCssRules } from './check-ionic-overlay-contrast.mjs';
import {
  formatIonicHostPropertyResult,
  hasPseudoElement,
  inspectHostShapeUsage,
  inspectIonicHostProperties,
  resolveHostSelector,
} from './check-ionic-host-property.mjs';

/*
 * 869f127db. A guard that has only ever seen a correct tree has not been tested. The first block
 * below reconstructs the v0.2.0 Captain Coverage crown - the bug this guard exists for, a round
 * button with four translucent triangles at its corners - and proves the guard goes red on it.
 */

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

function findings(scss: string) {
  return inspectHostShapeUsage(readCssRules(scss), { relativePath: 'fixture.scss' });
}

/** The crown as it shipped in v0.2.0, before `border-radius` was added beside the custom property. */
const V0_2_0_CROWN = `
.captain-result__leader {
  --border-radius: 999px;
  min-width: 44px;
  min-height: 44px;
  overflow: hidden;
}

.captain-result__leader::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.34) 0%, rgba(255, 255, 255, 0) 62%);
}
`;

/** The same crown as it stands today, with both properties adjacent. */
const FIXED_CROWN = V0_2_0_CROWN.replace('--border-radius: 999px;', '--border-radius: 999px;\n  border-radius: 999px;');

describe('the v0.2.0 crown', () => {
  it('GOES RED on the bug this guard exists for', () => {
    const result = findings(V0_2_0_CROWN);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      selector: '.captain-result__leader',
      customProperty: '--border-radius',
      plainProperty: 'border-radius',
      value: '999px',
    });
    // Both of the things that read the real property are named, not just one.
    expect(result[0]!.exposures).toEqual(
      expect.arrayContaining(['pseudo-element .captain-result__leader::after', 'overflow: hidden']),
    );
  });

  it('goes green once the plain property is set beside the custom one', () => {
    expect(findings(FIXED_CROWN)).toEqual([]);
  });

  it('explains what to add, in the message', () => {
    const output = formatIonicHostPropertyResult({
      checkedFiles: 1,
      findings: findings(V0_2_0_CROWN),
      ok: false,
    });

    expect(output).toContain('consumed inside the shadow DOM');
    expect(output).toContain('Add `border-radius: 999px;` next to it');
  });
});

describe('what counts as a host reading the real property', () => {
  it('flags a clipping overflow on its own', () => {
    expect(findings('ion-select { --border-radius: 18px; overflow: hidden; }')).toHaveLength(1);
  });

  it('flags a clip-path', () => {
    expect(findings('ion-button { --border-radius: 12px; clip-path: circle(50%); }')).toHaveLength(1);
  });

  it('flags a mask', () => {
    expect(findings('ion-button { --border-radius: 12px; -webkit-mask-image: url(a.svg); }')).toHaveLength(1);
  });

  it('does NOT flag a rounded control with nothing reading the real property', () => {
    // The custom property alone is not a defect - it is how Ionic is meant to be styled.
    expect(findings('ion-input { --border-radius: 18px; }')).toEqual([]);
  });

  it('does not treat overflow: visible as clipping', () => {
    expect(findings('ion-button { --border-radius: 12px; overflow: visible; }')).toEqual([]);
  });

  it('does not flag a shapeless value that the host has nothing to mirror', () => {
    expect(findings('ion-button { --border-radius: 0; overflow: hidden; }')).toEqual([]);
    expect(findings('ion-button { --border-radius: initial; overflow: hidden; }')).toEqual([]);
  });
});

describe('selector handling', () => {
  it('reads a NESTED rule, not only depth 0', () => {
    /*
     * A depth-0-only SCSS reader once passed the very tree it existed to reject. This drives the
     * bug through two levels of nesting and `&`, which is the shape that slipped through before.
     */
    const nested = `
      .panel {
        .crown {
          --border-radius: 999px;
          overflow: hidden;

          &::after {
            content: '';
            border-radius: inherit;
          }
        }
      }
    `;

    const result = findings(nested);

    expect(result).toHaveLength(1);
    expect(result[0]!.selector).toBe('.panel .crown');
  });

  it('folds a pseudo-class onto its host, so :hover is not a separate element', () => {
    expect(resolveHostSelector('.crown:hover')).toBe('.crown');
    expect(resolveHostSelector('.crown::after')).toBe('.crown');
    expect(resolveHostSelector('.a::after, .b:focus-visible')).toBe('.a, .b');
  });

  it('recognises both pseudo-elements that take border-radius: inherit', () => {
    expect(hasPseudoElement('.crown::before')).toBe(true);
    expect(hasPseudoElement('.crown::after')).toBe(true);
    expect(hasPseudoElement('.crown:hover')).toBe(false);
  });

  it('matches a host whose custom property and clip are in SEPARATE blocks', () => {
    // The host rule and the ::after that exposes the bug are usually two top-level blocks, which
    // is why the usage map is built across every rule before anything is judged.
    const split = `
      .crown { --border-radius: 999px; }
      .crown { overflow: hidden; }
    `;

    expect(findings(split)).toHaveLength(1);
  });
});

describe('inspectIonicHostProperties', () => {
  it('reports a clean tree as clean', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'optc-host-prop-'));
    tempDirs.push(appRoot);
    await mkdir(path.join(appRoot, 'src'), { recursive: true });
    await writeFile(path.join(appRoot, 'src/a.scss'), FIXED_CROWN, 'utf8');

    const result = inspectIonicHostProperties({ appRoot });

    expect(result.ok).toBe(true);
    expect(result.checkedFiles).toBe(1);
    expect(formatIonicHostPropertyResult(result)).toContain('is mirrored');
  });

  it('reports the file and line of a broken tree', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'optc-host-prop-bad-'));
    tempDirs.push(appRoot);
    await mkdir(path.join(appRoot, 'src/app'), { recursive: true });
    await writeFile(path.join(appRoot, 'src/app/crown.scss'), V0_2_0_CROWN, 'utf8');

    const result = inspectIonicHostProperties({ appRoot });

    expect(result.ok).toBe(false);
    expect(result.findings[0]!.file).toBe('src/app/crown.scss');
    expect(result.findings[0]!.line).toBeGreaterThan(0);
  });

  it('keeps the real repository clean', () => {
    // The guard's own subject. If this ever goes red, a host was given a shape it cannot show.
    const result = inspectIonicHostProperties({ appRoot: process.cwd() });

    expect(formatIonicHostPropertyResult(result)).toContain('is mirrored');
    expect(result.ok).toBe(true);
  });
});
