import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GoogleAccountService } from '../../core/services/google-account.service';
import {
  UserDataTransferService,
  type SyncScopeSummary,
} from '../../core/services/user-data-transfer.service';
import { createAndroidGoogleAccount } from '../../testing/google-sign-in-availability';
import { renderTemplateControlFlow } from '../../testing/template-control-flow';
import {
  FIRST_RUN_TRANSFER_DISMISSED_KEY,
  FRESH_INSTALL_BASELINE,
  TRANSFERABLE_SCOPE_COUNTS,
} from './first-run-transfer.utils';
import { HomePage } from './home.page';

vi.mock('@ionic/angular', () => ({ IonIcon: class {} }));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-menu-button', () => ({ IonMenuButton: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

/*
 * 869f63gqt. Home on a build that can sign in and on one that cannot.
 *
 * On the APK, built without the Google web client id, the first-run card's primary red button
 * was "Set up Drive sync" and led to a page that could not sign in, and the Google panel said
 * "Log in for Drive sync" over a disabled button. There, the card must offer the file route as
 * its primary action and stop promising Drive, and the panel must say how data does move.
 */

const TEMPLATE = readFileSync(resolve(process.cwd(), 'src/app/pages/home/home.page.html'), 'utf8');

/** A genuinely fresh install, so the first-run card is on screen in every state below. */
const FRESH_INSTALL = Object.fromEntries(
  TRANSFERABLE_SCOPE_COUNTS.map((key) => [
    key,
    (FRESH_INSTALL_BASELINE as Partial<Record<string, number>>)[key] ?? 0,
  ]),
) as SyncScopeSummary;

function createHome(googleAccount: GoogleAccountService): HomePage {
  const injector = Injector.create({
    providers: [
      { provide: GoogleAccountService, useValue: googleAccount },
      { provide: UserDataTransferService, useValue: { getSyncScopeSummary: () => FRESH_INSTALL } },
    ],
  });

  return runInInjectionContext(injector, () => new HomePage());
}

/** The opening tag of the `<ion-button>` whose content holds `marker`. */
function buttonAround(rendered: string, marker: string): string {
  const at = rendered.indexOf(marker);

  expect(at, `${marker} is not rendered`).toBeGreaterThan(-1);

  const open = rendered.lastIndexOf('<ion-button', at);

  return rendered.slice(open, rendered.indexOf('>', open) + 1);
}

beforeEach(() => {
  globalThis.localStorage?.removeItem(FIRST_RUN_TRANSFER_DISMISSED_KEY);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Home offers Google sign-in and Drive sync only where they can work', () => {
  it('asks the account service itself, so a build that gains the client id needs no change here', async () => {
    const googleAccount = await createAndroidGoogleAccount({ clientIdConfigured: false });

    expect(createHome(googleAccount).googleAccountAvailable).toBe(googleAccount.isAvailable);
  });

  describe('in an Android build without the client id', () => {
    it('makes importing a file the first-run card primary action, and drops the Drive route', async () => {
      const home = createHome(await createAndroidGoogleAccount({ clientIdConfigured: false }));
      const rendered = renderTemplateControlFlow(TEMPLATE, home);

      expect(home.showFirstRunTransferNotice()).toBe(true);
      expect(rendered).toContain('data-test="home-first-run-transfer"');
      expect(rendered).not.toContain("'/tabs/drive-sync'");
      expect(rendered).not.toContain("t('firstRunTransfer.drive')");

      const importButton = buttonAround(rendered, "t('firstRunTransfer.import')");

      expect(importButton).toContain('fill="solid"');
      expect(importButton).not.toContain('color="light"');
      expect(importButton).toContain(`[routerLink]="['/tabs/settings']"`);
    });

    it('stops telling the player to use Google Drive sync in the first-run copy', async () => {
      const rendered = renderTemplateControlFlow(
        TEMPLATE,
        createHome(await createAndroidGoogleAccount({ clientIdConfigured: false })),
      );
      const read = (file: string) => JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8'));
      const english = read('public/i18n/en.json');
      const greek = read('public/i18n/el.json');

      expect(rendered).toContain("t('firstRunTransfer.bodyFileOnly')");
      expect(rendered).not.toContain("t('firstRunTransfer.body')");
      expect(english.home.firstRunTransfer.bodyFileOnly).not.toMatch(/drive|google/iu);
      expect(english.home.firstRunTransfer.bodyFileOnly).toContain('a file you exported from Settings');
      expect(greek.home.firstRunTransfer.bodyFileOnly).not.toMatch(/drive|google/iu);
      expect(greek.home.firstRunTransfer.bodyFileOnly).toContain('αρχείο που εξήγαγες από τις Ρυθμίσεις');
    });

    it('replaces the Google panel dead end with where data lives and how it moves', async () => {
      const rendered = renderTemplateControlFlow(
        TEMPLATE,
        createHome(await createAndroidGoogleAccount({ clientIdConfigured: false })),
      );

      expect(rendered).toContain('data-test="home-account-unavailable"');
      expect(rendered).toContain("t('account.unavailableTitle')");
      expect(rendered).toContain("t('account.unavailableCopy')");
      expect(buttonAround(rendered, "t('account.actions.openSettings')")).toContain(
        `[routerLink]="['/tabs/settings']"`,
      );
      expect(rendered).not.toContain('signInWithGoogle()');
      expect(rendered).not.toContain("t('account.signedOutTitle')");
      expect(rendered).not.toContain("t('account.actions.signIn')");
    });
  });

  describe('once the build carries the client id - the website today', () => {
    it('keeps the first-run card exactly as it was: Drive sync first, a file second', async () => {
      const rendered = renderTemplateControlFlow(
        TEMPLATE,
        createHome(await createAndroidGoogleAccount({ clientIdConfigured: true })),
      );

      expect(rendered).toContain("t('firstRunTransfer.body')");
      expect(rendered).not.toContain("t('firstRunTransfer.bodyFileOnly')");
      expect(buttonAround(rendered, "t('firstRunTransfer.drive')")).toContain('fill="solid"');
      expect(buttonAround(rendered, "t('firstRunTransfer.drive')")).toContain(`[routerLink]="['/tabs/drive-sync']"`);
      expect(buttonAround(rendered, "t('firstRunTransfer.import')")).toContain('fill="outline" color="light"');
    });

    it('offers sign-in in the Google panel again, and none of the unavailable copy', async () => {
      const rendered = renderTemplateControlFlow(
        TEMPLATE,
        createHome(await createAndroidGoogleAccount({ clientIdConfigured: true })),
      );

      expect(rendered).toContain('(click)="signInWithGoogle()"');
      expect(rendered).toContain("t('account.signedOutTitle')");
      expect(rendered).toContain("t('account.actions.signIn')");
      expect(rendered).not.toContain('home-account-unavailable');
      expect(rendered).not.toContain("t('account.unavailableCopy')");
      expect(rendered).not.toContain("t('account.actions.openSettings')");
    });
  });
});
