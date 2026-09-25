import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FOOTER_BAR_HEIGHT_PROPERTY, followFooterBarHeight } from './footer-bar-height.utils';

/**
 * 869f63gnc. The footer wraps now, so `--app-footer-bar-height` follows the bar's measured height;
 * the floating banners sit on top of the footer by that variable.
 *
 * Every element here is detached and every observer is a fake made for its own test, because
 * `ng test` reuses its workers across spec files: a value written on the real `<html>` would reach
 * whichever file runs next in the same process.
 */

function fakeResizeObserver() {
  const instances: FakeObserver[] = [];

  class FakeObserver {
    readonly observed: { target: Element; options: ResizeObserverOptions | undefined }[] = [];
    disconnects = 0;

    constructor(private readonly callback: ResizeObserverCallback) {
      instances.push(this);
    }

    observe(target: Element, options?: ResizeObserverOptions): void {
      this.observed.push({ target, options });
    }

    unobserve(): void {
      /* the helper never unobserves one element; it disconnects */
    }

    disconnect(): void {
      this.disconnects += 1;
    }

    /** What the browser delivers after a layout that resized the bar. */
    report(entry: Partial<ResizeObserverEntry>): void {
      this.callback([entry as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
  }

  return { Observer: FakeObserver as unknown as typeof ResizeObserver, instances };
}

function borderBox(target: Element, blockSize: number): Partial<ResizeObserverEntry> {
  return { target, borderBoxSize: [{ blockSize, inlineSize: 390 }] };
}

function setUp() {
  const bar = document.createElement('div');
  const target = document.createElement('div');
  const { Observer, instances } = fakeResizeObserver();
  const stop = followFooterBarHeight(bar, target, Observer);
  const [observer] = instances;

  if (!observer) {
    throw new Error('no observer was created');
  }

  return {
    bar,
    target,
    stop,
    observer,
    read: () => target.style.getPropertyValue(FOOTER_BAR_HEIGHT_PROPERTY),
  };
}

describe('followFooterBarHeight (869f63gnc)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("writes the bar's border-box height, rounded up, and observes that box", () => {
    const { bar, observer, read } = setUp();

    expect(observer.observed).toEqual([{ target: bar, options: { box: 'border-box' } }]);
    expect(read()).toBe('');

    // One line at the default text size: 1px border, 6px padding twice, a 14.4px line of links.
    observer.report(borderBox(bar, 27.4));

    expect(read()).toBe('28px');
  });

  it('follows the bar as it wraps and unwraps, and writes only when the value changes', () => {
    const { bar, target, observer, read } = setUp();
    const setProperty = vi.spyOn(target.style, 'setProperty');

    observer.report(borderBox(bar, 27.4));
    observer.report(borderBox(bar, 27.4));
    expect(read()).toBe('28px');

    // Two lines: a 360px phone at the default text size, then 200% text.
    observer.report(borderBox(bar, 40.36));
    expect(read()).toBe('41px');
    observer.report(borderBox(bar, 63.72));
    expect(read()).toBe('64px');

    observer.report(borderBox(bar, 27.4));
    expect(read()).toBe('28px');
    expect(setProperty).toHaveBeenCalledTimes(4);
  });

  it('measures the bounding box where the WebView gives no borderBoxSize', () => {
    const { bar, observer, read } = setUp();

    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ height: 40.2 } as DOMRect);
    observer.report({ target: bar });

    expect(read()).toBe('41px');
  });

  it('stops observing and leaves nothing behind', () => {
    const { bar, target, stop, observer, read } = setUp();

    observer.report(borderBox(bar, 27.4));
    stop();

    expect(observer.disconnects).toBe(1);
    expect(read()).toBe('');
    expect(target.getAttribute('style') ?? '').toBe('');
  });

  it('leaves the value in src/styles.scss in charge where there is no ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);

    const target = document.createElement('div');
    const stop = followFooterBarHeight(document.createElement('div'), target);

    expect(() => stop()).not.toThrow();
    expect(target.style.getPropertyValue(FOOTER_BAR_HEIGHT_PROPERTY)).toBe('');
  });

  it('measures the bar without the safe-area inset, which every reader adds itself', () => {
    const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
    const component = read('src/app/app.component.ts');
    const styles = read('src/app/app.component.scss');
    const footer = /\n\.app-footer-meta \{([^}]*)\}/u.exec(styles)?.[1] ?? '';
    const bar = /\n\.app-footer-meta__inner \{([^}]*)\}/u.exec(styles)?.[1] ?? '';

    expect(component).toContain('<div class="app-footer-meta__inner" #footerBar>');
    expect(footer).toContain('padding-bottom: env(safe-area-inset-bottom);');
    expect(bar).toContain('border-top:');
    expect(bar).not.toContain('safe-area-inset');

    const stylesheets = readdirSync(resolve(process.cwd(), 'src'), {
      recursive: true,
      encoding: 'utf8',
    })
      .filter((file) => file.endsWith('.scss'))
      .map((file) => `src/${file}`);
    const readers = stylesheets.flatMap((file) =>
      read(file)
        .split(';')
        .filter((declaration) => declaration.includes(`var(${FOOTER_BAR_HEIGHT_PROPERTY})`)),
    );

    // The floating banners (twice, for the 640px layout) and the side menu when this was written.
    expect(readers.length).toBeGreaterThanOrEqual(3);

    for (const declaration of readers) {
      expect(declaration, declaration.trim()).toContain('env(safe-area-inset-bottom)');
    }
  });
});
