import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  OVERLAY_CONTRACT,
  TEXT_CONTRAST_THRESHOLD,
  contrastRatio,
  formatOverlayContrastResult,
  inspectOverlayContrast,
  parseColor,
  parseRootTokens,
  resolveValue,
} from './check-ionic-overlay-contrast.mjs';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeRoot(files: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'optc-overlay-contrast-'));
  tempDirs.push(root);

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  }

  return root;
}

/**
 * The two Ionic declarations that produced the reported bug, verbatim in shape.
 * The fixture never points at the real node_modules, so an Ionic upgrade cannot
 * fail this spec for the wrong reason.
 */
const ALERT_MD_CSS = `
.alert-title {
  color: var(--ion-text-color, #000);
}

.alert-message {
  color: var(--ion-color-step-550, var(--ion-text-color-step-450, #737373));
}

.alert-radio-label {
  color: var(--ion-color-step-850, var(--ion-text-color-step-150, #262626));
}
`;

const ANCHORS_ONLY = `:root {
  --ion-background-color: #070b17;
  --ion-text-color: #f8fbff;
}
`;

const FULL_RAMP = `:root {
  --ion-background-color: #070b17;
  --ion-text-color: #f8fbff;
  --ion-text-color-step-150: #d4d7dc;
  --ion-text-color-step-450: #8c8f97;
}
`;

async function makeAppRoot(variables: string, extra: Record<string, string> = {}) {
  return makeRoot({
    'src/theme/variables.scss': variables,
    'src/styles.scss': ':root {\n}\n',
    ...extra,
  });
}

async function makeIonicRoot(files: Record<string, string> = {}) {
  return makeRoot({ 'alert/alert.md.css': ALERT_MD_CSS, ...files });
}

describe('check-ionic-overlay-contrast', () => {
  it('accepts a theme that defines the step tokens Ionic dereferences', async () => {
    const appRoot = await makeAppRoot(FULL_RAMP);
    const ionicRoot = await makeIonicRoot();

    const result = inspectOverlayContrast({ appRoot, ionicRoot });

    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.checkedDeclarations).toBeGreaterThan(0);
  });

  /*
   * The reported bug, reproduced: a theme with only the two anchor tokens. This
   * is the case that shipped, so if this test ever goes green without the ramp,
   * the guard has stopped guarding.
   */
  it('rejects a theme that sets only the anchor tokens', async () => {
    const appRoot = await makeAppRoot(ANCHORS_ONLY);
    const ionicRoot = await makeIonicRoot();

    const result = inspectOverlayContrast({ appRoot, ionicRoot });

    expect(result.ok).toBe(false);
    expect(
      result.findings.filter((finding) => finding.kind === 'undefined-step-token').map((f) => f.part),
    ).toEqual(expect.arrayContaining(['.alert-message', '.alert-radio-label']));

    const radioLabel = result.findings.find((finding) => finding.part === '.alert-radio-label');

    expect(radioLabel?.literal).toBe('#262626');
    expect(radioLabel?.missing).toContain('--ion-text-color-step-150');
  });

  /*
   * 4.5:1, not 3:1. The shipped `.alert-message` was #737373 on #070b17, which
   * is 4.14:1 - a 3:1 floor would have passed half the reported bug.
   */
  it('fails a ramp value that clears 3:1 but not the 4.5:1 body-text floor', async () => {
    const appRoot = await makeAppRoot(`:root {
  --ion-background-color: #070b17;
  --ion-text-color: #f8fbff;
  --ion-text-color-step-150: #d4d7dc;
  --ion-text-color-step-450: #737373;
}
`);
    const ionicRoot = await makeIonicRoot();

    const result = inspectOverlayContrast({ appRoot, ionicRoot });
    const finding = result.findings.find((entry) => entry.kind === 'low-contrast');

    expect(result.ok).toBe(false);
    expect(finding?.part).toBe('.alert-message');
    expect(finding?.ratio).toBeLessThan(TEXT_CONTRAST_THRESHOLD);
    expect(finding?.ratio).toBeGreaterThan(3);
    expect(finding?.threshold).toBe(TEXT_CONTRAST_THRESHOLD);
  });

  it('rejects an app stylesheet that darkens an overlay without colouring its text parts', async () => {
    const appRoot = await makeAppRoot(FULL_RAMP, {
      'src/app/some-page.scss': 'ion-toast {\n  background: #070b17;\n}\n',
    });
    const ionicRoot = await makeIonicRoot();

    const result = inspectOverlayContrast({ appRoot, ionicRoot });
    const finding = result.findings.find(
      (entry) => entry.kind === 'darkened-surface-without-text-parts',
    );

    expect(result.ok).toBe(false);
    expect(finding?.file).toBe('src/app/some-page.scss');
    expect(finding?.missing).toEqual(expect.arrayContaining(['.toast-message']));
  });

  /*
   * The idiom that let this recur twice: patch one alert's labels behind its
   * cssClass, leave every other alert - and that alert's own message - broken.
   */
  it('rejects overlay text colour scoped to a cssClass', async () => {
    const appRoot = await makeAppRoot(FULL_RAMP, {
      'src/app/legacy.scss':
        "ion-alert.some-modal-alert .alert-radio-label {\n  color: #ffffff;\n}\n",
    });
    const ionicRoot = await makeIonicRoot();

    const result = inspectOverlayContrast({ appRoot, ionicRoot });
    const finding = result.findings.find(
      (entry) => entry.kind === 'css-class-scoped-overlay-text',
    );

    expect(result.ok).toBe(false);
    expect(finding?.file).toBe('src/app/legacy.scss');
    expect(finding?.selector).toContain('ion-alert.some-modal-alert');
  });

  it('reports what it checked, so a silent no-op is visible', async () => {
    const appRoot = await makeAppRoot(FULL_RAMP);
    const ionicRoot = await makeIonicRoot();

    const report = formatOverlayContrastResult(inspectOverlayContrast({ appRoot, ionicRoot }));

    expect(report).toContain('# Ionic overlay contrast check');
    expect(report).toContain('Overlay surface resolves to #070b17.');
    expect(report).toContain('Status: passed');
  });

  it('resolves a var chain down to the first token the theme actually defines', () => {
    const tokens = parseRootTokens(FULL_RAMP);

    expect(
      resolveValue('var(--ion-color-step-850, var(--ion-text-color-step-150, #262626))', tokens),
    ).toEqual({
      value: '#d4d7dc',
      missing: ['--ion-color-step-850'],
    });
  });

  it('computes WCAG contrast the same way a browser does', () => {
    // Measured live in the browser before and after the fix.
    expect(contrastRatio(parseColor('#262626')!, parseColor('#070b17')!)).toBeCloseTo(1.3, 1);
    expect(contrastRatio(parseColor('#737373')!, parseColor('#070b17')!)).toBeCloseTo(4.14, 1);
    expect(contrastRatio(parseColor('#d4d7dc')!, parseColor('#070b17')!)).toBeCloseTo(13.61, 1);
    expect(contrastRatio(parseColor('#f8fbff')!, parseColor('#070b17')!)).toBeCloseTo(18.92, 1);
  });

  it('keeps every overlay this app can render under contract', () => {
    expect(Object.keys(OVERLAY_CONTRACT)).toEqual(
      expect.arrayContaining([
        'ion-alert',
        'ion-action-sheet',
        'ion-toast',
        'ion-loading',
        'ion-popover',
        'ion-modal',
      ]),
    );
    expect(OVERLAY_CONTRACT['ion-alert'].text).toEqual(
      expect.arrayContaining(['.alert-message', '.alert-radio-label', '.alert-checkbox-label']),
    );
  });
});
