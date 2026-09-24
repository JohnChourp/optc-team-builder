import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { ChildrenOutletContexts, PRIMARY_OUTLET } from '@angular/router';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { BackButtonEvent, IonRouterOutlet } from '@ionic/angular';

/**
 * Below every handler Ionic registers: overlays at 100, the side menu at 99 and
 * `NavController` at 0, which pops the route and then passes the key on.
 */
const ROOT_BACK_BUTTON_PRIORITY = -1;

/**
 * 869f6tcyk. The hardware back key on Home did nothing.
 *
 * `@capacitor/app` stops Android's default back behaviour as soon as anything in the
 * page listens for `backbutton` - its native bridge adds a listener the moment Ionic
 * does - and hands every press to Ionic instead. Ionic closes an overlay (priority 100)
 * or the side menu (99), and `NavController` (0) pops the route. On Home there is no
 * route to pop, nothing else was registered, and the key was swallowed: the app stayed
 * in front, which is not what an Android player expects on the first screen.
 *
 * This is the one handler below all of those. Ionic only reaches it when no overlay or
 * menu took the key, and it acts only when no outlet has a page behind the current one.
 * It minimizes rather than exits: `moveTaskToBack` keeps the app's state for the next
 * return, which is what Android 12 and later do on a root screen anyway.
 */
@Injectable({ providedIn: 'root' })
export class AndroidBackButtonService {
  private started = false;

  public constructor(
    @Inject(DOCUMENT) private readonly document: Document,
    private readonly outletContexts: ChildrenOutletContexts,
  ) {}

  /** Registers the root back handler. No-op anywhere but native Android, and safe to call twice. */
  public init(): void {
    if (this.started || Capacitor.getPlatform() !== 'android') {
      return;
    }

    this.started = true;

    this.document.addEventListener('ionBackButton', (event) => {
      (event as BackButtonEvent).detail.register(ROOT_BACK_BUTTON_PRIORITY, () => {
        if (!this.canGoBack()) {
          void App.minimizeApp();
        }
      });
    });
  }

  /**
   * Whether any outlet showing the current page still has a page behind it: the tabs
   * shell's outlet for a screen opened from the menu, the root outlet for a character
   * page opened over the shell.
   *
   * This is the question `NavController.pop()` answers by walking the same outlets, and
   * it is still answerable here: that pop only STARTS a navigation before handing the key
   * on, and no outlet's stack changes until the navigation activates.
   */
  private canGoBack(): boolean {
    let contexts: ChildrenOutletContexts | undefined = this.outletContexts;

    while (contexts) {
      const context = contexts.getContext(PRIMARY_OUTLET);
      const outlet = context?.outlet as Partial<IonRouterOutlet> | null | undefined;

      if (outlet?.canGoBack?.()) {
        return true;
      }

      contexts = context?.children;
    }

    return false;
  }
}
