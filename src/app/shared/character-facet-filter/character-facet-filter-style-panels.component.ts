import { Component, ViewEncapsulation } from '@angular/core';

/*
 * Structural copy of `character-tag-filter-style-panels.component.ts` with the
 * selectors renamed. The control's CSS lives in `ViewEncapsulation.None` panels
 * rather than in any host page's SCSS: `angular.json` caps `anyComponentStyle`
 * at 12 kB warn / 20 kB error, which is why `characters.page.scss` is 0 bytes.
 * Splitting shell chrome from the mode/disclosure row keeps each panel small and
 * keeps the whole motion surface auditable in one file.
 */
const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'character-facet-filter-style-panel', style: 'display: contents;' };
const stylePanelsTemplate = `
  <app-character-facet-filter-shell-panel>
    <app-character-facet-filter-mode-panel>
      <ng-content></ng-content>
    </app-character-facet-filter-mode-panel>
  </app-character-facet-filter-shell-panel>
`;

@Component({
  selector: 'app-character-facet-filter-shell-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './character-facet-filter-shell-panel.component.scss',
  host: panelHost,
})
export class CharacterFacetFilterShellPanelComponent {}

@Component({
  selector: 'app-character-facet-filter-mode-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './character-facet-filter-mode-panel.component.scss',
  host: panelHost,
})
export class CharacterFacetFilterModePanelComponent {}

@Component({
  selector: 'app-character-facet-filter-style-panels',
  standalone: true,
  imports: [CharacterFacetFilterShellPanelComponent, CharacterFacetFilterModePanelComponent],
  template: stylePanelsTemplate,
  host: { class: 'character-facet-filter-style-panels', style: 'display: contents;' },
})
export class CharacterFacetFilterStylePanelsComponent {}
