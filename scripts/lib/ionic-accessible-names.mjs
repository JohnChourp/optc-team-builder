/**
 * Two rules about the accessible NAME of an Ionic control, both measured from Ionic's own source
 * on 2026-09-22 rather than reasoned about.
 *
 * 869f13gaw / 869f13gbk asked for `aria-describedby` on the controls whose meaning their label
 * does not carry. Measured before writing any: on an Ionic control that mechanism is DEAD.
 *
 *   `node_modules/@ionic/core/dist/collection/utils/helpers.js`
 *     export const inheritAttributes = (el, attributes = []) => {
 *       ...
 *       el.removeAttribute(attr);      // <- it MOVES the attribute, it does not copy it
 *     };
 *
 *   `ariaAttributes` there lists 50 attributes and INCLUDES `aria-describedby`.
 *   `components/button/button.js` calls `inheritAriaAttributes(this.el)` in `componentWillLoad`
 *   and spreads the result onto the shadow `button.button-native`.
 *
 * So `<ion-button aria-describedby="x">` ends with that attribute on a button INSIDE the shadow
 * root, and an IDREF resolves only within its own tree scope - it can never reach `#x` in the
 * light DOM. The description reaches nobody, and nothing reports it.
 *
 * (`CLAUDE.md` says Ionic "copies" aria state into the shadow button. The source says
 * `removeAttribute`: it MOVES it. The conclusion of that rule is unaffected - a changing aria
 * state is still stale - but the mechanism is worth having right, because "copies" implies the
 * host keeps a working copy and it does not.)
 *
 * RULE A - no `aria-describedby` on an Ionic control. It is silently discarded.
 *
 * RULE B - no STATIC `aria-label` on an Ionic control whose body shows a DERIVED value.
 *   An explicit label overrides name-from-content, so the label is ALL the user gets. Measured
 *   the same day: three controls shipped that way, each announcing "Ability filters" while the
 *   screen read "3 filter(s) in 2 group(s)". The fix is to drop the label and let the slotted
 *   content name the control, with a `.visually-hidden` span carrying the context the sighted
 *   player reads from the surroundings.
 *
 *   A label built FROM the derived value is fine and is not flagged - `manual-team-builder`
 *   already does exactly that, and it was the first false positive this check produced.
 */

/** Ionic controls that render a native interactive element inside a shadow root. */
const IONIC_CONTROL = 'ion-button|ion-chip|ion-segment-button|ion-item|ion-badge';

const ELEMENT = new RegExp(`<(${IONIC_CONTROL})\\b([^>]*)>([\\s\\S]*?)</\\1>`, 'gu');
const INTERPOLATION = /\{\{([^}]*)\}\}/gu;
const ARIA_LABEL = /\[?attr\.aria-label\]?="([^"]*)"|aria-label="([^"]*)"/u;
const ARIA_DESCRIBEDBY = /\[?attr\.aria-describedby\]?=|(?:^|\s)aria-describedby=/u;

/** A translation lookup: `t('key')`, or a literal through the transloco pipe. */
const TRANSLATION_LOOKUP = /^[\s(]*(?:t\(|'[^']*'\s*\|\s*transloco|"[^"]*"\s*\|\s*transloco)/u;

/** A call in an expression - a signal or a computed, i.e. a value that is DERIVED. */
const CALL = /\w\s*\(\s*\)/u;

/**
 * A label is STATIC when it is a plain literal, or a translation lookup with no derived argument.
 * `t('x', { summary: thing() })` is NOT static: it carries the derived value into the name.
 */
function isStaticLabel(expression) {
  const trimmed = expression.trim();

  if (/^'[^']*'$/u.test(trimmed) || /^"[^"]*"$/u.test(trimmed)) {
    return true;
  }

  if (!TRANSLATION_LOOKUP.test(trimmed)) {
    return false;
  }

  return !CALL.test(trimmed.replace(/^[\s(]*t\(/u, ''));
}

/** The derived expressions a control shows in its own body, ignoring plain translation lookups. */
function derivedExpressions(body) {
  return [...body.matchAll(INTERPOLATION)]
    .map((match) => match[1].trim())
    .filter((expression) => CALL.test(expression))
    .filter((expression) => !TRANSLATION_LOOKUP.test(expression));
}

/**
 * @param {{ filePath: string, template: string }} input
 * @returns {{ filePath: string, rule: 'describedby'|'static-label', tag: string, detail: string }[]}
 */
export function inspectAccessibleNames({ filePath, template }) {
  const findings = [];

  for (const match of template.matchAll(ELEMENT)) {
    const [, tag, attributes, body] = match;

    if (ARIA_DESCRIBEDBY.test(attributes)) {
      findings.push({
        filePath,
        rule: 'describedby',
        tag,
        detail:
          `<${tag}> carries aria-describedby. Ionic MOVES it into the shadow root, where its ` +
          'IDREF cannot reach a light-DOM id, so the description reaches nobody. Name the ' +
          'control from its own content with a .visually-hidden span instead.',
      });
    }

    const labelMatch = attributes.match(ARIA_LABEL);

    if (!labelMatch) {
      continue;
    }

    const labelExpression = labelMatch[1] ?? labelMatch[2] ?? '';

    if (!isStaticLabel(labelExpression)) {
      continue;
    }

    const derived = derivedExpressions(body);

    if (derived.length === 0) {
      continue;
    }

    findings.push({
      filePath,
      rule: 'static-label',
      tag,
      detail:
        `<${tag}> has the static aria-label ${labelExpression.trim()} while its body shows the ` +
        `derived value ${derived[0].replace(/\s+/gu, ' ')}. The label overrides ` +
        'name-from-content, so the derived value never reaches a screen reader. Drop the label ' +
        'and prefix the content with a .visually-hidden span.',
    });
  }

  return findings;
}

export const ACCESSIBLE_NAME_RULES = Object.freeze(['describedby', 'static-label']);
