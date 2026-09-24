import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type GoogleAccountService } from '../../core/services/google-account.service';
import { createAndroidGoogleAccount } from '../../testing/google-sign-in-availability';
import { SettingsPage } from './settings.page';

vi.mock('@ionic/angular', () => ({ IonSelect: class {}, IonToggle: class {} }));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-label', () => ({ IonLabel: class {} }));
vi.mock('@ionic/angular/ion-menu-button', () => ({ IonMenuButton: class {} }));
vi.mock('@ionic/angular/ion-select-option', () => ({ IonSelectOption: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

/*
 * 869f63gqt. After an inventory capture is committed, Settings told the player they could now
 * back it up with Google Drive sync - on the APK too, where sign-in cannot work. Where it
 * cannot, the same line now points at Export all data.
 */

const DRIVE_HINT = 'management.inventoryCapture.feedback.driveHint';
const EXPORT_HINT = 'management.inventoryCapture.feedback.exportHint';

function createSettings(googleAccount: GoogleAccountService) {
  const inventoryCaptureImport = {
    applyPreview: vi.fn().mockResolvedValue({
      addedShipCount: 0,
      alreadyFavoritedShipCount: 0,
      alreadyInBoxCount: 0,
      boxAction: 'created',
      boxName: 'Screenshot Box',
      matchedCharacterCount: 1,
      matchedShipCount: 0,
      unmatchedCount: 0,
    }),
  };
  const page = new SettingsPage(
    {} as never,
    { translate: (key: string) => key } as never,
    {} as never,
    {} as never,
    { available: false, consent: signal('unknown') } as never,
    {} as never,
    inventoryCaptureImport as never,
    {} as never,
    googleAccount,
    {
      manualSyncPrompt: signal(null),
      metadata: signal({ remoteSummary: null }),
      remoteBackup: signal(null),
      syncStatus: signal({ detail: null, phase: 'idle' }),
    } as never,
    { entries: signal([]) } as never,
  );

  page.inventoryCapturePreview.set({
    capturedAt: '2026-09-25T10:00:00.000Z',
    duplicateCharacterCount: 0,
    duplicateShipCount: 0,
    extractedText: '1001',
    fileName: 'inventory.png',
    invalidCharacterCount: 0,
    invalidShipCount: 0,
    matchedCharacters: [],
    matchedShips: [],
    payload: {
      schemaVersion: 1,
      source: 'inventory-capture',
      capturedAt: '2026-09-25T10:00:00.000Z',
      characterIds: [1001],
      shipIds: [],
      unmatchedEntries: [],
    },
    sourceKind: 'screenshot',
    suggestedBoxName: 'Screenshot Box',
  });
  page.inventoryCaptureBoxName.set('Screenshot Box');

  return page;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the inventory capture feedback names a route that works on this build', () => {
  it('points at Export all data, not Drive sync, in an Android build without the client id', async () => {
    const page = createSettings(await createAndroidGoogleAccount({ clientIdConfigured: false }));

    await page.commitInventoryCapture();

    expect(page.inventoryCaptureFeedback()?.tone).toBe('success');
    expect(page.inventoryCaptureFeedback()?.details).toContain(EXPORT_HINT);
    expect(page.inventoryCaptureFeedback()?.details).not.toContain(DRIVE_HINT);
  });

  it('keeps the Drive sync hint once the build carries the client id', async () => {
    const page = createSettings(await createAndroidGoogleAccount({ clientIdConfigured: true }));

    await page.commitInventoryCapture();

    expect(page.inventoryCaptureFeedback()?.details).toContain(DRIVE_HINT);
    expect(page.inventoryCaptureFeedback()?.details).not.toContain(EXPORT_HINT);
  });

  it('words the export hint in both languages, naming the export button as each language labels it', () => {
    const read = (file: string) => JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8'));
    const english = read('public/i18n/settings/en.json');
    const greek = read('public/i18n/settings/el.json');

    expect(english.management.inventoryCapture.feedback.exportHint).toContain(
      english.management.allData.export,
    );
    expect(english.management.inventoryCapture.feedback.exportHint).not.toMatch(/drive|google/iu);
    expect(greek.management.inventoryCapture.feedback.exportHint).toContain(`«${greek.management.allData.export}»`);
    expect(greek.management.inventoryCapture.feedback.exportHint).not.toMatch(/drive|google/iu);
  });
});
