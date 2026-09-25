import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';

import { type CharacterListItem } from '../../core/models/optc.models';
import { CaptainCoveragePage } from './captain-coverage.page';

vi.mock('@ionic/angular', () => ({
  AlertController: class {},
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonToggle: class {},
}));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-footer', () => ({ IonFooter: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-menu-button', () => ({ IonMenuButton: class {} }));
vi.mock('@ionic/angular/ion-progress-bar', () => ({ IonProgressBar: class {} }));
vi.mock('@ionic/angular/ion-select-option', () => ({ IonSelectOption: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

/*
 * 869f63grj. Captain Coverage takes a result card's sub button away when the character repeats
 * someone in the team. It resolves the team's keys once and tests every card against them in its
 * own loop - the one place the page reads the keys directly - so that loop is driven here, with
 * cards whose families disagree with their names.
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

interface ConflictProbe {
  resolveSelectedTeamConflictKeys(): Set<string>;
  hasPartyConflict(character: CharacterListItem, selectedConflictKeys: Set<string>): boolean;
}

function repeatsTheTeam(
  team: Array<CharacterListItem | null>,
  candidate: CharacterListItem,
): boolean {
  const page = Object.create(CaptainCoveragePage.prototype) as CaptainCoveragePage;

  Object.assign(page, { selectedTeamSlots: () => team });

  const probe = page as unknown as ConflictProbe;

  return probe.hasPartyConflict(candidate, probe.resolveSelectedTeamConflictKeys());
}

describe('Captain Coverage - a result card that repeats the team, by families', () => {
  it('flags "Lucy" against a Luffy Captain, and Luffy against a "Lucy" Captain', () => {
    expect(repeatsTheTeam([LUFFY, null, null, null, null, null], LUCY)).toBe(true);
    expect(repeatsTheTeam([LUCY, null, null, null, null, null], LUFFY)).toBe(true);
  });

  it('does not flag "Pica: Neo" against a "Donquixote Doflamingo: Neo" Captain', () => {
    expect(repeatsTheTeam([DOFLAMINGO_NEO, null, null, null, null, null], PICA_NEO)).toBe(false);
  });

  it('never counts the Friend Captain, as the leader-seat rule says', () => {
    expect(repeatsTheTeam([null, LUFFY, null, null, null, null], LUCY)).toBe(false);
  });
});
