/**
 * Keeps `--app-footer-bar-height` equal to the footer bar's rendered height.
 *
 * 869f63gnc. The footer's legal links are readable now - 0.75rem, from 0.56rem - so on a narrow
 * phone or at a large system text size the bar wraps onto a second line instead of scrolling
 * Cookies and Terms out of sight. The variable used to hold a fixed 34px, a guess at the one-line
 * bar, and the floating banners (update, install, offline, analytics consent) sit on top of the
 * footer by it: on a wrapped bar they would have covered the links.
 *
 * The bar is `.app-footer-meta__inner`, border included. The safe-area inset is padding on
 * `.app-footer-meta`, outside it, because every reader of the variable adds
 * `env(safe-area-inset-bottom)` itself.
 */
export const FOOTER_BAR_HEIGHT_PROPERTY = '--app-footer-bar-height';

/**
 * Writes the bar's height to `target` whenever it changes, and returns the function that stops
 * doing so and removes the value again. Without `ResizeObserver` it does nothing, and the value in
 * `src/styles.scss` stays in charge.
 */
export function followFooterBarHeight(
  bar: HTMLElement,
  target: HTMLElement,
  Observer: typeof ResizeObserver | undefined = globalThis.ResizeObserver,
): () => void {
  if (typeof Observer !== 'function') {
    return () => undefined;
  }

  let written = '';
  const observer = new Observer((entries) => {
    const entry = entries[entries.length - 1];

    if (!entry) {
      return;
    }

    const height =
      entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
    // Rounded UP: a banner a fraction of a pixel too high is invisible, one on top of the bar is not.
    const value = `${Math.ceil(height)}px`;

    if (value !== written) {
      target.style.setProperty(FOOTER_BAR_HEIGHT_PROPERTY, value);
      written = value;
    }
  });

  observer.observe(bar, { box: 'border-box' });

  return () => {
    observer.disconnect();
    target.style.removeProperty(FOOTER_BAR_HEIGHT_PROPERTY);
  };
}
