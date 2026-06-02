import { Component } from '@angular/core';

const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'characters-style-panel' };
const catalogPanelsTemplate = `
  <app-characters-catalog-summary-panel>
    <app-characters-catalog-ability-rail-panel>
      <app-characters-catalog-active-strip-panel>
        <app-characters-catalog-active-badge-panel>
          <app-characters-catalog-toolbar-panel>
            <app-characters-catalog-favorite-tools-panel>
              <app-characters-catalog-filter-tools-panel>
                <app-characters-catalog-list-panel>
                  <app-characters-catalog-thumb-panel>
                    <app-characters-catalog-metrics-panel>
                      <ng-content></ng-content>
                    </app-characters-catalog-metrics-panel>
                  </app-characters-catalog-thumb-panel>
                </app-characters-catalog-list-panel>
              </app-characters-catalog-filter-tools-panel>
            </app-characters-catalog-favorite-tools-panel>
          </app-characters-catalog-toolbar-panel>
        </app-characters-catalog-active-badge-panel>
      </app-characters-catalog-active-strip-panel>
    </app-characters-catalog-ability-rail-panel>
  </app-characters-catalog-summary-panel>
`;
const importPanelsTemplate = `
  <app-characters-import-modal-shell-panel>
    <app-characters-import-dropzone-panel>
      <app-characters-import-feedback-panel>
        <app-characters-import-result-panel>
          <app-characters-import-responsive-tablet-panel>
            <app-characters-import-responsive-mobile-panel>
              <app-characters-import-responsive-compact-panel>
                <ng-content></ng-content>
              </app-characters-import-responsive-compact-panel>
            </app-characters-import-responsive-mobile-panel>
          </app-characters-import-responsive-tablet-panel>
        </app-characters-import-result-panel>
      </app-characters-import-feedback-panel>
    </app-characters-import-dropzone-panel>
  </app-characters-import-modal-shell-panel>
`;

@Component({
  selector: 'app-characters-catalog-summary-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './characters-catalog-summary-panel.component.scss',
  host: panelHost,
})
export class CharactersCatalogSummaryPanelComponent {}

@Component({
  selector: 'app-characters-catalog-ability-rail-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './characters-catalog-ability-rail-panel.component.scss',
  host: panelHost,
})
export class CharactersCatalogAbilityRailPanelComponent {}

@Component({
  selector: 'app-characters-catalog-active-strip-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './characters-catalog-active-strip-panel.component.scss',
  host: panelHost,
})
export class CharactersCatalogActiveStripPanelComponent {}

@Component({
  selector: 'app-characters-catalog-active-badge-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './characters-catalog-active-badge-panel.component.scss',
  host: panelHost,
})
export class CharactersCatalogActiveBadgePanelComponent {}

@Component({
  selector: 'app-characters-catalog-toolbar-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './characters-catalog-toolbar-panel.component.scss',
  host: panelHost,
})
export class CharactersCatalogToolbarPanelComponent {}

@Component({
  selector: 'app-characters-catalog-favorite-tools-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './characters-catalog-favorite-tools-panel.component.scss',
  host: panelHost,
})
export class CharactersCatalogFavoriteToolsPanelComponent {}

@Component({
  selector: 'app-characters-catalog-filter-tools-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './characters-catalog-filter-tools-panel.component.scss',
  host: panelHost,
})
export class CharactersCatalogFilterToolsPanelComponent {}

@Component({
  selector: 'app-characters-catalog-list-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './characters-catalog-list-panel.component.scss',
  host: panelHost,
})
export class CharactersCatalogListPanelComponent {}

@Component({
  selector: 'app-characters-catalog-thumb-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './characters-catalog-thumb-panel.component.scss',
  host: panelHost,
})
export class CharactersCatalogThumbPanelComponent {}

@Component({
  selector: 'app-characters-catalog-metrics-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './characters-catalog-metrics-panel.component.scss',
  host: panelHost,
})
export class CharactersCatalogMetricsPanelComponent {}

@Component({
  selector: 'app-characters-catalog-panel',
  standalone: true,
  imports: [
    CharactersCatalogAbilityRailPanelComponent,
    CharactersCatalogActiveBadgePanelComponent,
    CharactersCatalogActiveStripPanelComponent,
    CharactersCatalogFavoriteToolsPanelComponent,
    CharactersCatalogFilterToolsPanelComponent,
    CharactersCatalogListPanelComponent,
    CharactersCatalogMetricsPanelComponent,
    CharactersCatalogSummaryPanelComponent,
    CharactersCatalogThumbPanelComponent,
    CharactersCatalogToolbarPanelComponent,
  ],
  template: catalogPanelsTemplate,
  styleUrl: './characters-catalog-panel.component.scss',
  host: panelHost,
})
export class CharactersCatalogPanelComponent {}

@Component({
  selector: 'app-characters-import-modal-shell-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './characters-import-modal-shell-panel.component.scss',
  host: panelHost,
})
export class CharactersImportModalShellPanelComponent {}

@Component({
  selector: 'app-characters-import-dropzone-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './characters-import-dropzone-panel.component.scss',
  host: panelHost,
})
export class CharactersImportDropzonePanelComponent {}

@Component({
  selector: 'app-characters-import-feedback-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './characters-import-feedback-panel.component.scss',
  host: panelHost,
})
export class CharactersImportFeedbackPanelComponent {}

@Component({
  selector: 'app-characters-import-result-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './characters-import-result-panel.component.scss',
  host: panelHost,
})
export class CharactersImportResultPanelComponent {}

@Component({
  selector: 'app-characters-import-responsive-tablet-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './characters-import-responsive-tablet-panel.component.scss',
  host: panelHost,
})
export class CharactersImportResponsiveTabletPanelComponent {}

@Component({
  selector: 'app-characters-import-responsive-mobile-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './characters-import-responsive-mobile-panel.component.scss',
  host: panelHost,
})
export class CharactersImportResponsiveMobilePanelComponent {}

@Component({
  selector: 'app-characters-import-responsive-compact-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './characters-import-responsive-compact-panel.component.scss',
  host: panelHost,
})
export class CharactersImportResponsiveCompactPanelComponent {}

@Component({
  selector: 'app-characters-import-panel',
  standalone: true,
  imports: [
    CharactersImportDropzonePanelComponent,
    CharactersImportFeedbackPanelComponent,
    CharactersImportModalShellPanelComponent,
    CharactersImportResponsiveCompactPanelComponent,
    CharactersImportResponsiveMobilePanelComponent,
    CharactersImportResponsiveTabletPanelComponent,
    CharactersImportResultPanelComponent,
  ],
  template: importPanelsTemplate,
  styleUrl: './characters-import-panel.component.scss',
  host: panelHost,
})
export class CharactersImportPanelComponent {}
