/**
 * 869f138q3. Every `<ion-modal>` announces its own name, and a new one cannot ship without.
 *
 * Ionic renders the dialog inside the modal's shadow root and gives it no accessible name of its
 * own, so a screen reader announces "dialog" and nothing else unless the app sets one. That is what
 * `src/app/shared/a11y/ionic-modal-dialog-label.utils.ts` exists for - and it was being applied the
 * way such requirements always are, at the call sites somebody remembered.
 *
 * Measured 2026-09-17, before this guard: **22 modals across 15 files, 9 labelling calls, and 7
 * files with none at all** - both Auto Team Builder pickers, the What's new modal, the ship picker,
 * Characters, Account, Rumble and Saved Rumble Teams.
 *
 * This is the same family as the overlay-contrast rule, and it gets the same answer: not a patch
 * per call site, which the next modal inherits nothing from, but a check that fails when a modal
 * has no label. The rule a modal has to satisfy is deliberately about BEHAVIOUR rather than about
 * one helper's name - a modal is labelled when presenting it runs something that labels it, and the
 * check follows the handler into the component to confirm that it does.
 */

/** `<ion-modal` up to the `>` that closes its own tag, quotes respected. */
export function extractModalTags(template) {
  const tags = [];
  const pattern = /<ion-modal\b/gu;
  let match = pattern.exec(template);

  while (match) {
    let index = match.index + match[0].length;
    let quote = null;

    while (index < template.length) {
      const character = template[index];

      if (quote) {
        if (character === quote) {
          quote = null;
        }
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        break;
      }

      index += 1;
    }

    tags.push({
      text: template.slice(match.index, index + 1),
      line: template.slice(0, match.index).split('\n').length,
    });
    match = pattern.exec(template);
  }

  return tags;
}

/**
 * Does the tag itself carry an accessible name?
 *
 * `ionic-modal-dialog-label.utils.ts` records that Ionic copies the modal's own label onto its
 * inner dialog once, when it loads - so a name that is already resolved at that point is enough,
 * and forcing a (didPresent) hook onto a modal whose title never changes would be ceremony. The
 * hook is what a CHANGING title needs, which no static check can tell apart from a fixed one.
 */
export function hasStaticAriaLabel(modalTag) {
  return /(?:\[attr\.aria-label\]|aria-label)\s*=\s*"[^"]*\S[^"]*"/u.test(modalTag);
}

/** The method a `(didPresent)` binding calls, or null when the modal binds nothing. */
export function readDidPresentHandler(modalTag) {
  const match = /\(didPresent\)\s*=\s*"([^"]*)"/u.exec(modalTag);

  if (!match) {
    return null;
  }

  const call = /([A-Za-z_$][\w$]*)\s*\(/u.exec(match[1]);

  return call ? call[1] : null;
}

export const LABEL_FUNCTIONS = Object.freeze([
  'applyIonicModalDialogLabel',
  'applyIonicModalDialogLabelToElement',
]);

/**
 * Does `handler`, defined in `source`, label the dialog?
 *
 * One hop only: the handler itself must call the utility, or call a method that does. Deeper than
 * that and the check becomes a call-graph analysis whose failures nobody can read - and a labelling
 * path three methods deep is worth flattening anyway.
 */
export function handlerLabelsDialog(source, handler, depth = 0) {
  if (!handler || depth > 1) {
    return false;
  }

  const body = readMethodBody(source, handler);

  if (body === null) {
    return false;
  }

  if (LABEL_FUNCTIONS.some((name) => body.includes(`${name}(`))) {
    return true;
  }

  return [...body.matchAll(/this\.([A-Za-z_$][\w$]*)\s*\(/gu)].some(([, nested]) =>
    handlerLabelsDialog(source, nested, depth + 1),
  );
}

/** The braces of `name(...) { … }`, matched rather than regexed, so a nested brace cannot end it. */
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
    const character = source[index];

    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;

      if (depth === 0) {
        return source.slice(open + 1, index);
      }
    }
  }

  return null;
}

/**
 * A file's modals against the component behind them.
 *
 * `source` is the component the template belongs to - the sibling `.ts` for an external template,
 * and the same file for an inline one.
 */
export function inspectModalLabels({ filePath, template, source }) {
  return extractModalTags(template).flatMap((tag) => {
    const handler = readDidPresentHandler(tag.text);
    const staticLabel = hasStaticAriaLabel(tag.text);

    if (handler && handlerLabelsDialog(source, handler)) {
      return [];
    }

    if (staticLabel) {
      return [];
    }

    if (handler) {
      return [
        {
          kind: 'did-present-does-not-label',
          filePath,
          line: tag.line,
          detail: `has no aria-label, and its (didPresent) calls ${handler}(), which never reaches applyIonicModalDialogLabel`,
        },
      ];
    }

    return [
      {
        kind: 'modal-without-label',
        filePath,
        line: tag.line,
        detail:
          'has no accessible name - give it an aria-label, or bind (didPresent) to something that calls applyIonicModalDialogLabel',
      },
    ];
  });
}
