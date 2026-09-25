import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppI18nService } from '../core/services/app-i18n.service';
import { GoogleAccountService } from '../core/services/google-account.service';
import { createAndroidGoogleAccount } from '../testing/google-sign-in-availability';
import { renderTemplateControlFlow } from '../testing/template-control-flow';
import { TabsPage } from './tabs.page';

// IonModal and the two button modules are for the What's New modal the menu imports.
vi.mock('@ionic/angular', () => ({ IonIcon: class {}, IonModal: class {}, IonRouterOutlet: class {} }));
vi.mock('@ionic/angular/ion-accordion', () => ({ IonAccordion: class {} }));
vi.mock('@ionic/angular/ion-accordion-group', () => ({ IonAccordionGroup: class {} }));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-item', () => ({ IonItem: class {} }));
vi.mock('@ionic/angular/ion-label', () => ({ IonLabel: class {} }));
vi.mock('@ionic/angular/ion-list', () => ({ IonList: class {} }));
vi.mock('@ionic/angular/ion-menu', () => ({ IonMenu: class {} }));
vi.mock('@ionic/angular/ion-menu-toggle', () => ({ IonMenuToggle: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

/*
 * 869f63gqt. The side menu's Log in row, on a build that can sign in and on one that cannot.
 *
 * The APK is built without the Google web client id, and there the row rendered disabled with
 * nothing saying why. It must not be offered at all - and it must come back by itself when an
 * Android build carries the id, so both states are built on the REAL account service, and the
 * template is rendered from source for each.
 */

const TEMPLATE = readFileSync(resolve(process.cwd(), 'src/app/layout/tabs.page.html'), 'utf8');

function createMenu(googleAccount: GoogleAccountService): TabsPage {
  const injector = Injector.create({
    providers: [
      { provide: GoogleAccountService, useValue: googleAccount },
      {
        provide: AppI18nService,
        useValue: { activeLanguage: signal('en'), setLanguage: vi.fn() },
      },
    ],
  });

  return runInInjectionContext(injector, () => new TabsPage());
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the side menu offers Google sign-in only where it can work', () => {
  it('asks the account service itself, so a build that gains the client id needs no change here', async () => {
    const googleAccount = await createAndroidGoogleAccount({ clientIdConfigured: false });

    expect(createMenu(googleAccount).googleAccountAvailable).toBe(googleAccount.isAvailable);
  });

  it('shows no Log in row, and no empty account slot, in an Android build without the client id', async () => {
    const menu = createMenu(await createAndroidGoogleAccount({ clientIdConfigured: false }));
    const rendered = renderTemplateControlFlow(TEMPLATE, menu);

    expect(menu.googleAccountAvailable()).toBe(false);
    expect(rendered).not.toContain('signInWithGoogle()');
    expect(rendered).not.toContain("'tabs.login' | transloco");
    expect(rendered).not.toContain('tabs-menu__account-entry');
    // The control: the rest of the menu is still there.
    expect(rendered).toContain('[routerLink]="[settingsNavItem.route]"');
  });

  it('offers Log in again, enabled, once the Android build carries the client id', async () => {
    const menu = createMenu(await createAndroidGoogleAccount({ clientIdConfigured: true }));
    const rendered = renderTemplateControlFlow(TEMPLATE, menu);

    expect(menu.googleAccountAvailable()).toBe(true);
    expect(rendered).toContain('(click)="signInWithGoogle()"');
    expect(rendered).toContain("'tabs.login' | transloco");
    expect(rendered).toContain(`[disabled]="googleAccountStatus() === 'signing-in'"`);
  });

  it('shows the signed-in account row, not Log in, once the reader is signed in', async () => {
    const googleAccount = await createAndroidGoogleAccount({ clientIdConfigured: true });

    googleAccount.profile.set({
      email: 'captain@example.com',
      familyName: null,
      givenName: null,
      id: 'google-user-1',
      imageUrl: null,
      name: 'Captain',
    });
    googleAccount.status.set('signed-in');

    const rendered = renderTemplateControlFlow(TEMPLATE, createMenu(googleAccount));

    expect(rendered).toContain('[routerLink]="[accountRoute]"');
    expect(rendered).not.toContain('signInWithGoogle()');
  });
});
