import { Injectable, Optional, computed, signal } from '@angular/core';

import { type LocalCharacterOverride } from '../models/optc.models';
import { DriveSyncStateService } from './drive-sync-state.service';
import {
  normalizeLocalCharacterOverride,
  type LocalCharacterOverrideInput,
} from './character-overrides.utils';
import { PreferencesAdapterService } from './preferences-adapter.service';

const CHARACTER_OVERRIDES_KEY = 'characterOverrides';

@Injectable({ providedIn: 'root' })
export class CharacterOverridesService {
  public readonly overrides = signal<LocalCharacterOverride[]>([]);
  public readonly overridesByCharacterId = computed(
    () => new Map(this.overrides().map((override) => [override.characterId, override] as const)),
  );
  public readonly revision = signal(0);

  private readonly hydratePromise: Promise<void>;

  public constructor(
    private readonly preferences: PreferencesAdapterService,
    @Optional() private readonly driveSyncState?: DriveSyncStateService,
  ) {
    this.hydratePromise = this.hydrate();
  }

  public async ready(): Promise<void> {
    await this.hydratePromise;
  }

  public getOverrideByCharacterId(characterId: number): LocalCharacterOverride | null {
    return this.overridesByCharacterId().get(characterId) ?? null;
  }

  public hasOverride(characterId: number): boolean {
    return this.overridesByCharacterId().has(characterId);
  }

  public async saveOverride(
    input: LocalCharacterOverrideInput | LocalCharacterOverride,
  ): Promise<LocalCharacterOverride | null> {
    await this.ready();

    const existing = this.getOverrideByCharacterId(input.characterId);
    const normalizedOverride = normalizeLocalCharacterOverride(input, existing);

    if (!normalizedOverride) {
      return null;
    }

    const nextOverrides = existing
      ? this.overrides().map((override) =>
          override.characterId === normalizedOverride.characterId ? normalizedOverride : override,
        )
      : [normalizedOverride, ...this.overrides()];

    await this.replaceOverrides(nextOverrides);

    return normalizedOverride;
  }

  public async deleteOverride(characterId: number): Promise<void> {
    await this.ready();
    const nextOverrides = this.overrides().filter(
      (override) => override.characterId !== characterId,
    );

    if (nextOverrides.length === this.overrides().length) {
      return;
    }

    await this.replaceOverrides(nextOverrides);
  }

  public async clearAllOverrides(): Promise<void> {
    await this.ready();
    await this.replaceOverrides([]);
  }

  public async mergeImportedOverrides(
    overrides: LocalCharacterOverride[],
  ): Promise<{ addedCount: number; overrides: LocalCharacterOverride[]; updatedCount: number }> {
    await this.ready();

    const currentOverrides = this.overrides();
    const currentOverrideMap = new Map(
      currentOverrides.map((override) => [override.characterId, override] as const),
    );
    const mergedOverrides: LocalCharacterOverride[] = [];
    const importedCharacterIds = new Set<number>();
    let addedCount = 0;
    let updatedCount = 0;

    overrides.forEach((override) => {
      const normalizedOverride = normalizeLocalCharacterOverride(
        override,
        currentOverrideMap.get(override.characterId),
      );

      if (!normalizedOverride || importedCharacterIds.has(normalizedOverride.characterId)) {
        return;
      }

      importedCharacterIds.add(normalizedOverride.characterId);

      if (currentOverrideMap.has(normalizedOverride.characterId)) {
        updatedCount += 1;
      } else {
        addedCount += 1;
      }

      mergedOverrides.push(normalizedOverride);
    });

    const nextOverrides = [
      ...mergedOverrides,
      ...currentOverrides.filter((override) => !importedCharacterIds.has(override.characterId)),
    ];

    await this.replaceOverrides(nextOverrides);

    return {
      addedCount,
      updatedCount,
      overrides: nextOverrides,
    };
  }

  private async hydrate(): Promise<void> {
    const { value } = await this.preferences.get({ key: CHARACTER_OVERRIDES_KEY });

    if (!value) {
      this.overrides.set([]);
      return;
    }

    try {
      const parsedValue = JSON.parse(value) as unknown;
      const parsedOverrides = Array.isArray(parsedValue)
        ? parsedValue
            .map((entry) => normalizeLocalCharacterOverride(entry as LocalCharacterOverride))
            .filter((entry): entry is LocalCharacterOverride => Boolean(entry))
        : [];

      this.overrides.set(parsedOverrides);
    } catch {
      this.overrides.set([]);
    }
  }

  private async replaceOverrides(overrides: LocalCharacterOverride[]): Promise<void> {
    this.overrides.set(overrides);
    this.revision.update((value) => value + 1);
    await this.preferences.set({
      key: CHARACTER_OVERRIDES_KEY,
      value: JSON.stringify(overrides),
    });
    await this.driveSyncState?.markLocalChange();
  }
}
