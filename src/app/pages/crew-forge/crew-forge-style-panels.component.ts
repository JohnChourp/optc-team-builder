import { Component, ViewEncapsulation } from '@angular/core';

const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'crew-forge-style-panel', style: 'display: contents;' };
const stylePanelsTemplate = `
  <app-crew-forge-shell-panel>
    <app-crew-forge-copy-panel>
      <app-crew-forge-selection-panel>
        <app-crew-forge-pool-panel>
          <app-crew-forge-form-field-panel>
            <app-crew-forge-catalog-panel>
              <app-crew-forge-image-import-preview-panel>
                <app-crew-forge-image-profile-panel>
                  <app-crew-forge-image-import-slots-panel>
                    <app-crew-forge-results-card-panel>
                      <app-crew-forge-results-ability-panel>
                        <app-crew-forge-responsive-layout-panel>
                          <app-crew-forge-responsive-mobile-panel>
                            <ng-content></ng-content>
                          </app-crew-forge-responsive-mobile-panel>
                        </app-crew-forge-responsive-layout-panel>
                      </app-crew-forge-results-ability-panel>
                    </app-crew-forge-results-card-panel>
                  </app-crew-forge-image-import-slots-panel>
                </app-crew-forge-image-profile-panel>
              </app-crew-forge-image-import-preview-panel>
            </app-crew-forge-catalog-panel>
          </app-crew-forge-form-field-panel>
        </app-crew-forge-pool-panel>
      </app-crew-forge-selection-panel>
    </app-crew-forge-copy-panel>
  </app-crew-forge-shell-panel>
`;

@Component({
  selector: 'app-crew-forge-shell-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './crew-forge-shell-panel.component.scss',
  host: panelHost,
})
export class CrewForgeShellPanelComponent {}

@Component({
  selector: 'app-crew-forge-copy-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './crew-forge-copy-panel.component.scss',
  host: panelHost,
})
export class CrewForgeCopyPanelComponent {}

@Component({
  selector: 'app-crew-forge-selection-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './crew-forge-selection-panel.component.scss',
  host: panelHost,
})
export class CrewForgeSelectionPanelComponent {}

@Component({
  selector: 'app-crew-forge-pool-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './crew-forge-pool-panel.component.scss',
  host: panelHost,
})
export class CrewForgePoolPanelComponent {}

@Component({
  selector: 'app-crew-forge-form-field-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './crew-forge-form-field-panel.component.scss',
  host: panelHost,
})
export class CrewForgeFormFieldPanelComponent {}

@Component({
  selector: 'app-crew-forge-catalog-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './crew-forge-catalog-panel.component.scss',
  host: panelHost,
})
export class CrewForgeCatalogPanelComponent {}

@Component({
  selector: 'app-crew-forge-image-import-preview-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './crew-forge-image-import-preview-panel.component.scss',
  host: panelHost,
})
export class CrewForgeImageImportPreviewPanelComponent {}

@Component({
  selector: 'app-crew-forge-image-profile-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './crew-forge-image-profile-panel.component.scss',
  host: panelHost,
})
export class CrewForgeImageProfilePanelComponent {}

@Component({
  selector: 'app-crew-forge-image-import-slots-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './crew-forge-image-import-slots-panel.component.scss',
  host: panelHost,
})
export class CrewForgeImageImportSlotsPanelComponent {}

@Component({
  selector: 'app-crew-forge-results-card-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './crew-forge-results-card-panel.component.scss',
  host: panelHost,
})
export class CrewForgeResultsCardPanelComponent {}

@Component({
  selector: 'app-crew-forge-results-ability-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './crew-forge-results-ability-panel.component.scss',
  host: panelHost,
})
export class CrewForgeResultsAbilityPanelComponent {}

@Component({
  selector: 'app-crew-forge-responsive-layout-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './crew-forge-responsive-layout-panel.component.scss',
  host: panelHost,
})
export class CrewForgeResponsiveLayoutPanelComponent {}

@Component({
  selector: 'app-crew-forge-responsive-mobile-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './crew-forge-responsive-mobile-panel.component.scss',
  host: panelHost,
})
export class CrewForgeResponsiveMobilePanelComponent {}

@Component({
  selector: 'app-crew-forge-style-panels',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    CrewForgeCopyPanelComponent,
    CrewForgeCatalogPanelComponent,
    CrewForgeFormFieldPanelComponent,
    CrewForgeImageImportPreviewPanelComponent,
    CrewForgeImageImportSlotsPanelComponent,
    CrewForgeImageProfilePanelComponent,
    CrewForgePoolPanelComponent,
    CrewForgeResponsiveLayoutPanelComponent,
    CrewForgeResponsiveMobilePanelComponent,
    CrewForgeResultsAbilityPanelComponent,
    CrewForgeResultsCardPanelComponent,
    CrewForgeSelectionPanelComponent,
    CrewForgeShellPanelComponent,
  ],
  template: stylePanelsTemplate,
  host: panelHost,
})
export class CrewForgeStylePanelsComponent {}
