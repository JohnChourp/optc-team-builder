import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton } from '@ionic/angular/ion-button';
import { IonSpinner } from '@ionic/angular/ion-spinner';
import { TranslocoDirective } from '@jsverse/transloco';

import { type CharacterEvolutionLinks } from '../../core/models/optc.models';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';
import {
  resolveSkullCharacterId,
  summarizeDropSources,
} from '../character-detail/character-progression.presenter';
import {
  EVOLUTION_SEARCH_MAX_STEPS,
  collectEarlierFormIds,
  planTeamEvolutionMaterials,
  type EvolutionLinksById,
} from './team-evolution-materials.utils';

/** What the card needs besides the links: names, and the drop stages of each material. */
interface EvolutionMaterialsCatalog {
  links: EvolutionLinksById;
  names: ReadonlyMap<number, string>;
  drops: ReadonlyMap<number, string[]>;
}

export interface EvolutionMaterialRow {
  key: string;
  count: number;
  /** A character material links to its page. */
  characterId: number | null;
  name: string;
  /** A unit's own skull reads "Skull of <name>". */
  skullOfName: string | null;
  drops: string[];
}

export interface EvolutionUnitRow {
  characterId: number;
  name: string;
  fromName: string;
  steps: number;
}

/**
 * 869f63gzu. The evolution materials the selected saved teams still need, from one of the reader's
 * boxes, summed, with where each drops. See `team-evolution-materials.utils.ts` for the rules.
 *
 * Loads only the evolution links of the teams' units and of their earlier forms, then the names
 * and drop stages of everything those links mention. Changing the box needs no new query.
 */
@Component({
  selector: 'app-saved-teams-evolution-materials',
  standalone: true,
  imports: [IonButton, IonSpinner, RouterLink, TranslocoDirective],
  templateUrl: './saved-teams-evolution-materials.component.html',
  styleUrl: './saved-teams-evolution-materials.component.scss',
})
export class SavedTeamsEvolutionMaterialsComponent {
  public readonly teamCharacterIds = signal<readonly number[]>([]);
  public readonly loading = signal(false);
  public readonly failed = signal(false);
  /** The boxes could not be read: told apart from the evolutions failing. */
  public readonly boxesFailed = signal(false);
  public readonly catalog = signal<EvolutionMaterialsCatalog | null>(null);
  public readonly selectedBoxId = signal<string | null>(null);
  public readonly boxes;
  public readonly selectedBox = computed(() => {
    const boxes = this.boxes();

    // The first box until the reader picks one: a total needs a box to start from.
    return boxes.find((box) => box.id === this.selectedBoxId()) ?? boxes[0] ?? null;
  });
  public readonly shownBoxId = computed(() => this.selectedBox()?.id ?? null);
  public readonly result = computed(() => {
    const catalog = this.catalog();
    const box = this.selectedBox();

    if (!catalog || !box) {
      return null;
    }

    const plan = planTeamEvolutionMaterials(
      this.teamCharacterIds(),
      new Set(box.characterIds),
      catalog.links,
    );
    const nameOf = (characterId: number): string =>
      catalog.names.get(characterId) ?? `#${characterId}`;

    const materials: EvolutionMaterialRow[] = plan.materials.map((material) => {
      const skullOf = resolveSkullCharacterId(material.token);

      return {
        key: material.key,
        count: material.count,
        characterId: material.characterId,
        name: material.characterId !== null ? nameOf(material.characterId) : (material.token ?? ''),
        skullOfName: skullOf !== null ? nameOf(skullOf) : null,
        drops: material.characterId !== null ? (catalog.drops.get(material.characterId) ?? []) : [],
      };
    });
    const evolve: EvolutionUnitRow[] = [];
    const notInBox: { characterId: number; name: string }[] = [];
    let ownedCount = 0;

    for (const unit of plan.units) {
      if (unit.state === 'owned') {
        ownedCount += 1;
      } else if (unit.state === 'evolve') {
        evolve.push({
          characterId: unit.characterId,
          name: nameOf(unit.characterId),
          fromName: nameOf(unit.fromId),
          steps: unit.path.length - 1,
        });
      } else {
        notInBox.push({ characterId: unit.characterId, name: nameOf(unit.characterId) });
      }
    }

    return { materials, evolve, notInBox, ownedCount };
  });

  /** Drops a load that a newer selection has replaced. */
  private loadRequest = 0;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly userState: UserStateService,
  ) {
    this.boxes = this.userState.characterBoxes;
  }

  /**
   * The box the reader picked, kept by the page so it survives the card closing; `null` means the
   * first box.
   */
  @Input() public set boxId(value: string | null) {
    this.selectedBoxId.set(value);
  }

  @Output() public readonly boxIdChange = new EventEmitter<string | null>();

  /** The units of the selected teams, by id. Repeats are counted once. */
  @Input({ required: true }) public set characterIds(value: readonly number[]) {
    const ids = [...new Set(value)].sort((left, right) => left - right);
    const current = this.teamCharacterIds();

    if (ids.length === current.length && ids.every((id, index) => id === current[index])) {
      return;
    }

    this.teamCharacterIds.set(ids);
    void this.load();
  }

  public async load(): Promise<void> {
    const request = ++this.loadRequest;
    const ids = this.teamCharacterIds();

    this.loading.set(true);
    this.failed.set(false);
    this.boxesFailed.set(false);

    try {
      // The boxes fail on their own, so the card can say which of the two could not be read.
      const [catalog, boxesRead] = await Promise.all([
        this.loadCatalog(ids),
        this.userState.readyCharacterBoxes().then(
          () => true,
          () => false,
        ),
      ]);

      if (request === this.loadRequest) {
        this.boxesFailed.set(!boxesRead);
        this.catalog.set(catalog);
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

  public onBoxChange(event: Event): void {
    const boxId = (event.target as HTMLSelectElement | null)?.value || null;

    this.selectedBoxId.set(boxId);
    this.boxIdChange.emit(boxId);
  }

  private async loadCatalog(ids: readonly number[]): Promise<EvolutionMaterialsCatalog> {
    const links = new Map<number, CharacterEvolutionLinks>();
    const asked = new Set<number>();
    let pending = [...ids];

    // The teams' units, then their earlier forms, one level per query.
    for (let step = 0; step <= EVOLUTION_SEARCH_MAX_STEPS && pending.length > 0; step += 1) {
      for (const entry of await this.repository.getCharacterEvolutionsByIds(pending)) {
        links.set(entry.characterId, entry);
      }

      const level = pending;

      level.forEach((id) => asked.add(id));
      pending = collectEarlierFormIds(level, links).filter((id) => !asked.has(id));
    }

    const nameIds = new Set<number>([...ids, ...links.keys()]);
    const materialIds = new Set<number>();

    for (const entry of links.values()) {
      for (const branch of entry.evolvesTo) {
        for (const material of branch.materials) {
          if (material.characterId !== null) {
            materialIds.add(material.characterId);
            nameIds.add(material.characterId);
          }

          const skullOf = resolveSkullCharacterId(material.token);

          if (skullOf !== null) {
            nameIds.add(skullOf);
          }
        }
      }
    }

    const [characters, drops] = await Promise.all([
      this.repository.getCharactersByIds([...nameIds]),
      this.repository.getCharacterDropSourcesByIds([...materialIds]),
    ]);

    return {
      links,
      names: new Map(characters.map((character) => [character.id, character.name])),
      drops: new Map(
        drops.map((entry) => [entry.characterId, summarizeDropSources(entry.dropSources)]),
      ),
    };
  }
}
