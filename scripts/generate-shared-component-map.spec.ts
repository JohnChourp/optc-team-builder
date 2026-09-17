import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { HOST_CONSTRAINTS } from './generate-shared-component-map.mjs';
import {
  buildSharedComponentMap,
  findConstraintGaps,
  findSharedComponentHosts,
  readSharedComponentApi,
} from './lib/shared-component-map.mjs';

/**
 * 869f138qz. The host search is the part that has already been got wrong once.
 *
 * 869f138q3 counted the `a11y` consumers by looking for the `shared/a11y/` import path and reported
 * three against a real seven, because a sibling inside `shared/` writes `../a11y/...`. So the
 * sibling case has its own test, and the real map is asserted to find more hosts than that count.
 */

describe('readSharedComponentApi', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function fixture(files: Record<string, string>) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'optc-shared-map-'));

    directories.push(root);

    for (const [name, content] of Object.entries(files)) {
      const filePath = path.join(root, name);

      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content, 'utf8');
    }

    return root;
  }

  it('reads the class, inputs and outputs a host can bind', async () => {
    const root = await fixture({
      'picker.component.ts': `
        export class PickerComponent {
          @Input() public isOpen = false;
          @Input() public readonly title = '';
          @Output() public readonly dismiss = new EventEmitter<void>();
        }
      `,
    });

    expect(readSharedComponentApi(root)).toEqual({
      exports: ['PickerComponent'],
      inputs: ['isOpen', 'title'],
      outputs: ['dismiss'],
    });
  });

  it('ignores a spec file, which binds nothing', async () => {
    const root = await fixture({
      'picker.component.ts': 'export class PickerComponent {}',
      'picker.component.spec.ts': 'export class FakeComponent { @Input() public fake = 1; }',
    });

    expect(readSharedComponentApi(root)).toEqual({
      exports: ['PickerComponent'],
      inputs: [],
      outputs: [],
    });
  });

  it('reads a utility directory as exporting no class', async () => {
    const root = await fixture({ 'copy.utils.ts': 'export function copy(): void {}' });

    expect(readSharedComponentApi(root).exports).toEqual([]);
  });
});

describe('findSharedComponentHosts', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function appFixture(files: Record<string, string>) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'optc-shared-hosts-'));

    directories.push(root);

    for (const [name, content] of Object.entries(files)) {
      const filePath = path.join(root, 'src', 'app', name);

      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content, 'utf8');
    }

    return root;
  }

  it('finds a page two levels up', async () => {
    const appRoot = await appFixture({
      'shared/ship-picker/ship-picker.component.ts': 'export class ShipPickerComponent {}',
      'pages/teams/teams.page.ts': "import { ShipPickerComponent } from '../../shared/ship-picker/ship-picker.component';",
    });

    expect(findSharedComponentHosts({ appRoot, componentId: 'ship-picker' })).toEqual([
      'src/app/pages/teams/teams.page.ts',
    ]);
  });

  it('finds a sibling inside shared/, which a path-prefix search misses', async () => {
    const appRoot = await appFixture({
      'shared/a11y/label.utils.ts': 'export function label(): void {}',
      'shared/ship-picker/ship-picker.component.ts': "import { label } from '../a11y/label.utils';",
    });

    expect(findSharedComponentHosts({ appRoot, componentId: 'a11y' })).toEqual([
      'src/app/shared/ship-picker/ship-picker.component.ts',
    ]);
  });

  it('never counts the component as its own host', async () => {
    const appRoot = await appFixture({
      'shared/ship-picker/ship-picker.component.ts': "import { x } from '../ship-picker/other';",
      'shared/ship-picker/other.ts': 'export const x = 1;',
    });

    expect(findSharedComponentHosts({ appRoot, componentId: 'ship-picker' })).toEqual([]);
  });

  it('does not count a spec as a host', async () => {
    const appRoot = await appFixture({
      'shared/ship-picker/ship-picker.component.ts': 'export class ShipPickerComponent {}',
      'pages/teams/teams.page.spec.ts': "import { ShipPickerComponent } from '../../shared/ship-picker/ship-picker.component';",
    });

    expect(findSharedComponentHosts({ appRoot, componentId: 'ship-picker' })).toEqual([]);
  });

  it('does not count a mention that is not an import', async () => {
    const appRoot = await appFixture({
      'shared/ship-picker/ship-picker.component.ts': 'export class ShipPickerComponent {}',
      'pages/teams/teams.page.ts': "const note = 'see shared/ship-picker/ship-picker.component';",
    });

    expect(findSharedComponentHosts({ appRoot, componentId: 'ship-picker' })).toEqual([]);
  });
});

describe('findConstraintGaps', () => {
  it('says nothing when the entries match the folder', () => {
    expect(
      findConstraintGaps({ componentIds: ['a', 'b'], constraints: { a: 'x', b: null } }),
    ).toEqual([]);
  });

  it('catches a new shared component with no entry', () => {
    const [gap] = findConstraintGaps({ componentIds: ['a', 'b'], constraints: { a: null } });

    expect(gap.kind).toBe('component-without-constraint-entry');
    expect(gap.componentId).toBe('b');
  });

  it('catches an entry left behind by a deleted component', () => {
    const [gap] = findConstraintGaps({ componentIds: ['a'], constraints: { a: null, gone: 'x' } });

    expect(gap.kind).toBe('constraint-for-missing-component');
    expect(gap.componentId).toBe('gone');
  });
});

describe('the committed map', () => {
  it('matches the shared folder as it is now', async () => {
    const { readFile } = await import('node:fs/promises');
    const committed = JSON.parse(await readFile('docs/shared-component-map.json', 'utf8'));
    const built = buildSharedComponentMap({ appRoot: '.', constraints: HOST_CONSTRAINTS });

    expect(committed).toEqual(JSON.parse(JSON.stringify(built)));
  });

  it('counts far more a11y hosts than the three 869f138q3 was told about', async () => {
    const { readFile } = await import('node:fs/promises');
    const committed = JSON.parse(await readFile('docs/shared-component-map.json', 'utf8'));
    const a11y = committed.components.find((component: { id: string }) => component.id === 'a11y');

    expect(a11y.hostCount).toBeGreaterThan(3);
  });

  it('declares an entry for every shared component, established or not', async () => {
    const { readFile } = await import('node:fs/promises');
    const committed = JSON.parse(await readFile('docs/shared-component-map.json', 'utf8'));

    expect(
      committed.components.every((component: { hostConstraint?: string | null }) =>
        Object.hasOwn(component, 'hostConstraint'),
      ),
    ).toBe(true);
    expect(committed.constraintsEstablished).toBeGreaterThan(0);
    expect(committed.constraintsEstablished).toBeLessThan(committed.componentCount);
  });
});
