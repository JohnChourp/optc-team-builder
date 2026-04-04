import '@angular/compiler';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

import {
  buildSavedEnemiesExportFilename,
  buildSavedEnemiesTransferPayload,
  buildSavedEnemyExportFilename,
  downloadSavedEnemiesExport,
} from './saved-enemies-transfer.utils';

describe('Saved enemies transfer helpers', () => {
  it('builds a cloned saved enemies payload', () => {
    const enemy = buildSavedEnemy();
    const payload = buildSavedEnemiesTransferPayload(
      [enemy],
      '2026-03-25T14:05:09.000Z',
    );

    enemy.selectedTypes.push('INT');
    enemy.requiredAbilities[0]?.slotTokens.push('RCV');
    enemy.enemyMechanics[0]?.triggerTags.push('onOrbChange');

    expect(payload).toEqual({
      schemaVersion: 1,
      source: 'saved-enemies',
      exportedAt: '2026-03-25T14:05:09.000Z',
      enemies: [
        {
          id: 'enemy-1',
          name: 'Forest Boss',
          notes: 'Bring bind removal',
          imageDataUrl: 'data:image/jpeg;base64,Zm9yZXN0LWJvc3M=',
          selectedTypes: ['DEX', 'PSY'],
          selectedClasses: ['Fighter'],
          requiredAbilities: [
            {
              abilityKey: 'remove_bind',
              minTurns: 5,
              slotTokens: ['BLOCK'],
              requiredCharacterCount: 1,
            },
          ],
          enemyMechanics: [
            {
              mechanicKey: 'enemy_increased_defense',
              category: 'enemyDefense',
              minTurns: 99,
              triggerTags: ['onSpecial'],
              responseTags: ['shield'],
              conditionTags: [],
              derivedAbilityKey: 'ignore_enemy_defense',
            },
          ],
          requireAllSelectedTypesInTeam: true,
          requireAllSelectedClassesPerCharacter: false,
          requireAllSpecialsSupportTeam: true,
          createdAt: '2026-03-30T10:00:00.000Z',
          updatedAt: '2026-03-30T10:05:00.000Z',
        },
      ],
    });
  });

  it('builds the bulk export filename with the expected timestamp format', () => {
    expect(buildSavedEnemiesExportFilename('2026-03-25T14:05:09.000Z')).toBe(
      'saved-enemies-20260325-140509.json',
    );
  });

  it('builds the single export filename with a sanitized enemy name', () => {
    expect(buildSavedEnemyExportFilename(' Forest Boss / 5* ', '2026-03-25T14:05:09.000Z')).toBe(
      'saved-enemy-forest-boss-5-20260325-140509.json',
    );
  });

  it('does not start a download when the payload is missing', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const urlRef = {
      createObjectURL: vi.fn(),
      revokeObjectURL: vi.fn(),
    };

    downloadSavedEnemiesExport(null, dom.window.document, urlRef);

    expect(urlRef.createObjectURL).not.toHaveBeenCalled();
    expect(urlRef.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('downloads a single enemy export with the single-enemy filename', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const payload = buildSavedEnemiesTransferPayload(
      [buildSavedEnemy()],
      '2026-03-25T14:05:09.000Z',
    );
    const clickSpy = vi
      .spyOn(dom.window.HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const urlRef = {
      createObjectURL: vi.fn((blob: Blob) => {
        downloadedBlob = blob;
        return 'blob:saved-enemy';
      }),
      revokeObjectURL: vi.fn(),
    };
    let downloadedBlob: Blob | null = null;

    downloadSavedEnemiesExport(payload, dom.window.document, urlRef);

    expect(urlRef.createObjectURL).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(urlRef.revokeObjectURL).toHaveBeenCalledWith('blob:saved-enemy');
    expect(downloadedBlob).not.toBeNull();

    const exportedJson = JSON.parse(await downloadedBlob!.text()) as ReturnType<
      typeof buildSavedEnemiesTransferPayload
    >;

    expect(exportedJson.enemies).toHaveLength(1);
  });

  it('downloads a bulk export with the shared saved-enemies filename', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const payload = buildSavedEnemiesTransferPayload(
      [buildSavedEnemy(), buildSavedEnemy({ id: 'enemy-2', name: 'Arena Boss' })],
      '2026-03-25T14:05:09.000Z',
    );
    const clickSpy = vi
      .spyOn(dom.window.HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const urlRef = {
      createObjectURL: vi.fn(() => 'blob:saved-enemies'),
      revokeObjectURL: vi.fn(),
    };

    downloadSavedEnemiesExport(payload, dom.window.document, urlRef);

    const anchor = dom.window.document.querySelector('a');

    expect(clickSpy).toHaveBeenCalledOnce();
    expect(anchor).toBeNull();
    expect(urlRef.revokeObjectURL).toHaveBeenCalledWith('blob:saved-enemies');
  });
});

function buildSavedEnemy(overrides: Partial<ReturnType<typeof buildSavedEnemyBase>> = {}) {
  return {
    ...buildSavedEnemyBase(),
    ...overrides,
    selectedTypes: overrides.selectedTypes
      ? [...overrides.selectedTypes]
      : [...buildSavedEnemyBase().selectedTypes],
    selectedClasses: overrides.selectedClasses
      ? [...overrides.selectedClasses]
      : [...buildSavedEnemyBase().selectedClasses],
    requiredAbilities: overrides.requiredAbilities
      ? overrides.requiredAbilities.map((requirement) => ({
          ...requirement,
          slotTokens: [...requirement.slotTokens],
        }))
      : buildSavedEnemyBase().requiredAbilities.map((requirement) => ({
          ...requirement,
          slotTokens: [...requirement.slotTokens],
        })),
    enemyMechanics: overrides.enemyMechanics
      ? overrides.enemyMechanics.map((mechanic) => ({
          ...mechanic,
          triggerTags: [...mechanic.triggerTags],
          responseTags: [...mechanic.responseTags],
          conditionTags: [...mechanic.conditionTags],
        }))
      : buildSavedEnemyBase().enemyMechanics.map((mechanic) => ({
          ...mechanic,
          triggerTags: [...mechanic.triggerTags],
          responseTags: [...mechanic.responseTags],
          conditionTags: [...mechanic.conditionTags],
        })),
  };
}

function buildSavedEnemyBase() {
  return {
    id: 'enemy-1',
    name: 'Forest Boss',
    notes: 'Bring bind removal',
    imageDataUrl: 'data:image/jpeg;base64,Zm9yZXN0LWJvc3M=',
    selectedTypes: ['DEX', 'PSY'],
    selectedClasses: ['Fighter'],
    requiredAbilities: [
      {
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: ['BLOCK'],
        requiredCharacterCount: 1,
      },
    ],
    enemyMechanics: [
      {
        mechanicKey: 'enemy_increased_defense',
        category: 'enemyDefense',
        minTurns: 99,
        triggerTags: ['onSpecial'],
        responseTags: ['shield'],
        conditionTags: [],
        derivedAbilityKey: 'ignore_enemy_defense',
      },
    ],
    requireAllSelectedTypesInTeam: true,
    requireAllSelectedClassesPerCharacter: false,
    requireAllSpecialsSupportTeam: true,
    createdAt: '2026-03-30T10:00:00.000Z',
    updatedAt: '2026-03-30T10:05:00.000Z',
  };
}
