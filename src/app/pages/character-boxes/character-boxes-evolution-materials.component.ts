import { Component, Input, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton } from '@ionic/angular/ion-button';
import { IonSpinner } from '@ionic/angular/ion-spinner';
import { TranslocoDirective } from '@jsverse/transloco';

import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import {
  evolutionCatalogName,
  loadEvolutionMaterialsCatalog,
  type EvolutionMaterialRow,
  type EvolutionMaterialsCatalog,
  toEvolutionMaterialRows,
} from '../saved-teams/evolution-materials-catalog';
import { planBoxEvolutionMaterials } from '../saved-teams/team-evolution-materials.utils';

export interface BoxEvolveRow {
  characterId: number;
  name: string;
  finalName: string;
  steps: number;
}

export interface BoxChoiceRow {
  characterId: number;
  name: string;
  finalNames: string[];
}

export interface BoxEvolutionMaterialsView {
  boxSize: number;
  materials: EvolutionMaterialRow[];
  evolve: BoxEvolveRow[];
  choice: BoxChoiceRow[];
  finalCount: number;
  laterOwnedCount: number;
}

/**
 * 869f63gzu, second part. The evolution materials one box needs to take every unit to its final
 * form, summed, with where each drops. See `planBoxEvolutionMaterials` for the owner's rules.
 *
 * Loads the evolution links of the box's units and of their later forms, then the names and drop
 * stages of everything those links mention. While the box changes, the last totals stay on
 * screen until the new ones are read.
 */
@Component({
  selector: 'app-character-boxes-evolution-materials',
  standalone: true,
  imports: [IonButton, IonSpinner, RouterLink, TranslocoDirective],
  templateUrl: './character-boxes-evolution-materials.component.html',
  styleUrl: './character-boxes-evolution-materials.component.scss',
})
export class CharacterBoxesEvolutionMaterialsComponent {
  public readonly boxCharacterIds = signal<readonly number[]>([]);
  public readonly loading = signal(false);
  public readonly failed = signal(false);
  /** The last catalog read, with the box units it was read for. */
  public readonly loaded = signal<{
    ids: readonly number[];
    catalog: EvolutionMaterialsCatalog;
  } | null>(null);
  public readonly result = computed<BoxEvolutionMaterialsView | null>(() => {
    const loaded = this.loaded();

    if (!loaded) {
      return null;
    }

    // Planned for the units the catalog was read for, never the newer ones it lacks links for:
    // while a changed box is read, the last totals stay as they were.
    const { ids, catalog } = loaded;
    const plan = planBoxEvolutionMaterials(ids, catalog.links);
    const nameOf = (characterId: number): string => evolutionCatalogName(catalog, characterId);
    const view: BoxEvolutionMaterialsView = {
      boxSize: ids.length,
      materials: toEvolutionMaterialRows(plan.materials, catalog),
      evolve: [],
      choice: [],
      finalCount: 0,
      laterOwnedCount: 0,
    };

    for (const unit of plan.units) {
      if (unit.state === 'final') {
        view.finalCount += 1;
      } else if (unit.state === 'laterOwned') {
        view.laterOwnedCount += 1;
      } else if (unit.state === 'choice') {
        view.choice.push({
          characterId: unit.characterId,
          name: nameOf(unit.characterId),
          finalNames: unit.finalIds.map(nameOf),
        });
      } else {
        view.evolve.push({
          characterId: unit.characterId,
          name: nameOf(unit.characterId),
          finalName: nameOf(unit.path[unit.path.length - 1]!),
          steps: unit.path.length - 1,
        });
      }
    }

    return view;
  });

  /** Drops a load that a newer box has replaced. */
  private loadRequest = 0;

  public constructor(private readonly repository: OptcRepositoryService) {}

  /** The units of the open box, by id. Repeats are counted once. */
  @Input({ required: true }) public set characterIds(value: readonly number[]) {
    const ids = [...new Set(value)].sort((left, right) => left - right);
    const current = this.boxCharacterIds();

    if (ids.length === current.length && ids.every((id, index) => id === current[index])) {
      return;
    }

    this.boxCharacterIds.set(ids);
    void this.load();
  }

  public async load(): Promise<void> {
    const request = ++this.loadRequest;
    const ids = this.boxCharacterIds();

    this.loading.set(true);
    this.failed.set(false);

    try {
      const catalog = await loadEvolutionMaterialsCatalog(this.repository, ids, 'later');

      if (request === this.loadRequest) {
        this.loaded.set({ ids, catalog });
      }
    } catch {
      if (request === this.loadRequest) {
        this.failed.set(true);
      }
    } finally {
      if (request === this.loadRequest) {
        this.loading.set(false);
      }
    }
  }
}
