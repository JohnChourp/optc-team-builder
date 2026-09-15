import { describe, expect, it } from 'vitest';

import {
  TABLE_END,
  TABLE_START,
  buildInventory,
  checkComponentInventory,
  renderTable,
} from './check-component-inventory.mjs';

/**
 * 869f17h7q. Driven from a tree that passes, so each test changes exactly one
 * thing. The case that matters most is the routed page: a check that looked only
 * for template tags would call 22 of the real 39 dead.
 */

const ROUTES = `
export const routes = [
  { path: 'characters', loadComponent: () => import('./pages/characters/characters.page').then((m) => m.CharactersPage) },
];
`;

const PAGE = `
@Component({ selector: 'app-characters-page', template: '' })
export class CharactersPage {}
`;

const SHARED = `
@Component({ selector: 'app-ship-picker', template: '' })
export class ShipPickerComponent {}
`;

function sourcesWith(extra: Array<[string, string]> = []) {
  return new Map<string, string>([
    ['src/app/app.routes.ts', ROUTES],
    ['src/app/pages/characters/characters.page.ts', PAGE],
    ['src/app/pages/characters/characters.page.spec.ts', 'it("", () => {});'],
    ['src/app/shared/ship-picker/ship-picker.component.ts', SHARED],
    ['src/app/pages/characters/characters.page.html', '<app-ship-picker></app-ship-picker>'],
    ...extra,
  ]);
}

function docWith(sources: Map<string, string>) {
  return `# doc\n\n${TABLE_START}\n${renderTable(buildInventory(sources))}\n${TABLE_END}\n`;
}

describe('component inventory', () => {
  it('passes on a tree whose doc matches the source', () => {
    const sources = sourcesWith();

    expect(checkComponentInventory({ sources, doc: docWith(sources) }).errors).toEqual([]);
  });

  /*
   * The whole reason reach is recorded rather than counted. A routed page appears
   * in no template, and calling that dead is the mistake this project has made
   * four times.
   */
  it('treats a routed page as reachable even though no template renders it', () => {
    const inventory = buildInventory(sourcesWith());
    const page = inventory.rows.find((row) => row.componentClass === 'CharactersPage');

    expect(page?.routed).toBe(true);
    expect(page?.hosts).toBe(0);
    expect(inventory.unreachable).toEqual([]);
  });

  it('counts template hosts for a shared component', () => {
    const shared = buildInventory(sourcesWith()).rows.find(
      (row) => row.componentClass === 'ShipPickerComponent',
    );

    expect(shared?.hosts).toBe(1);
    expect(shared?.area).toBe('shared');
  });

  /* B. The finding this lane exists for. */
  it('fails on a component reached by neither a route nor a template', () => {
    const sources = sourcesWith([
      [
        'src/app/shared/orphan/orphan.component.ts',
        "@Component({ selector: 'app-orphan', template: '' })\nexport class OrphanComponent {}",
      ],
    ]);

    const { errors } = checkComponentInventory({ sources, doc: docWith(sources) });

    expect(errors.some((error) => error.includes('OrphanComponent'))).toBe(true);
    expect(errors.some((error) => error.includes('do not assume it is dead'))).toBe(true);
  });

  /* C. */
  it('fails when a new component is not in the table', () => {
    const sources = sourcesWith();
    const doc = docWith(sources);

    sources.set(
      'src/app/shared/extra/extra.component.ts',
      "@Component({ selector: 'app-extra', template: '' })\nexport class ExtraComponent {}",
    );
    sources.set('src/app/pages/characters/characters.page.html', '<app-ship-picker></app-ship-picker><app-extra></app-extra>');

    expect(
      checkComponentInventory({ sources, doc }).errors.some((error) => error.includes('out of date')),
    ).toBe(true);
  });

  it('fails when the generated-table markers are missing', () => {
    const sources = sourcesWith();

    expect(
      checkComponentInventory({ sources, doc: '# no markers' }).errors.some((error) =>
        error.includes('missing the generated-table markers'),
      ),
    ).toBe(true);
  });

  /* Style panels are excluded: they are counted by their own check, not here. */
  it('excludes style-panel declarations, which its sibling check owns', () => {
    const sources = sourcesWith([
      [
        'src/app/shared/ship-picker/ship-picker-style-panels.component.ts',
        "@Component({ selector: 'app-ship-picker-layout-panel', template: '' })\nexport class A {}",
      ],
    ]);
    const inventory = buildInventory(sources);

    expect(inventory.rows.some((row) => row.componentClass === 'A')).toBe(false);
    expect(inventory.rows.find((row) => row.componentClass === 'ShipPickerComponent')?.stylePanels).toBe(
      true,
    );
  });

  it('reports which components have no spec rather than hiding it in a percentage', () => {
    const inventory = buildInventory(sourcesWith());

    expect(inventory.withoutSpec).toBe(1);
    expect(inventory.rows.find((row) => row.componentClass === 'CharactersPage')?.spec).toBe(true);
  });
});
