import { describe, expect, it } from 'vitest';

import {
  TABLE_END,
  TABLE_START,
  buildInventory,
  checkStylePanelInventory,
  renderTable,
} from './check-style-panel-inventory.mjs';

/**
 * 869f17h1t / 869f17h36. Driven from a tree that passes, so every test changes
 * exactly one thing. A check only ever run against a clean tree has not been
 * shown to fail.
 */

const HOST = 'src/app/shared/demo/demo-style-panels.component.ts';

const HOST_SOURCE = `
const projected = '<ng-content></ng-content>';
const panelHost = { class: 'demo-style-panel', style: 'display: contents;' };
const stylePanelsTemplate = \`
  <app-demo-layout-panel>
    <app-demo-card-panel>
      <ng-content></ng-content>
    </app-demo-card-panel>
  </app-demo-layout-panel>
\`;

@Component({
  selector: 'app-demo-layout-panel',
  encapsulation: ViewEncapsulation.None,
  template: projected,
  styleUrl: './demo-layout-panel.component.scss',
  host: panelHost,
})
export class DemoLayoutPanelComponent {}

@Component({
  selector: 'app-demo-card-panel',
  encapsulation: ViewEncapsulation.None,
  template: projected,
  styleUrl: './demo-card-panel.component.scss',
  host: panelHost,
})
export class DemoCardPanelComponent {}

@Component({
  selector: 'app-demo-style-panels',
  encapsulation: ViewEncapsulation.None,
  imports: [DemoLayoutPanelComponent, DemoCardPanelComponent],
  template: stylePanelsTemplate,
  host: panelHost,
})
export class DemoStylePanelsComponent {}
`;

const TEMPLATE = 'src/app/shared/demo/demo.component.html';

function sourcesWith(hostSource = HOST_SOURCE) {
  return new Map<string, string>([
    [HOST, hostSource],
    [TEMPLATE, '<app-demo-style-panels><p>hi</p></app-demo-style-panels>'],
  ]);
}

function docWith(sources: Map<string, string>) {
  return `# doc\n\n${TABLE_START}\n${renderTable(buildInventory(sources))}\n${TABLE_END}\n`;
}

describe('style panel inventory', () => {
  it('passes on a tree whose doc matches the source', () => {
    const sources = sourcesWith();

    expect(checkStylePanelInventory({ sources, doc: docWith(sources) }).errors).toEqual([]);
  });

  it('separates leaf panels from the composing host', () => {
    const inventory = buildInventory(sourcesWith());

    expect(inventory.total).toBe(3);
    expect(inventory.composers).toBe(1);
    expect(inventory.leaves).toBe(2);
  });

  it('records the deepest chain, which is what reaches the DOM', () => {
    expect(buildInventory(sourcesWith()).rows[0].depth).toBe(2);
  });

  /* A. */
  it('fails when the doc table drifts from the source', () => {
    const sources = sourcesWith();
    const doc = docWith(sources).replace('| `demo` |', '| `renamed` |');

    const { errors } = checkStylePanelInventory({ sources, doc });

    expect(errors.some((error) => error.includes('is out of date'))).toBe(true);
  });

  it('fails when the generated-table markers are missing', () => {
    const sources = sourcesWith();

    const { errors } = checkStylePanelInventory({ sources, doc: '# doc with no markers' });

    expect(errors.some((error) => error.includes('missing the generated-table markers'))).toBe(
      true,
    );
  });

  /* B. A wrapper nobody renders is the one case where this really is dead weight. */
  it('fails when a panel selector is rendered by nothing', () => {
    const sources = sourcesWith();

    sources.set(TEMPLATE, '<p>nothing renders the panels</p>');

    const { errors } = checkStylePanelInventory({ sources, doc: docWith(sources) });

    expect(errors.some((error) => error.includes('rendered by nothing'))).toBe(true);
  });

  /* C. */
  it('fails when a leaf panel carries no stylesheet', () => {
    const sources = sourcesWith(HOST_SOURCE.replace("  styleUrl: './demo-card-panel.component.scss',\n", ''));

    const { errors } = checkStylePanelInventory({ sources, doc: docWith(sources) });

    expect(errors.some((error) => error.includes('is not a style panel'))).toBe(true);
  });

  it('fails when a leaf panel is not ViewEncapsulation.None', () => {
    const source = HOST_SOURCE.replace(
      "  selector: 'app-demo-card-panel',\n  encapsulation: ViewEncapsulation.None,",
      "  selector: 'app-demo-card-panel',",
    );

    const sources = sourcesWith(source);
    const { errors } = checkStylePanelInventory({ sources, doc: docWith(sources) });

    expect(errors.some((error) => error.includes('is not a style panel'))).toBe(true);
  });

  /*
   * The composing component owns no stylesheet - only the imports and the
   * template that nests the leaves. Requiring one of it flagged 15 of the 18 real
   * hosts on this check's first run, which is how the exemption was found.
   */
  it('exempts the composing host, which legitimately has no styleUrl', () => {
    const { errors } = checkStylePanelInventory({
      sources: sourcesWith(),
      doc: docWith(sourcesWith()),
    });

    expect(errors.some((error) => error.includes('app-demo-style-panels'))).toBe(false);
  });
});
