#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { readCssRules, stripScssComments } from './check-ionic-overlay-contrast.mjs';

/**
 * Touch targets: nothing interactive is sized below the declared floor.
 *
 * 869f13epp. `docs/device-targets.md` declares **44px in both dimensions**. Measured
 * from rendered geometry at 390px before this guard existed: **411** controls, **124**
 * below the floor - and, against what the stylesheets suggested, **0** of them narrow.
 * 106 of the 124 were small in both dimensions.
 *
 * WHAT THIS CAN AND CANNOT SEE, stated because the gap matters:
 *
 * It reads STYLESHEETS, so it catches the way this regresses in practice - somebody
 * writing `min-height: 32px` on a new chip. It cannot measure what a browser renders,
 * so a control with no size rule at all, inheriting a too-small default, is invisible
 * to it. That hole is closed for the big case by the `ion-button` / `ion-select` /
 * `ion-toggle` floor in `src/styles.scss`: the Ionic defaults - 36px, 27px for
 * `size="small"`, 38px for selects - were the single largest class of failure and are
 * now raised once, globally.
 *
 * The honest measurement remains a rendered one, and the technique is recorded in the
 * audit: `document.elementFromPoint` at the four corners of the intended 44px box,
 * which is the only check that sees a target extended by a pseudo-element AND the only
 * one that would notice two expanded targets overlapping.
 *
 * Run: npm run a11y:touch-targets
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const TOUCH_TARGET_MINIMUM = 44;

/**
 * The SUBJECT of a selector - the compound after the last combinator - because that is
 * the element the declarations size.
 *
 * Scoping this was not optional. A first version tested the whole selector string, so
 * `.excluded-character-chip img` and `.manual-candidate-load-more-button ion-spinner`
 * matched on the ancestor's name and were reported as under-sized controls. An 18px
 * image inside a chip is not a touch target; the chip is. That produced **65** findings,
 * most of them images and spinners.
 */
export function selectorSubject(selector) {
  const last = String(selector ?? '')
    .split(',')[0]
    .trim()
    .split(/\s*[\s>+~]\s*/u)
    .filter(Boolean)
    .pop();

  return last ?? '';
}

/** Things that are painted inside a control rather than being one. */
const PASSIVE_SUBJECT = /^(img|svg|span|small|strong|em|p|div|ion-icon|ion-spinner|ion-label|ion-text|ion-note|ion-img|ion-thumbnail)\b/iu;

/** A subject a finger is meant to land on. */
const INTERACTIVE_SUBJECT = /^(button|a|input|select|ion-button|ion-chip|ion-toggle|ion-select|ion-segment-button|ion-checkbox|ion-radio)\b|(__|-)(button|btn|chip|toggle|tab|option|link|action)\b/iu;

/*
 * `pill` was in that list and was removed. `.meta-pill` is a `<div>` in every one of its
 * six call sites - a badge, not an action - and flagging it led to an invisible 44px box
 * being added over a static label, which would have STOLEN taps from the controls beside
 * it. A name that describes a SHAPE does not describe an affordance.
 */

function isInteractive(selector) {
  const subject = selectorSubject(selector);

  return Boolean(subject) && !PASSIVE_SUBJECT.test(subject) && INTERACTIVE_SUBJECT.test(subject);
}

