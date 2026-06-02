import { Component } from '@angular/core';

const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'captain-coverage-style-panel', style: 'display: contents;' };
const stylePanelsTemplate = `
  <app-captain-coverage-layout-panel>
    <app-captain-coverage-team-panel>
      <app-captain-coverage-team-slots-panel>
        <app-captain-coverage-save-panel>
          <app-captain-coverage-target-panel>
            <app-captain-coverage-results-panel>
              <app-captain-coverage-toggle-panel>
                <app-captain-coverage-tier-panel>
                  <app-captain-coverage-tier-details-panel>
                    <app-captain-coverage-result-card-panel>
                      <app-captain-coverage-result-meta-panel>
                        <app-captain-coverage-tier-copy-panel>
                          <app-captain-coverage-tier-copy-detail-panel>
                            <app-captain-coverage-filter-panel>
                              <app-captain-coverage-result-list-panel>
                                <app-captain-coverage-result-badges-panel>
                                  <app-captain-coverage-responsive-panel>
                                    <app-captain-coverage-mobile-panel>
                                      <app-captain-coverage-mobile-detail-panel>
                                        <ng-content></ng-content>
                                      </app-captain-coverage-mobile-detail-panel>
                                    </app-captain-coverage-mobile-panel>
                                  </app-captain-coverage-responsive-panel>
                                </app-captain-coverage-result-badges-panel>
                              </app-captain-coverage-result-list-panel>
                            </app-captain-coverage-filter-panel>
                          </app-captain-coverage-tier-copy-detail-panel>
                        </app-captain-coverage-tier-copy-panel>
                      </app-captain-coverage-result-meta-panel>
                    </app-captain-coverage-result-card-panel>
                  </app-captain-coverage-tier-details-panel>
                </app-captain-coverage-tier-panel>
              </app-captain-coverage-toggle-panel>
            </app-captain-coverage-results-panel>
          </app-captain-coverage-target-panel>
        </app-captain-coverage-save-panel>
      </app-captain-coverage-team-slots-panel>
    </app-captain-coverage-team-panel>
  </app-captain-coverage-layout-panel>
`;

@Component({
  selector: 'app-captain-coverage-layout-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './captain-coverage-layout-panel.component.scss',
  host: panelHost,
})
export class CaptainCoverageLayoutPanelComponent {}

@Component({
  selector: 'app-captain-coverage-team-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './captain-coverage-team-panel.component.scss',
  host: panelHost,
})
export class CaptainCoverageTeamPanelComponent {}

@Component({
  selector: 'app-captain-coverage-team-slots-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './captain-coverage-team-slots-panel.component.scss',
  host: panelHost,
})
export class CaptainCoverageTeamSlotsPanelComponent {}

@Component({
  selector: 'app-captain-coverage-save-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './captain-coverage-save-panel.component.scss',
  host: panelHost,
})
export class CaptainCoverageSavePanelComponent {}

@Component({
  selector: 'app-captain-coverage-target-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './captain-coverage-target-panel.component.scss',
  host: panelHost,
})
export class CaptainCoverageTargetPanelComponent {}

@Component({
  selector: 'app-captain-coverage-results-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './captain-coverage-results-panel.component.scss',
  host: panelHost,
})
export class CaptainCoverageResultsPanelComponent {}

@Component({
  selector: 'app-captain-coverage-toggle-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './captain-coverage-toggle-panel.component.scss',
  host: panelHost,
})
export class CaptainCoverageTogglePanelComponent {}

@Component({
  selector: 'app-captain-coverage-tier-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './captain-coverage-tier-panel.component.scss',
  host: panelHost,
})
export class CaptainCoverageTierPanelComponent {}

@Component({
  selector: 'app-captain-coverage-tier-details-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './captain-coverage-tier-details-panel.component.scss',
  host: panelHost,
})
export class CaptainCoverageTierDetailsPanelComponent {}

@Component({
  selector: 'app-captain-coverage-tier-copy-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './captain-coverage-tier-copy-panel.component.scss',
  host: panelHost,
})
export class CaptainCoverageTierCopyPanelComponent {}

@Component({
  selector: 'app-captain-coverage-tier-copy-detail-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './captain-coverage-tier-copy-detail-panel.component.scss',
  host: panelHost,
})
export class CaptainCoverageTierCopyDetailPanelComponent {}

@Component({
  selector: 'app-captain-coverage-result-card-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './captain-coverage-result-card-panel.component.scss',
  host: panelHost,
})
export class CaptainCoverageResultCardPanelComponent {}

@Component({
  selector: 'app-captain-coverage-result-meta-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './captain-coverage-result-meta-panel.component.scss',
  host: panelHost,
})
export class CaptainCoverageResultMetaPanelComponent {}

@Component({
  selector: 'app-captain-coverage-filter-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './captain-coverage-filter-panel.component.scss',
  host: panelHost,
})
export class CaptainCoverageFilterPanelComponent {}

@Component({
  selector: 'app-captain-coverage-result-list-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './captain-coverage-result-list-panel.component.scss',
  host: panelHost,
})
export class CaptainCoverageResultListPanelComponent {}

@Component({
  selector: 'app-captain-coverage-result-badges-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './captain-coverage-result-badges-panel.component.scss',
  host: panelHost,
})
export class CaptainCoverageResultBadgesPanelComponent {}

@Component({
  selector: 'app-captain-coverage-responsive-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './captain-coverage-responsive-panel.component.scss',
  host: panelHost,
})
export class CaptainCoverageResponsivePanelComponent {}

@Component({
  selector: 'app-captain-coverage-mobile-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './captain-coverage-mobile-panel.component.scss',
  host: panelHost,
})
export class CaptainCoverageMobilePanelComponent {}

@Component({
  selector: 'app-captain-coverage-mobile-detail-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './captain-coverage-mobile-detail-panel.component.scss',
  host: panelHost,
})
export class CaptainCoverageMobileDetailPanelComponent {}

@Component({
  selector: 'app-captain-coverage-style-panels',
  standalone: true,
  imports: [
    CaptainCoverageLayoutPanelComponent,
    CaptainCoverageFilterPanelComponent,
    CaptainCoverageMobileDetailPanelComponent,
    CaptainCoverageMobilePanelComponent,
    CaptainCoverageResponsivePanelComponent,
    CaptainCoverageResultBadgesPanelComponent,
    CaptainCoverageResultCardPanelComponent,
    CaptainCoverageResultListPanelComponent,
    CaptainCoverageResultMetaPanelComponent,
    CaptainCoverageResultsPanelComponent,
    CaptainCoverageSavePanelComponent,
    CaptainCoverageTargetPanelComponent,
    CaptainCoverageTeamPanelComponent,
    CaptainCoverageTeamSlotsPanelComponent,
    CaptainCoverageTierDetailsPanelComponent,
    CaptainCoverageTierCopyDetailPanelComponent,
    CaptainCoverageTierCopyPanelComponent,
    CaptainCoverageTierPanelComponent,
    CaptainCoverageTogglePanelComponent,
  ],
  template: stylePanelsTemplate,
  host: panelHost,
})
export class CaptainCoverageStylePanelsComponent {}
