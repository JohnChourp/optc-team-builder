import { afterEach, describe, expect, it, vi } from 'vitest';

import { CaptainCoverageFilterRunnerService } from './captain-coverage-filter-runner.service';
import {
  type CaptainCoverageFilterWorkerRequest,
  type CaptainCoverageFilterWorkerResponse,
} from './captain-coverage-filter.worker.models';
import {
  type CaptainCoverageResultPassDataset,
  type CaptainCoverageResultPassParams,
} from './captain-coverage-result-pass.utils';
import { createCaptainCoverageFilterState } from './captain-coverage-filter.utils';
import { createEmptyCharacterFacetSelection } from './character-facet-filter.utils';
import { createEmptyCharacterTagSetSelection } from './character-tag-set.utils';
import { type CharacterListItem } from '../models/optc.models';

/**
 * The runner is the one place the worker and the in-thread path meet, so these
 * tests are mostly about what happens when the worker misbehaves. The happy
 * in-thread path is already exercised by every test in
 * `captain-coverage.page.spec.ts`, which runs in an environment with no
 * `Worker` at all.
 */
class FakeWorker {
  public static instances: FakeWorker[] = [];
  public readonly posted: CaptainCoverageFilterWorkerRequest[] = [];
  public terminated = false;

  private readonly listeners = new Map<string, Array<(event: unknown) => void>>();

  public constructor() {
    FakeWorker.instances.push(this);
  }

  public addEventListener(type: string, listener: (event: unknown) => void): void {
    const existing = this.listeners.get(type) ?? [];

    existing.push(listener);
    this.listeners.set(type, existing);
  }

  public postMessage(request: CaptainCoverageFilterWorkerRequest): void {
    this.posted.push(request);
  }

  public terminate(): void {
    this.terminated = true;
  }

  /** Answers as the real worker would. */
  public emitMessage(data: CaptainCoverageFilterWorkerResponse): void {
    for (const listener of this.listeners.get('message') ?? []) {
      listener({ data });
    }
  }

  public emitError(): void {
    for (const listener of this.listeners.get('error') ?? []) {
      listener({});
    }
  }
}

function createCharacter(id: number, name: string): CharacterListItem {
  return {
    id,
    name,
    type: 'STR',
    primaryClass: 'Fighter',
    secondaryClass: null,
    classes: ['Fighter'],
    cost: 30,
    imageUrl: '',
    captainAtkBoost: 0,
    captainHpBoost: 0,
    captainAverageBoost: 0,
  } as CharacterListItem;
}

function createDataset(): CaptainCoverageResultPassDataset {
  return {
    entries: [2002, 2001].map((id) => ({
      character: createCharacter(id, `Character ${id}`),
      summary: { characterTags: [], hasSuperTandemData: false, hasSuperTypesClassesData: false },
    })),
  };
}

function createParams(): CaptainCoverageResultPassParams {
  return {
    captain: null,
    filterState: createCaptainCoverageFilterState({}),
    characterBoxIds: null,
    typeFacet: createEmptyCharacterFacetSelection(),
    classFacet: createEmptyCharacterFacetSelection(),
    costRange: { min: null, max: null },
    favoritesOnly: false,
    hideFavorites: false,
    favoriteIds: [],
    characterTagSetSelection: createEmptyCharacterTagSetSelection(),
    requireSuperTandemPresence: false,
    requireSuperTypesClassesPresence: false,
    searchTerm: '',
    sortMode: 'catalog',
    idOrder: 'newest',
  };
}

function installFakeWorker(): void {
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
}

