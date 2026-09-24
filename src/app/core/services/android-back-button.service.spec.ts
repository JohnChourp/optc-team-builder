import '@angular/compiler';
import { type EnvironmentInjector } from '@angular/core';
import { ChildrenOutletContexts, type RouterOutletContract } from '@angular/router';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AndroidBackButtonService } from './android-back-button.service';

/*
 * 869f6tcyk. The hardware back key on Home did nothing: once Ionic listens for it,
 * `@capacitor/app` never lets Android handle it, and no handler covered the root screen.
 */

type BackHandler = (processNextHandler: () => void) => unknown;

interface Registration {
  priority: number;
  handler: BackHandler;
}

/** An outlet as the service sees one: all it may ask is whether there is a page behind. */
function outlet(canGoBack: boolean): RouterOutletContract {
  return { canGoBack: () => canGoBack } as unknown as RouterOutletContract;
}

/**
 * The router's real outlet tree, shaped as this app builds it: the root outlet in
 * AppComponent, and - when the tabs shell is showing - the shell's outlet inside it.
 */
function outletTree(root: boolean, tabs?: boolean): ChildrenOutletContexts {
  const contexts = new ChildrenOutletContexts({} as EnvironmentInjector);
  contexts.onChildOutletCreated('primary', outlet(root));

  if (tabs !== undefined) {
    contexts.getOrCreateContext('primary').children.onChildOutletCreated('primary', outlet(tabs));
  }

  return contexts;
}

function start(options: { platform?: string; root: boolean; tabs?: boolean }) {
  vi.spyOn(Capacitor, 'getPlatform').mockReturnValue(options.platform ?? 'android');

  const document = new EventTarget() as unknown as Document;
  const service = new AndroidBackButtonService(document, outletTree(options.root, options.tabs));

  service.init();

  /** What every `ionBackButton` listener registers for one press, as Ionic collects it. */
  const registrations = (): Registration[] => {
    const collected: Registration[] = [];

    document.dispatchEvent(
      new CustomEvent('ionBackButton', {
        detail: {
          register: (priority: number, handler: BackHandler) => collected.push({ priority, handler }),
        },
      }),
    );

    return collected;
  };

  /**
   * One press, dispatched the way `startHardwareBackButton` in @ionic/core 9.0.4 does:
   * the highest priority runs first (the later one on a tie), and a handler reaches the
   * next only by calling `processNextHandler`.
   */
  const pressBack = (ionicHandlers: Registration[] = []): void => {
    let pending = [...ionicHandlers, ...registrations()];

    const processNext = (): void => {
      let selected: Registration | undefined;

      for (const candidate of pending) {
        if (!selected || candidate.priority >= selected.priority) {
          selected = candidate;
        }
      }

      if (selected) {
        pending = pending.filter((candidate) => candidate !== selected);
        void selected.handler(processNext);
      }
    };

    processNext();
  };

  return { service, registrations, pressBack };
}

/** `NavController` pops the route and hands the key on in the same tick. */
const navController: Registration = { priority: 0, handler: (next) => next() };
/** An open modal or alert, and the open side menu: both take the key and stop there. */
const overlay: Registration = { priority: 100, handler: () => undefined };
const menu: Registration = { priority: 99, handler: () => undefined };

describe('AndroidBackButtonService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leaves the app from Home, where no outlet has a page behind it', () => {
    const { pressBack } = start({ root: false, tabs: false });

    pressBack([navController]);

    // Minimized, not exited: the player comes back to where they were.
    expect(App.minimizeApp).toHaveBeenCalledOnce();
  });

  it('goes back instead of leaving from a screen opened from the menu', () => {
    // The tabs shell's own outlet holds Home under the current screen.
    const { pressBack } = start({ root: false, tabs: true });

    pressBack([navController]);

    expect(App.minimizeApp).not.toHaveBeenCalled();
  });

  it('goes back instead of leaving from a character page opened over the tabs shell', () => {
    // `/characters/:id` lives in the ROOT outlet, above the shell - the inner outlet alone
    // would say there is nowhere to go.
    const { pressBack } = start({ root: true, tabs: false });

    pressBack([navController]);

    expect(App.minimizeApp).not.toHaveBeenCalled();
  });

  it('never acts while a modal, an alert or the side menu has the key', () => {
    const { pressBack } = start({ root: false, tabs: false });

    pressBack([navController, overlay]);
    pressBack([navController, menu]);

    expect(App.minimizeApp).not.toHaveBeenCalled();
  });

  it('registers once, below the route pop, so Ionic keeps every back behaviour it already had', () => {
    const { registrations } = start({ root: false, tabs: false });
    const registered = registrations();

    expect(registered).toHaveLength(1);
    // A tie with NavController's 0 would let the later registration win and stop
    // routes from popping at all.
    expect(registered[0]!.priority).toBeLessThan(navController.priority);
  });

  it('registers nothing when started twice', () => {
    const { service, registrations } = start({ root: false, tabs: false });

    service.init();

    expect(registrations()).toHaveLength(1);
  });

  it('stays out of the web app and anything that is not Android', () => {
    for (const platform of ['web', 'ios']) {
      const { registrations, pressBack } = start({ platform, root: false, tabs: false });

      pressBack([navController]);

      expect(registrations(), platform).toHaveLength(0);
    }

    expect(App.minimizeApp).not.toHaveBeenCalled();
  });
});
