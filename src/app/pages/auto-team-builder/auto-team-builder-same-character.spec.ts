import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';

import { type AutoBuildManualSlotRole } from '../../core/models/auto-team-builder.models';
import { type CharacterListItem } from '../../core/models/optc.models';
import { AutoTeamBuilderPage } from './auto-team-builder.page';

vi.mock('@ionic/angular', () => ({
  AlertController: class {},
  IonCheckbox: class {},
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSegment: class {},
  IonSelect: class {},
  IonTextarea: class {},
  IonToggle: class {},
}));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-footer', () => ({ IonFooter: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-menu-button', () => ({ IonMenuButton: class {} }));
vi.mock('@ionic/angular/ion-segment-button', () => ({ IonSegmentButton: class {} }));
vi.mock('@ionic/angular/ion-select-option', () => ({ IonSelectOption: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

/*
 * 869f63grj. Before a build, Auto Team Builder names the manual picks that repeat a character, and
 * it asks the same-character rule - upstream's families first - which cards those are. The page
 * reads the manual picks as list records, so they carry `families` and no detail.
 *
 * Only the two methods that ask the rule are driven, on a page with no constructor run: both read
 * nothing but the manual slots and the records locked into them.
 */

function listItem(id: number, name: string, families: string[]): CharacterListItem {
  return { id, name, families } as unknown as CharacterListItem;
}

const LUFFY = listItem(1, 'Monkey D. Luffy', ['Monkey D. Luffy']);
const LUCY = listItem(1791, 'Lucy - Corrida Coliseum C-Block Mystery Gladiator', [
  'Monkey D. Luffy',
]);
const DOFLAMINGO_NEO = listItem(1622, 'Donquixote Doflamingo: Neo', [
  'Donquixote Doflamingo',
  'Doffy',
]);
const PICA_NEO = listItem(1646, 'Pica: Neo', ['Pica']);

function repeatedCharacterNames(
  picks: Partial<Record<AutoBuildManualSlotRole, CharacterListItem>>,
): string[] {
  const page = Object.create(AutoTeamBuilderPage.prototype) as AutoTeamBuilderPage;
  const slots = Object.entries(picks).map(([role, record]) => ({
    role,
    characterIds: [record.id],
    requiredCharacterId: null,
  }));

  Object.assign(page, {
    manualSlots: () => slots,
    lockedCharacterRecords: () =>
      Object.fromEntries(Object.values(picks).map((record) => [record.id, record])),
  });

  return (
    page as unknown as { resolveManualUniqueBaseNameConflictNames(): string[] }
  ).resolveManualUniqueBaseNameConflictNames();
}

describe('Auto Team Builder page - repeated manual picks, by families', () => {
  it('names a sub who is the Captain under another name', () => {
    expect(repeatedCharacterNames({ captain: LUFFY, sub1: LUCY })).toEqual([
      'Monkey D. Luffy',
      'Lucy - Corrida Coliseum C-Block Mystery Gladiator',
    ]);
  });

  it('does not name two characters whose card names only end the same way', () => {
    expect(repeatedCharacterNames({ captain: DOFLAMINGO_NEO, sub1: PICA_NEO })).toEqual([]);
  });

  it('leaves the Friend Captain out, as the leader-seat rule says', () => {
    expect(repeatedCharacterNames({ friendCaptain: LUFFY, sub1: LUCY })).toEqual([]);
  });
});
