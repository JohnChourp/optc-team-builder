import { describe, expect, it } from 'vitest';

import {
  inspectTouchTargets,
  selectorSubject,
  TOUCH_TARGET_EXEMPTIONS,
  TOUCH_TARGET_MINIMUM,
} from './check-touch-targets.mjs';

/**
 * 869f13epp. Driven from a tree that passes, so each case changes one thing.
 *
 * The subject-scoping block is first because it is what the guard got wrong on its first
 * run: testing the whole selector string matched `.excluded-character-chip img` and
 * `.manual-candidate-load-more-button ion-spinner` on their ancestors' names, and
 * reported **65** findings, most of them images and spinners. An 18px image inside a
 * chip is not a touch target; the chip is.
 */

const rule = (selector: string, declarations: string) =>
  new Map([['src/demo.scss', `${selector} {\n${declarations}\n}\n`]]);

const run = (selector: string, declarations: string, exemptions: unknown[] = []) =>
  inspectTouchTargets({ sources: rule(selector, declarations), exemptions: exemptions as never });

describe('what the selector actually sizes', () => {
  it.each([
    ['.chip img', 'img'],
    ['.load-more-button ion-spinner', 'ion-spinner'],
    ['.a > .b + .c', '.c'],
    ['.favorite-button', '.favorite-button'],
  ])('reads %s as sizing %s', (selector, subject) => {
    expect(selectorSubject(selector)).toBe(subject);
  });

  it.each([
    ['.excluded-character-chip img', '  width: 26px;\n  height: 26px;'],
    ['.load-more-button ion-spinner', '  width: 16px;'],
    ['.card ion-label', '  min-height: 12px;'],
  ])('ignores %s, which is painted inside a control rather than being one', (sel, decl) => {
    expect(run(sel, decl).findings).toEqual([]);
  });

  /*
   * `pill` was in the interactive list and was removed: `.meta-pill` is a <div> in all
   * six of its call sites. Flagging it led to an invisible 44px box over a static label,
   * which would have stolen taps from the controls beside it.
   */
  it('does not treat a pill as an action - it names a shape, not an affordance', () => {
    expect(run('.meta-pill', '  min-height: 32px;').findings).toEqual([]);
  });
});

describe('the floor', () => {
  it('fails a control sized below it', () => {
    const { findings } = run('.view-toggle__button', '  min-height: 32px;');

    expect(findings).toHaveLength(1);
    expect(findings[0].value).toBe(32);
    expect(findings[0].detail).toContain(`${TOUCH_TARGET_MINIMUM}px touch target`);
  });

  it.each(['min-height', 'min-width', 'height', 'width'])('judges %s', (property) => {
    expect(run('.demo-button', `  ${property}: 30px;`).findings).toHaveLength(1);
  });

  it('passes a control at exactly the floor', () => {
    expect(run('.demo-button', '  min-height: 44px;').findings).toEqual([]);
  });

  it('passes a control above it', () => {
    expect(run('.demo-button', '  min-height: 48px;').findings).toEqual([]);
  });

  /* `width: 0` is a collapse, not a target. */
  it('ignores a zero size', () => {
    expect(run('.demo-button', '  min-width: 0px;').findings).toEqual([]);
  });
});

describe('the exemption list', () => {
  const small = '  min-height: 20px;';

  it('excuses a listed selector', () => {
    expect(
      run('.demo-button', small, [
        { selector: '.demo-button', kind: 'exempt', reason: 'A reason long enough to be substantive.' },
      ]).findings,
    ).toEqual([]);
  });

  it('fails an entry whose reason is a placeholder', () => {
    const { findings } = run('.demo-button', small, [
      { selector: '.demo-button', kind: 'exempt', reason: 'n/a' },
    ]);

    expect(findings.map((finding) => finding.detail)).toContain('.demo-button needs a substantive reason.');
  });

  /* The list must not outlive the code it excuses. */
  it('fails an entry no stylesheet names any more', () => {
    const { findings } = run('.demo-button', '  min-height: 44px;', [
      { selector: '.gone-for-good', kind: 'exempt', reason: 'A reason long enough to be substantive.' },
    ]);

    expect(findings.map((finding) => finding.detail).join('\n')).toContain('no stylesheet rule names it');
  });

  /*
   * The upkeep check runs BEFORE the interactive test, because the two ask different
   * questions. In the other order, `.captain-result__cost` and `.app-credit-badge` were
   * reported stale while their rules sat right there - their names end in `cost` and
   * `badge`, not `button`.
   */
  it('sees an exempted selector whose name does not look interactive', () => {
    expect(
      run('.captain-result__cost', '  min-height: 28px;', [
        { selector: '.captain-result__cost', kind: 'hitArea', reason: 'Painted small, target expanded by a pseudo-element.' },
      ]).findings,
    ).toEqual([]);
  });

  it('ships a real list where every entry carries a substantive reason', () => {
    expect(TOUCH_TARGET_EXEMPTIONS.length).toBeGreaterThan(0);

    for (const entry of TOUCH_TARGET_EXEMPTIONS) {
      expect(entry.reason.trim().length, entry.selector).toBeGreaterThanOrEqual(20);
      expect(['hitArea', 'exempt'], entry.selector).toContain(entry.kind);
    }
  });
});
