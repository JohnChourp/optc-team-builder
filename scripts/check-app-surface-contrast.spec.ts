import { describe, expect, it } from 'vitest';

import {
  compositeOver,
  inspectSurfacePairs,
  parseRgbaWithAlpha,
  TEXT_CONTRAST_MINIMUM,
  toColor,
} from './check-app-surface-contrast.mjs';

/**
 * 869f13eqr. Driven from a tree that passes, so each case changes one thing.
 *
 * The first block is the trap that produced a false reading and is therefore the
 * part most worth pinning: `parseColor` returns an `rgba()`'s channels and drops
 * its alpha. Read that way, `.coverage-chip`'s `rgba(245, 200, 76, 0.16)`
 * background is the same colour as its `#f5c84c` text - ratio 1.00 - and a first
 * run of this checker reported 175 failures that do not exist.
 */

const PAGE: [number, number, number] = [7, 11, 23];
const tokens = new Map<string, string>([['--ion-background-color', '#070b17']]);

const sheet = (declarations: string) =>
  new Map([['src/app/pages/demo/demo.component.scss', `.demo {\n${declarations}\n}\n`]]);

const run = (declarations: string) =>
  inspectSurfacePairs({ sources: sheet(declarations), tokens, pageBackground: PAGE });

describe('alpha, which parseColor drops', () => {
  it('reads an rgba alpha rather than discarding it', () => {
    expect(parseRgbaWithAlpha('rgba(245, 200, 76, 0.16)')).toEqual({
      rgb: [245, 200, 76],
      alpha: 0.16,
    });
  });

  it('treats a bare rgb() as opaque', () => {
    expect(parseRgbaWithAlpha('rgb(9, 14, 28)')).toEqual({ rgb: [9, 14, 28], alpha: 1 });
  });

  it('composites a translucent colour onto what is behind it', () => {
    /* 16% of a bright gold over #070b17 is a dark olive, not gold. */
    expect(compositeOver([245, 200, 76], 0.16, PAGE)).toEqual([45, 41, 31]);
  });

  /*
   * The false reading itself. Without alpha this pair scores 1.00 and the rule
   * is reported as broken; with it, the pair is one of the 196 that pass.
   */
  it('does NOT report the real .coverage-chip pair, which alpha makes legible', () => {
    const { findings, checked } = run('  background: rgba(245, 200, 76, 0.16);\n  color: #f5c84c;');

    expect(checked).toBe(1);
    expect(findings).toEqual([]);
  });

  it('resolves a var() through the theme tokens', () => {
    expect(toColor('var(--ion-background-color)', tokens)).toEqual({ rgb: [7, 11, 23], alpha: 1 });
  });
});

describe('the threshold', () => {
  /* The exact colour that made the overlay guard choose 4.5 over 3. */
  it('fails #737373 body text, which a 3:1 guard would pass', () => {
    const { findings } = run('  background: rgba(245, 200, 76, 0.16);\n  color: #737373;');

    expect(findings).toHaveLength(1);
    expect(findings[0].ratio).toBeLessThan(TEXT_CONTRAST_MINIMUM);
    expect(findings[0].detail).toContain('4.5:1 is the floor');
  });

  it('fails a colour that clears 3:1 but not 4.5:1', () => {
    expect(run('  background: rgba(245, 200, 76, 0.16);\n  color: #6b6b5a;').findings).toHaveLength(1);
  });

  it('passes white on the page background', () => {
    expect(run('  background: var(--ion-background-color);\n  color: #ffffff;').findings).toEqual([]);
  });
});

describe('what it refuses to judge', () => {
  it.each([
    ['a gradient background', '  background: linear-gradient(#000, #fff);\n  color: #737373;'],
    ['an inherited colour', '  background: rgba(9, 14, 28, 0.94);\n  color: inherit;'],
    ['a transparent background', '  background: transparent;\n  color: #737373;'],
  ])('skips %s rather than guessing', (_label, declarations) => {
    const { findings, checked, skipped } = run(declarations);

    expect(findings).toEqual([]);
    expect(checked).toBe(0);
    expect(skipped).toBe(1);
  });

  it('skips a colour with no background in the same block', () => {
    const { checked, skipped, findings } = run('  color: #737373;');

    expect(findings).toEqual([]);
    expect(checked).toBe(0);
    expect(skipped).toBe(0);
  });
});
