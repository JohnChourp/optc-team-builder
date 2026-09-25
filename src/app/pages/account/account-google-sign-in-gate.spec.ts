import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type GoogleAccountService } from '../../core/services/google-account.service';
import { createAndroidGoogleAccount } from '../../testing/google-sign-in-availability';
import { renderTemplateControlFlow } from '../../testing/template-control-flow';
import { AccountPage } from './account.page';

vi.mock('@ionic/angular', () => ({ IonIcon: class {}, IonModal: class {} }));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-menu-button', () => ({ IonMenuButton: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

/*
 * 869f63gqt. The Account page - where Home's old "Set up Drive sync" led - on a build that can
 * sign in and on one that cannot.
 *
 * On the APK it said "Google sign-in is not configured for this build" over a disabled button,
 * then showed the whole Drive status card with nothing to act on. There it must say, plainly,
 * that this version of the Android app cannot sign in and that data moves by Export and Import.
 */

const TEMPLATE = readFileSync(resolve(process.cwd(), 'src/app/pages/account/account.page.html'), 'utf8');

function createAccountPage(googleAccount: GoogleAccountService): AccountPage {
  const driveBackup = {
    manualSyncPrompt: signal(null),
    metadata: signal({ remoteSummary: null }),
    ready: vi.fn().mockResolvedValue(undefined),
    syncStatus: signal({ detail: null, phase: 'idle' }),
  };
  const i18n = { translate: (key: string) => key };

  return new AccountPage(
    driveBackup as never,
    googleAccount,
    i18n as never,
    {} as never,
    { getSyncScopeSummary: () => ({}) } as never,
  );
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the Account page offers Google sign-in and Drive sync only where they can work', () => {
  it('asks the account service itself, so a build that gains the client id needs no change here', async () => {
    const googleAccount = await createAndroidGoogleAccount({ clientIdConfigured: false });

    expect(createAccountPage(googleAccount).googleAccountAvailable).toBe(googleAccount.isAvailable);
  });

  it('says plainly, without the client id, that this version cannot sign in and how data moves', async () => {
    const rendered = renderTemplateControlFlow(
      TEMPLATE,
      createAccountPage(await createAndroidGoogleAccount({ clientIdConfigured: false })),
    );
    const english = JSON.parse(readFileSync(resolve(process.cwd(), 'public/i18n/settings/en.json'), 'utf8'));
    const greek = JSON.parse(readFileSync(resolve(process.cwd(), 'public/i18n/settings/el.json'), 'utf8'));

    expect(rendered).toContain('data-test="account-google-unavailable"');
    expect(rendered).toContain("t('account.unavailableTitle')");
    expect(rendered).toContain("t('account.unavailableCopy')");
    expect(rendered).toContain(`[routerLink]="['/tabs/settings']"`);
    expect(rendered).toContain("t('account.openSettings')");
    // The words, in both languages: the Android app, no sign-in, and Export / Import.
    expect(english.account.unavailableCopy).toMatch(/Android app cannot sign in/u);
    expect(english.account.unavailableCopy).toMatch(/Export all data.*Import all data/u);
    expect(greek.account.unavailableCopy).toMatch(/εφαρμογής Android δεν μπορεί να συνδεθεί/u);
    expect(greek.account.unavailableCopy).toMatch(/«Εξαγωγή όλων».*«Εισαγωγή όλων»/u);
  });

  it('offers nothing to sign in to, and no Drive card, without the client id', async () => {
    const rendered = renderTemplateControlFlow(
      TEMPLATE,
      createAccountPage(await createAndroidGoogleAccount({ clientIdConfigured: false })),
    );

    expect(rendered).not.toContain('signInWithGoogle()');
    expect(rendered).not.toContain('syncDriveNow()');
    expect(rendered).not.toContain('class="glass-card drive-sync-hero"');
    expect(rendered).not.toContain("t('driveSync.status.title')");
    expect(rendered).not.toContain("t('account.signedOutCopy')");
  });

  it('offers sign-in and the Drive card again once the build carries the client id', async () => {
    const rendered = renderTemplateControlFlow(
      TEMPLATE,
      createAccountPage(await createAndroidGoogleAccount({ clientIdConfigured: true })),
    );

    // Once in the hero, once on the Drive card - exactly as before the gate existed.
    expect(count(rendered, '(click)="signInWithGoogle()"')).toBe(2);
    expect(rendered).toContain("t('account.signedOutCopy')");
    expect(rendered).toContain('class="glass-card drive-sync-hero"');
    expect(rendered).toContain("t('driveSync.status.title')");
    expect(rendered).not.toContain('account-google-unavailable');
    expect(rendered).not.toContain("t('account.unavailableCopy')");
    expect(rendered).not.toContain("t('account.openSettings')");
  });

  it('shows the signed-in actions, and no sign-in button, once the reader is signed in', async () => {
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

    const rendered = renderTemplateControlFlow(TEMPLATE, createAccountPage(googleAccount));

    expect(rendered).toContain('(click)="syncDriveNow()"');
    expect(rendered).toContain('(click)="signOutGoogle()"');
    expect(rendered).not.toContain('signInWithGoogle()');
    expect(rendered).not.toContain('account-google-unavailable');
  });
});
