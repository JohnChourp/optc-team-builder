/**
 * 869f138pv. Every shared picker closes the same way, and a new one cannot close differently.
 *
 * The task asked for a behavioural consistency pass across the shared components. Measured on
 * 2026-09-17, most of what it suspected was already true - all six modal pickers have empty states,
 * and all six already share one dismissal contract to the line. What nothing protected was that
 * contract itself, and it is the one interaction where a divergence would be invisible: a pop-up
 * that keeps a draft when you tap the backdrop, in an app where every other pop-up throws it away.
 *
 * The contract, read out of the six that implement it:
 *
 * 1. the component holds a `dismissReason` of `'save' | 'cancel' | null`, reset to null when the
 *    modal opens;
 * 2. the save path sets it to `'save'` before emitting its selection;
 * 3. the cancel path sets it to `'cancel'` before emitting `dismiss`;
 * 4. `(didDismiss)` - which Ionic fires for EVERY close, including the backdrop and Escape -
 *    consumes a non-null reason and returns, and otherwise emits `dismiss`.
 *
 * So a close the host did not route is treated exactly as Cancel, and an explicit Save or Cancel
 * does not emit twice. Both halves matter, and neither is visible from any single call site.
 *
 * What this guard deliberately does NOT enforce: whether a picker confirms or applies live. Two of
 * the six - the ability requirement picker and the special ability picker - build a multi-field
 * DRAFT, which needs a confirm step; the other four pick one thing, where a confirm step is a
 * button in the way. That difference is the shape of what is being picked, not an inconsistency,
 * and a guard that flattened it would be making the app worse on purpose.
 */

export const DISMISS_REASON_FIELD = 'dismissReason';

/** The `(didDismiss)` handler name, or null when the modal binds nothing. */
export function readDismissHandler(template) {
  const match = /\(didDismiss\)\s*=\s*"([^"]*)"/u.exec(template);

  if (!match) {
    return null;
  }

  const call = /([A-Za-z_$][\w$]*)\s*\(/u.exec(match[1]);

  return call ? call[1] : null;
}

/** The braces of `name(...) { … }`, matched rather than regexed. */
export function readMethodBody(source, name) {
  const declaration = new RegExp(`\\b${name}\\s*\\(`, 'u').exec(source);

  if (!declaration) {
    return null;
  }

  const open = source.indexOf('{', declaration.index);

  if (open < 0) {
    return null;
  }

  let depth = 0;

  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
    } else if (source[index] === '}') {
      depth -= 1;

      if (depth === 0) {
        return source.slice(open + 1, index);
      }
    }
  }

  return null;
}

/**
 * One shared component against the contract.
 *
 * `filePath` is the template; `source` is the component beside it. A component with no `<ion-modal>`
 * is not a picker and is not the subject of this rule.
 */
export function inspectPickerDismissal({ filePath, template, source }) {
  if (!template.includes('<ion-modal')) {
    return [];
  }

  const handler = readDismissHandler(template);

  if (!handler) {
    return [
      {
        kind: 'picker-without-dismiss-binding',
        filePath,
        detail:
          'binds no (didDismiss), so a backdrop or Escape close tells the host nothing - bind it to a handler that emits dismiss',
      },
    ];
  }

  const findings = [];

  if (!new RegExp(`\\b${DISMISS_REASON_FIELD}\\b`, 'u').test(source)) {
    findings.push({
      kind: 'picker-without-dismiss-reason',
      filePath,
      detail: `has no ${DISMISS_REASON_FIELD}, so it cannot tell a close it routed from one the reader made`,
    });
  }

  const body = readMethodBody(source, handler);

  if (body === null) {
    findings.push({
      kind: 'dismiss-handler-missing',
      filePath,
      detail: `(didDismiss) calls ${handler}(), which the component does not declare`,
    });

    return findings;
  }

  if (!body.includes(DISMISS_REASON_FIELD)) {
    findings.push({
      kind: 'dismiss-handler-ignores-reason',
      filePath,
      detail: `${handler}() never reads ${DISMISS_REASON_FIELD}, so an explicit Save or Cancel emits dismiss a second time`,
    });
  }

  if (!/\bdismiss\s*\.\s*emit\s*\(/u.test(body)) {
    findings.push({
      kind: 'dismiss-handler-does-not-emit',
      filePath,
      detail: `${handler}() never emits dismiss, so closing on the backdrop leaves the host believing the pop-up is still open`,
    });
  }

  return findings;
}
