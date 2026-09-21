#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  contrastRatio,
  parseColor,
  parseRootTokens,
  readCssRules,
  resolveValue,
  stripScssComments,
} from './check-ionic-overlay-contrast.mjs';

/**
 * App surfaces at the same thresholds as overlays.
 *
 * 869f13eqr. `theme:overlay-contrast` guards OVERLAY parts - alert, action sheet,
 * toast, loading - and nothing guarded the rest of the app. Every surface in a
 * dark-only app on `#070b17` faces the arithmetic that produced 1.30:1 alert text,
 * and the reported defect was the same class three times.
 *
 * What is checked: a rule that declares BOTH a text colour and its own background
 * in one block. That pair is self-contained - no DOM and no cascade is needed to
 * know what sits behind what - so it can be judged from the stylesheet without
 * guessing. Measured 2026-09-21: **196 of 237** such pairs are resolvable and
 * **all 196 pass**, so this starts green and stays a guard rather than a backlog.
 *
 * WHY THIS IS NOT JUST THE OVERLAY CHECKER POINTED SOMEWHERE ELSE
 *
 * An overlay's surface is an opaque token. An app surface is usually **translucent**:
 * 203 of the 237 backgrounds are `rgba()`. A translucent colour's effective value
 * depends on what is behind it, so each one is composited over the page background
 * before it is measured - `--ion-background-color`, which this app fixes at `#070b17`
 * and which is the only reason compositing is sound here.
 *
 * THE TRAP THIS WAS WRITTEN AROUND, recorded because it cost a measurement:
 * `parseColor` returns an `rgba()`'s three channels and **silently drops its alpha**.
 * Read that way, `.coverage-chip`'s `rgba(245, 200, 76, 0.16)` background is the same
 * colour as its `#f5c84c` text - ratio **1.00** - and a first run reported **175
 * failures** that do not exist. Alpha is read FIRST here, and never through
 * `parseColor`.
 *
 * Deliberately NOT checked, because a wrong answer is worse than none:
 *   - `gradient(...)` backgrounds - there is no single colour behind the text;
 *   - `inherit` / `currentColor` / `transparent` - the answer is in the cascade;
 *   - a colour set without a background in the same block - what it sits on is a
 *     DOM question, and the rendered-geometry technique is the right tool.
 *
 * Run: npm run theme:app-contrast
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** WCAG AA for body text, matching the overlay guard. 3:1 would pass `#737373`. */
export const TEXT_CONTRAST_MINIMUM = 4.5;

/** The page the whole app is painted on. Dark-only, by decision. */
export const PAGE_BACKGROUND_TOKEN = 'var(--ion-background-color)';

const COLOR_DECLARATION = /(?:^|[;{\s])color\s*:\s*([^;}]+)/u;
const BACKGROUND_DECLARATION = /(?:^|[;{\s])background(?:-color)?\s*:\s*([^;}]+)/u;
/** A var() chain, an rgb/rgba(), or a hex - parentheses kept whole. */
const COLOR_TOKEN = /(var\(\s*--[\w-]+[^)]*\)|rgba?\([^)]*\)|#[0-9a-f]{3,8}\b)/iu;
const RGBA = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)/iu;

/** `rgba()` WITH its alpha. `parseColor` drops the alpha, which is the whole trap. */
export function parseRgbaWithAlpha(value) {
  const match = RGBA.exec(String(value ?? '').trim());

  if (!match) {
    return null;
  }

  return {
    rgb: [Number(match[1]), Number(match[2]), Number(match[3])],
    alpha: match[4] === undefined ? 1 : Number(match[4]),
  };
}

/** Paints `rgb` at `alpha` onto `behind`, the way a browser composites it. */
export function compositeOver(rgb, alpha, behind) {
  return rgb.map((channel, index) => Math.round(channel * alpha + behind[index] * (1 - alpha)));
}

/** A declared value as an opaque colour plus its alpha, or `null` when it cannot be known. */
export function toColor(rawValue, tokens) {
  const token = COLOR_TOKEN.exec(String(rawValue ?? ''))?.[1];

  if (!token) {
    return null;
  }

  const resolved = resolveValue(token, tokens)?.value ?? token;
  const withAlpha = parseRgbaWithAlpha(resolved);

  if (withAlpha) {
    return withAlpha;
  }

  const opaque = parseColor(resolved);

  return opaque ? { rgb: opaque, alpha: 1 } : null;
}

