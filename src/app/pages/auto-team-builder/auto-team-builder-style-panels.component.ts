import { Component, ViewEncapsulation } from '@angular/core';

const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'auto-team-builder-style-panel', style: 'display: contents;' };
const pagePanelHost = { class: 'auto-team-builder-style-panel', style: 'display: contents;' };
const pageStylePanelsTemplate = `
  <app-auto-team-builder-page-layout-panel>
    <app-auto-team-builder-page-hero-panel>
      <app-auto-team-builder-page-pill-panel>
        <app-auto-team-builder-page-condition-panel>
          <app-auto-team-builder-page-filter-card-panel>
            <app-auto-team-builder-page-character-link-panel>
              <app-auto-team-builder-page-character-name-panel>
                <app-auto-team-builder-page-ionic-control-panel>
                  <app-auto-team-builder-page-responsive-tablet-controls-panel>
                    <app-auto-team-builder-page-responsive-tablet-cost-panel>
                      <app-auto-team-builder-page-responsive-tablet-manual-panel>
                        <app-auto-team-builder-page-responsive-desktop-panel>
                          <app-auto-team-builder-page-responsive-mobile-layout-panel>
                            <app-auto-team-builder-page-responsive-mobile-modal-panel>
                              <ng-content></ng-content>
                            </app-auto-team-builder-page-responsive-mobile-modal-panel>
                          </app-auto-team-builder-page-responsive-mobile-layout-panel>
                        </app-auto-team-builder-page-responsive-desktop-panel>
                      </app-auto-team-builder-page-responsive-tablet-manual-panel>
                    </app-auto-team-builder-page-responsive-tablet-cost-panel>
                  </app-auto-team-builder-page-responsive-tablet-controls-panel>
                </app-auto-team-builder-page-ionic-control-panel>
              </app-auto-team-builder-page-character-name-panel>
            </app-auto-team-builder-page-character-link-panel>
          </app-auto-team-builder-page-filter-card-panel>
        </app-auto-team-builder-page-condition-panel>
      </app-auto-team-builder-page-pill-panel>
    </app-auto-team-builder-page-hero-panel>
  </app-auto-team-builder-page-layout-panel>
`;
const resultsPanelsTemplate = `
  <app-auto-team-builder-results-header-panel>
    <app-auto-team-builder-results-chip-panel>
      <app-auto-team-builder-results-report-panel>
        <app-auto-team-builder-results-save-panel>
          <app-auto-team-builder-results-comparison-panel>
            <app-auto-team-builder-results-ship-panel>
              <app-auto-team-builder-results-card-layout-panel>
                <app-auto-team-builder-results-card-action-panel>
                  <ng-content></ng-content>
                </app-auto-team-builder-results-card-action-panel>
              </app-auto-team-builder-results-card-layout-panel>
            </app-auto-team-builder-results-ship-panel>
          </app-auto-team-builder-results-comparison-panel>
        </app-auto-team-builder-results-save-panel>
      </app-auto-team-builder-results-report-panel>
    </app-auto-team-builder-results-chip-panel>
  </app-auto-team-builder-results-header-panel>
`;
const controlsPanelsTemplate = `
  <app-auto-team-builder-controls-base-panel>
    <app-auto-team-builder-controls-toggle-panel>
      <app-auto-team-builder-controls-range-panel>
        <app-auto-team-builder-controls-character-tag-panel>
          <app-auto-team-builder-controls-selected-chip-panel>
            <ng-content></ng-content>
          </app-auto-team-builder-controls-selected-chip-panel>
        </app-auto-team-builder-controls-character-tag-panel>
      </app-auto-team-builder-controls-range-panel>
    </app-auto-team-builder-controls-toggle-panel>
  </app-auto-team-builder-controls-base-panel>
`;
const requirementsPanelsTemplate = `
  <app-auto-team-builder-requirements-base-panel>
    <app-auto-team-builder-requirements-manual-copy-panel>
      <app-auto-team-builder-requirements-manual-copy-list-panel>
        <app-auto-team-builder-requirements-required-card-panel>
          <app-auto-team-builder-requirements-chip-panel>
            <app-auto-team-builder-requirements-field-panel>
              <ng-content></ng-content>
            </app-auto-team-builder-requirements-field-panel>
          </app-auto-team-builder-requirements-chip-panel>
        </app-auto-team-builder-requirements-required-card-panel>
      </app-auto-team-builder-requirements-manual-copy-list-panel>
    </app-auto-team-builder-requirements-manual-copy-panel>
  </app-auto-team-builder-requirements-base-panel>
`;
const candidateCardPanelsTemplate = `
  <app-auto-team-builder-candidate-card-list-panel>
    <app-auto-team-builder-candidate-card-thumb-link-panel>
      <app-auto-team-builder-candidate-card-name-link-panel>
        <app-auto-team-builder-candidate-card-ship-panel>
          <app-auto-team-builder-candidate-card-copy-panel>
            <app-auto-team-builder-candidate-card-sidebar-panel>
              <app-auto-team-builder-candidate-card-empty-panel>
                <ng-content></ng-content>
              </app-auto-team-builder-candidate-card-empty-panel>
            </app-auto-team-builder-candidate-card-sidebar-panel>
          </app-auto-team-builder-candidate-card-copy-panel>
        </app-auto-team-builder-candidate-card-ship-panel>
      </app-auto-team-builder-candidate-card-name-link-panel>
    </app-auto-team-builder-candidate-card-thumb-link-panel>
  </app-auto-team-builder-candidate-card-list-panel>
`;