/** A declared size we can judge: `min-height: 32px` and friends. */
const SIZE = /(?:^|[;{\s])(min-height|min-width|height|width)\s*:\s*(\d+(?:\.\d+)?)px/giu;

/**
 * Sized below the floor on purpose, each with the reason.
 *
 * Two shapes live here. A control whose PAINT stays small while its TARGET is expanded
 * by a pseudo-element - that is not an exemption from the floor, it is a different way
 * of meeting it, and it is marked `hitArea`. And a genuine exemption, marked `exempt`,
 * which `docs/device-targets.md` argues for in full.
 */
export const TOUCH_TARGET_EXEMPTIONS = [
  {
    selector: '.character-thumb-card__favorite',
    kind: 'hitArea',
    reason:
      'Painted at 28px so it stays legible on a ~110px card, with a 44px target from a centred ::before. Verified with elementFromPoint at all four corners.',
  },
  {
    selector: '.captain-result__cost',
    kind: 'hitArea',
    reason:
      'Painted at 28px because it must win against the portrait behind it - its own comment records that - with a 44px target from a centred ::before.',
  },
  {
    selector: '.manual-lock-chip__icon-button',
    kind: 'hitArea',
    reason:
      'A 22px remove-icon inside a lock chip; the chip row is dense, so the paint stays and the target is expanded.',
  },
  {
    selector: '.manual-candidate-action-button',
    kind: 'hitArea',
    reason:
      'A 30px icon action on a candidate card, one of several in a row; expanded rather than raised.',
  },
  {
    selector: '.manual-candidate-branch-button',
    kind: 'hitArea',
    reason:
      'A 30px branch action beside it, same row and same reason.',
  },
  {
    selector: '.character-thumb-card__membership-action',
    kind: 'hitArea',
    reason:
      'A 32px membership toggle pinned to a ~110px card; raising it would take a third of the card.',
  },
  {
    selector: '.compare-action-button',
    kind: 'hitArea',
    reason:
      'A 32px icon action in the compare header row; expanded so the row keeps its height.',
  },
  {
    selector: '.saved-team-native-button',
    kind: 'hitArea',
    reason:
      'A 32px icon action on a saved-team row; expanded so the list keeps its density.',
  },
  {
    selector: '.slot-exclude-button',
    kind: 'hitArea',
    reason:
      'A 32px slot action pinned over a portrait; already positioned, so it only gains the target.',
  },
  {
    selector: '.slot-replace-button',
    kind: 'hitArea',
    reason:
      'A 32px slot action beside it, same row and same reason.',
  },
  {
    selector: '.favorite-button',
    kind: 'hitArea',
    reason:
      'The 34-36px heart on candidate and list rows; the paint has to stay inside the row it sits in.',
  },
  {
    selector: '.leader-role-button',
    kind: 'hitArea',
    reason:
      'A 34px leader-role icon on a candidate card, in the same row as the heart.',
  },
  {
    selector: '.ship-picker-favorite-button',
    kind: 'hitArea',
    reason:
      'A 34px heart pinned over a ship portrait; already positioned, so it only gains the target.',
  },
  {
    selector: '.compare-toggle-button',
    kind: 'hitArea',
    reason:
      'A 36px toggle in the compare header; expanded so the header keeps its height.',
  },
  {
    selector: '.manual-candidate-load-more-button',
    kind: 'hitArea',
    reason:
      'A 36px load-more control at the end of the candidate grid; expanded rather than raised.',
  },
  {
    selector: '.buff-focus-chip button',
    kind: 'hitArea',
    reason:
      'A 22px remove icon inside a buff-focus chip; the chip cannot grow around it, so the target is expanded instead.',
  },
  {
    selector: '.app-legal-nav__link',
    kind: 'exempt',
    reason:
      'Legal links in the persistent 28px footer bar. Raising them adds 16px of chrome to every screen, and an expanded hit area would steal taps from the content above.',
  },
  {
    selector: '.app-credit-badge',
    kind: 'exempt',
    reason:
      'The version and credit line in the same footer bar, for the same reason recorded in docs/device-targets.md.',
  },
  {
    selector: '.policy-link',
    kind: 'exempt',
    reason:
      "Inline inside a sentence on Settings - WCAG 2.5.8's own inline exemption, constrained by the line-height of the text around it.",
  },
];

export function inspectTouchTargets({ sources, exemptions = [] }) {
  const exempt = exemptions.map((entry) => entry.selector);
  const findings = [];
  const seen = new Set();
  let checked = 0;

  for (const [file, rawCss] of sources) {
    for (const rule of readCssRules(stripScssComments(rawCss))) {
      const selector = rule.selector.trim();

      /*
       * The exemption is matched BEFORE the interactive test, because the two ask
       * different questions. "Is this a target?" is a guess from a name; "does the code
       * this entry excuses still exist?" is not. Checking them in the other order left
       * `.character-thumb-card__favorite`, `.captain-result__cost` and `.app-credit-badge`
       * reported as stale entries while their rules were sitting right there - their
       * names simply end in `favorite`, `cost` and `badge` rather than `button`.
       */
      const excused = exempt.find((entry) => selector.includes(entry));

      if (excused) {
        seen.add(excused);
        continue;
      }

      if (!isInteractive(selector)) {
        continue;
      }

      SIZE.lastIndex = 0;
      let match = SIZE.exec(rule.declarations);

      while (match) {
        const [, property, raw] = match;
        const value = Number(raw);
        checked += 1;

        if (value > 0 && value < TOUCH_TARGET_MINIMUM) {
          findings.push({
            file,
            line: rule.line,
            selector,
            property,
            value,
            detail: `${selector} sets ${property}: ${value}px, below the ${TOUCH_TARGET_MINIMUM}px touch target docs/device-targets.md declares. Raise it, expand the target with a centred pseudo-element if the paint must stay small, or add the selector to TOUCH_TARGET_EXEMPTIONS with the reason.`,
          });
        }

        match = SIZE.exec(rule.declarations);
      }
    }
  }

  /* The list cannot outlive the code it excuses. */
  for (const entry of exemptions) {
    if (!seen.has(entry.selector)) {
      findings.push({
        file: 'TOUCH_TARGET_EXEMPTIONS',
        line: 0,
        selector: entry.selector,
        detail: `${entry.selector} is exempted but no stylesheet rule names it any more. Remove the entry.`,
      });
    }

    if (!entry.reason || entry.reason.trim().length < 20) {
      findings.push({
        file: 'TOUCH_TARGET_EXEMPTIONS',
        line: 0,
        selector: entry.selector,
        detail: `${entry.selector} needs a substantive reason.`,
      });
    }
  }

  return { findings, checked };
}

export function listStylesheets(root = projectRoot) {
  return execFileSync('git', ['ls-files', 'src'], { cwd: root, encoding: 'utf8', maxBuffer: 1e8 })
    .split('\n')
    .filter((file) => file.endsWith('.scss'));
}

function main() {
  const sources = new Map();

  for (const file of listStylesheets()) {
    try {
      sources.set(file, readFileSync(path.join(projectRoot, file), 'utf8'));
    } catch {
      /* an unreadable stylesheet sizes nothing */
    }
  }

  const { findings, checked } = inspectTouchTargets({
    sources,
    exemptions: TOUCH_TARGET_EXEMPTIONS,
  });

  if (findings.length) {
    console.error(`[a11y:touch-targets] ${findings.length} control(s) below ${TOUCH_TARGET_MINIMUM}px:\n`);

    for (const finding of findings) {
      console.error(`  - ${finding.file}:${finding.line} ${finding.detail}`);
    }

    process.exit(1);
  }

  const hitArea = TOUCH_TARGET_EXEMPTIONS.filter((entry) => entry.kind === 'hitArea').length;
  const exemptCount = TOUCH_TARGET_EXEMPTIONS.length - hitArea;

  console.log(
    `[a11y:touch-targets] ${checked} declared size(s) on interactive selectors meet ${TOUCH_TARGET_MINIMUM}px; ${hitArea} meet it by an expanded target, ${exemptCount} are exempt with a reason.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