export function inspectSurfacePairs({ sources, tokens, pageBackground }) {
  const findings = [];
  let checked = 0;
  let skipped = 0;

  for (const [file, rawCss] of sources) {
    const css = stripScssComments(rawCss);

    for (const rule of readCssRules(css)) {
      const colorRaw = COLOR_DECLARATION.exec(rule.declarations)?.[1];
      const backgroundRaw = BACKGROUND_DECLARATION.exec(rule.declarations)?.[1];

      if (!colorRaw || !backgroundRaw) {
        continue;
      }

      if (/gradient\(/iu.test(backgroundRaw)) {
        skipped += 1;
        continue;
      }

      const foreground = toColor(colorRaw, tokens);
      const background = toColor(backgroundRaw, tokens);

      if (!foreground || !background) {
        skipped += 1;
        continue;
      }

      const surface =
        background.alpha < 1
          ? compositeOver(background.rgb, background.alpha, pageBackground)
          : background.rgb;
      const text =
        foreground.alpha < 1
          ? compositeOver(foreground.rgb, foreground.alpha, surface)
          : foreground.rgb;

      checked += 1;
      const ratio = contrastRatio(text, surface);

      if (ratio < TEXT_CONTRAST_MINIMUM) {
        findings.push({
          file,
          line: rule.line,
          selector: rule.selector.trim(),
          ratio,
          detail: `${rule.selector.trim()} renders text at ${ratio}:1 on its own background; ${TEXT_CONTRAST_MINIMUM}:1 is the floor. Fix it with the theme's step ramp, never with a one-off literal.`,
        });
      }
    }
  }

  return { findings, checked, skipped };
}

export function listStylesheets(root = projectRoot) {
  return execFileSync('git', ['ls-files', 'src'], { cwd: root, encoding: 'utf8', maxBuffer: 1e8 })
    .split('\n')
    .filter((file) => file.endsWith('.scss'));
}

export function readStylesheets(files, root = projectRoot) {
  const sources = new Map();

  for (const file of files) {
    try {
      sources.set(file, readFileSync(path.join(root, file), 'utf8'));
    } catch {
      /* an unreadable stylesheet colours nothing */
    }
  }

  return sources;
}

function main() {
  const tokens = parseRootTokens(readFileSync(path.join(projectRoot, 'src/theme/variables.scss'), 'utf8'));
  const pageColor = toColor(PAGE_BACKGROUND_TOKEN, tokens);

  if (!pageColor) {
    console.error(
      `[theme:app-contrast] cannot resolve ${PAGE_BACKGROUND_TOKEN} from src/theme/variables.scss. Every measurement here composites onto it, so there is nothing to check without it.`,
    );
    process.exit(1);
  }

  const { findings, checked, skipped } = inspectSurfacePairs({
    sources: readStylesheets(listStylesheets()),
    tokens,
    pageBackground: pageColor.rgb,
  });

  if (findings.length) {
    console.error(`[theme:app-contrast] ${findings.length} app surface(s) below ${TEXT_CONTRAST_MINIMUM}:1:\n`);

    for (const finding of findings.sort((left, right) => left.ratio - right.ratio)) {
      console.error(`  - ${finding.file}:${finding.line} ${finding.detail}`);
    }

    process.exit(1);
  }

  /*
   * 869f13ept. A `prefers-contrast: more` pass was written here and REMOVED, because it
   * proved nothing: measured 2026-09-21, **0 of 237** app colour pairs reference a
   * `--ion-text-color-step-*` token, so re-running them with the high-contrast ramp
   * layered on gives byte-identical results. The app's own stylesheets use literal
   * colours; the ramp is consumed by IONIC's parts, inside shadow DOM.
   *
   * The high-contrast ramp is therefore guarded by `theme:overlay-contrast`, which
   * resolves exactly those tokens. A guard that re-measures the same inputs twice and
   * reports both green is worse than no guard, because it reads like coverage.
   */
  console.log(
    `[theme:app-contrast] ${checked} self-contained colour pair(s) meet ${TEXT_CONTRAST_MINIMUM}:1 on #${pageColor.rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}; ${skipped} skipped as unknowable from the stylesheet.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