describe('CaptainCoverageFilterRunnerService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeWorker.instances = [];
  });

  it('runs in-thread when the environment has no Worker', async () => {
    vi.stubGlobal('Worker', undefined);

    const outcome = await new CaptainCoverageFilterRunnerService().run(
      createDataset(),
      createParams(),
    );

    // 'catalog' with the default 'newest' id order is descending id.
    expect(outcome.ids).toEqual([2002, 2001]);
    expect(outcome.boostedCount).toBe(0);
  });

  it('runs in-thread when constructing the worker throws', async () => {
    vi.stubGlobal(
      'Worker',
      class {
        public constructor() {
          throw new Error('blocked by CSP');
        }
      },
    );

    await expect(
      new CaptainCoverageFilterRunnerService().run(createDataset(), createParams()),
    ).resolves.toEqual({ ids: [2002, 2001], boostedCount: 0 });
  });

  it('sends the dataset once and then only filter requests', async () => {
    installFakeWorker();

    const runner = new CaptainCoverageFilterRunnerService();
    const dataset = createDataset();
    const first = runner.run(dataset, createParams());
    const worker = FakeWorker.instances[0]!;

    worker.emitMessage({ type: 'result', requestId: 1, ids: [2001], boostedCount: 1 });
    await expect(first).resolves.toEqual({ ids: [2001], boostedCount: 1 });

    const second = runner.run(dataset, createParams());

    worker.emitMessage({ type: 'result', requestId: 2, ids: [2002], boostedCount: 0 });
    await second;

    // Same dataset object, so it is not re-sent: reference equality is exactly
    // right here, because the page rebuilds it only when the catalog changes.
    expect(worker.posted.filter((request) => request.type === 'init')).toHaveLength(1);
    expect(worker.posted.filter((request) => request.type === 'filter')).toHaveLength(2);
  });

  it('re-sends the dataset when the catalog is replaced', async () => {
    installFakeWorker();

    const runner = new CaptainCoverageFilterRunnerService();
    const first = runner.run(createDataset(), createParams());
    const worker = FakeWorker.instances[0]!;

    worker.emitMessage({ type: 'result', requestId: 1, ids: [], boostedCount: 0 });
    await first;

    const second = runner.run(createDataset(), createParams());

    worker.emitMessage({ type: 'result', requestId: 2, ids: [], boostedCount: 0 });
    await second;

    expect(worker.posted.filter((request) => request.type === 'init')).toHaveLength(2);
  });

  it('ignores a reply whose request id it does not know', async () => {
    installFakeWorker();

    const runner = new CaptainCoverageFilterRunnerService();
    const pending = runner.run(createDataset(), createParams());
    const worker = FakeWorker.instances[0]!;
    let settled = false;

    void pending.then(() => {
      settled = true;
    });

    worker.emitMessage({ type: 'result', requestId: 999, ids: [1], boostedCount: 1 });
    await Promise.resolve();

    expect(settled).toBe(false);

    worker.emitMessage({ type: 'result', requestId: 1, ids: [2001], boostedCount: 0 });

    await expect(pending).resolves.toEqual({ ids: [2001], boostedCount: 0 });
  });

  it('answers a reported worker error in-thread rather than failing the press', async () => {
    installFakeWorker();

    const runner = new CaptainCoverageFilterRunnerService();
    const pending = runner.run(createDataset(), createParams());
    const worker = FakeWorker.instances[0]!;

    worker.emitMessage({ type: 'error', requestId: 1, message: 'boom' });

    // The reader still gets a list, computed by the same function the worker
    // would have run.
    await expect(pending).resolves.toEqual({ ids: [2002, 2001], boostedCount: 0 });
  });

  it('answers everyone still waiting when the worker dies, and stops using it', async () => {
    installFakeWorker();

    const runner = new CaptainCoverageFilterRunnerService();
    const first = runner.run(createDataset(), createParams());
    const worker = FakeWorker.instances[0]!;
    const second = runner.run(createDataset(), createParams());

    worker.emitError();

    // Both in-flight requests are answered rather than left pending forever.
    await expect(first).resolves.toEqual({ ids: [2002, 2001], boostedCount: 0 });
    await expect(second).resolves.toEqual({ ids: [2002, 2001], boostedCount: 0 });
    expect(worker.terminated).toBe(true);

    // And the worker is abandoned rather than rebuilt on the next press: a
    // worker that has failed once turns a slow page into one that never answers.
    await runner.run(createDataset(), createParams());
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it('rebuilds the worker after an explicit reset', async () => {
    installFakeWorker();

    const runner = new CaptainCoverageFilterRunnerService();
    const pending = runner.run(createDataset(), createParams());

    FakeWorker.instances[0]!.emitMessage({ type: 'result', requestId: 1, ids: [], boostedCount: 0 });
    await pending;

    runner.reset();

    const next = runner.run(createDataset(), createParams());

    expect(FakeWorker.instances).toHaveLength(2);
    FakeWorker.instances[1]!.emitMessage({
      type: 'result',
      requestId: 2,
      ids: [],
      boostedCount: 0,
    });
    await next;
  });
});
