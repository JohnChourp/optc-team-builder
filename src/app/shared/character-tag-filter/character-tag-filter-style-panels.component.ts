import { Component, ViewEncapsulation } from '@angular/core';

/*
 * The shell's CSS lives in `ViewEncapsulation.None` panels rather than in any
 * host page's SCSS: `angular.json` caps `anyComponentStyle` at 12 kB warn /
 * 20 kB error, which is why `characters.page.scss` is 0 bytes. Splitting shell
 * chrome from motion keeps each panel small and makes the whole motion surface
 * auditable in one file.
 */
const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'character-tag-filter-style-panel', style: 'display: contents;' };
const stylePanelsTemplate = `
  <app-character-tag-filter-shell-panel>
    <app-character-tag-filter-motion-panel>
      <ng-content></ng-content>
    </app-character-tag-filter-motion-panel>
  </app-character-tag-filter-shell-panel>
`;

@Component({
  selector: 'app-character-tag-filter-shell-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './character-tag-filter-shell-panel.component.scss',
  host: panelHost,
})
export class CharacterTagFilterShellPanelComponent {}

@Component({
  selector: 'app-character-tag-filter-motion-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './character-tag-filter-motion-panel.component.scss',
  host: panelHost,
})
export class CharacterTagFilterMotionPanelComponent {}

@Component({
  selector: 'app-character-tag-filter-style-panels',
  standalone: true,
  imports: [CharacterTagFilterShellPanelComponent, CharacterTagFilterMotionPanelComponent],
  template: stylePanelsTemplate,
  host: { class: 'character-tag-filter-style-panels', style: 'display: contents;' },
})
export class CharacterTagFilterStylePanelsComponent {}