@Component({
  selector: 'app-auto-team-builder-page-layout-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-page-layout-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderPageLayoutPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-page-hero-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-page-hero-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderPageHeroPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-page-pill-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-page-pill-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderPagePillPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-page-condition-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-page-condition-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderPageConditionPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-page-filter-card-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-page-filter-card-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderPageFilterCardPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-page-character-link-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-page-character-link-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderPageCharacterLinkPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-page-character-name-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-page-character-name-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderPageCharacterNamePanelComponent {}

@Component({
  selector: 'app-auto-team-builder-page-ionic-control-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-page-ionic-control-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderPageIonicControlPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-page-responsive-tablet-controls-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-page-responsive-tablet-controls-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderPageResponsiveTabletControlsPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-page-responsive-tablet-cost-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-page-responsive-tablet-cost-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderPageResponsiveTabletCostPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-page-responsive-tablet-manual-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-page-responsive-tablet-manual-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderPageResponsiveTabletManualPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-page-responsive-desktop-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-page-responsive-desktop-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderPageResponsiveDesktopPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-page-responsive-mobile-layout-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-page-responsive-mobile-layout-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderPageResponsiveMobileLayoutPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-page-responsive-mobile-modal-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-page-responsive-mobile-modal-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderPageResponsiveMobileModalPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-page-style-panels',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    AutoTeamBuilderPageCharacterLinkPanelComponent,
    AutoTeamBuilderPageCharacterNamePanelComponent,
    AutoTeamBuilderPageConditionPanelComponent,
    AutoTeamBuilderPageFilterCardPanelComponent,
    AutoTeamBuilderPageHeroPanelComponent,
    AutoTeamBuilderPageIonicControlPanelComponent,
    AutoTeamBuilderPageLayoutPanelComponent,
    AutoTeamBuilderPagePillPanelComponent,
    AutoTeamBuilderPageResponsiveDesktopPanelComponent,
    AutoTeamBuilderPageResponsiveMobileLayoutPanelComponent,
    AutoTeamBuilderPageResponsiveMobileModalPanelComponent,
    AutoTeamBuilderPageResponsiveTabletControlsPanelComponent,
    AutoTeamBuilderPageResponsiveTabletCostPanelComponent,
    AutoTeamBuilderPageResponsiveTabletManualPanelComponent,
  ],
  template: pageStylePanelsTemplate,
  host: pagePanelHost,
})
export class AutoTeamBuilderPageStylePanelsComponent {}

@Component({
  selector: 'app-auto-team-builder-controls-base-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-controls-base-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderControlsBasePanelComponent {}

@Component({
  selector: 'app-auto-team-builder-controls-toggle-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-controls-toggle-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderControlsTogglePanelComponent {}

@Component({
  selector: 'app-auto-team-builder-controls-range-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-controls-range-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderControlsRangePanelComponent {}

@Component({
  selector: 'app-auto-team-builder-controls-character-tag-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-controls-character-tag-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderControlsCharacterTagPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-controls-selected-chip-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-controls-selected-chip-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderControlsSelectedChipPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-controls-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    AutoTeamBuilderControlsBasePanelComponent,
    AutoTeamBuilderControlsCharacterTagPanelComponent,
    AutoTeamBuilderControlsRangePanelComponent,
    AutoTeamBuilderControlsSelectedChipPanelComponent,
    AutoTeamBuilderControlsTogglePanelComponent,
  ],
  template: controlsPanelsTemplate,
  styleUrl: './auto-team-builder-controls-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderControlsPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-requirements-base-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-requirements-base-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRequirementsBasePanelComponent {}

@Component({
  selector: 'app-auto-team-builder-requirements-manual-copy-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-requirements-manual-copy-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRequirementsManualCopyPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-requirements-manual-copy-list-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-requirements-manual-copy-list-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRequirementsManualCopyListPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-requirements-required-card-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-requirements-required-card-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRequirementsRequiredCardPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-requirements-chip-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-requirements-chip-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRequirementsChipPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-requirements-field-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-requirements-field-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRequirementsFieldPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-requirements-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    AutoTeamBuilderRequirementsBasePanelComponent,
    AutoTeamBuilderRequirementsChipPanelComponent,
    AutoTeamBuilderRequirementsFieldPanelComponent,
    AutoTeamBuilderRequirementsManualCopyListPanelComponent,
    AutoTeamBuilderRequirementsManualCopyPanelComponent,
    AutoTeamBuilderRequirementsRequiredCardPanelComponent,
  ],
  template: requirementsPanelsTemplate,
  styleUrl: './auto-team-builder-requirements-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRequirementsPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-manual-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-manual-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderManualPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-manual-chip-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-manual-chip-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderManualChipPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-manual-chip-actions-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-manual-chip-actions-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderManualChipActionsPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-manual-chip-ship-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-manual-chip-ship-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderManualChipShipPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-manual-picker-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-manual-picker-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderManualPickerPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-manual-thumb-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-manual-thumb-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderManualThumbPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-manual-thumb-state-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-manual-thumb-state-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderManualThumbStatePanelComponent {}

@Component({
  selector: 'app-auto-team-builder-candidate-card-list-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-candidate-card-list-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderCandidateCardListPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-candidate-card-thumb-link-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-candidate-card-thumb-link-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderCandidateCardThumbLinkPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-candidate-card-name-link-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-candidate-card-name-link-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderCandidateCardNameLinkPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-candidate-card-ship-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-candidate-card-ship-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderCandidateCardShipPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-candidate-card-copy-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-candidate-card-copy-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderCandidateCardCopyPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-candidate-card-sidebar-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-candidate-card-sidebar-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderCandidateCardSidebarPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-candidate-card-empty-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-candidate-card-empty-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderCandidateCardEmptyPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-candidate-card-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    AutoTeamBuilderCandidateCardCopyPanelComponent,
    AutoTeamBuilderCandidateCardEmptyPanelComponent,
    AutoTeamBuilderCandidateCardListPanelComponent,
    AutoTeamBuilderCandidateCardNameLinkPanelComponent,
    AutoTeamBuilderCandidateCardShipPanelComponent,
    AutoTeamBuilderCandidateCardSidebarPanelComponent,
    AutoTeamBuilderCandidateCardThumbLinkPanelComponent,
  ],
  template: candidateCardPanelsTemplate,
  styleUrl: './auto-team-builder-candidate-card-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderCandidateCardPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-picker-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-picker-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderPickerPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-results-header-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-results-header-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderResultsHeaderPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-results-chip-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-results-chip-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderResultsChipPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-results-report-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-results-report-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderResultsReportPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-results-save-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-results-save-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderResultsSavePanelComponent {}

@Component({
  selector: 'app-auto-team-builder-results-comparison-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-results-comparison-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderResultsComparisonPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-results-ship-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-results-ship-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderResultsShipPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-results-card-layout-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-results-card-layout-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderResultsCardLayoutPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-results-card-action-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-results-card-action-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderResultsCardActionPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-results-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    AutoTeamBuilderResultsCardActionPanelComponent,
    AutoTeamBuilderResultsCardLayoutPanelComponent,
    AutoTeamBuilderResultsChipPanelComponent,
    AutoTeamBuilderResultsComparisonPanelComponent,
    AutoTeamBuilderResultsHeaderPanelComponent,
    AutoTeamBuilderResultsReportPanelComponent,
    AutoTeamBuilderResultsSavePanelComponent,
    AutoTeamBuilderResultsShipPanelComponent,
  ],
  template: resultsPanelsTemplate,
  styleUrl: './auto-team-builder-results-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderResultsPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-loading-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-loading-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderLoadingPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-actions-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-actions-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderActionsPanelComponent {}
