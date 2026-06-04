import { Component, ViewEncapsulation } from '@angular/core';

const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'auto-team-builder-rumble-style-panel', style: 'display: contents;' };
const controlsPanelsTemplate = `
  <app-auto-team-builder-rumble-controls-layout-panel>
    <app-auto-team-builder-rumble-controls-hero-panel>
      <app-auto-team-builder-rumble-controls-summary-panel>
        <app-auto-team-builder-rumble-controls-filter-panel>
          <app-auto-team-builder-rumble-controls-buff-focus-panel>
            <app-auto-team-builder-rumble-controls-toggle-panel>
              <ng-content></ng-content>
            </app-auto-team-builder-rumble-controls-toggle-panel>
          </app-auto-team-builder-rumble-controls-buff-focus-panel>
        </app-auto-team-builder-rumble-controls-filter-panel>
      </app-auto-team-builder-rumble-controls-summary-panel>
    </app-auto-team-builder-rumble-controls-hero-panel>
  </app-auto-team-builder-rumble-controls-layout-panel>
`;
const rosterPanelsTemplate = `
  <app-auto-team-builder-rumble-roster-layout-panel>
    <app-auto-team-builder-rumble-roster-media-panel>
      <app-auto-team-builder-rumble-roster-detail-panel>
        <app-auto-team-builder-rumble-roster-buff-panel>
          <app-auto-team-builder-rumble-roster-picker-modal-panel>
            <app-auto-team-builder-rumble-roster-picker-card-panel>
              <app-auto-team-builder-rumble-roster-responsive-panel>
                <ng-content></ng-content>
              </app-auto-team-builder-rumble-roster-responsive-panel>
            </app-auto-team-builder-rumble-roster-picker-card-panel>
          </app-auto-team-builder-rumble-roster-picker-modal-panel>
        </app-auto-team-builder-rumble-roster-buff-panel>
      </app-auto-team-builder-rumble-roster-detail-panel>
    </app-auto-team-builder-rumble-roster-media-panel>
  </app-auto-team-builder-rumble-roster-layout-panel>
`;
const resultsPanelsTemplate = `
  <app-auto-team-builder-rumble-results-loading-panel>
    <app-auto-team-builder-rumble-results-summary-panel>
      <app-auto-team-builder-rumble-results-coverage-panel>
        <app-auto-team-builder-rumble-results-comparison-panel>
          <app-auto-team-builder-rumble-results-team-flip-panel>
            <app-auto-team-builder-rumble-results-excluded-panel>
              <ng-content></ng-content>
            </app-auto-team-builder-rumble-results-excluded-panel>
          </app-auto-team-builder-rumble-results-team-flip-panel>
        </app-auto-team-builder-rumble-results-comparison-panel>
      </app-auto-team-builder-rumble-results-coverage-panel>
    </app-auto-team-builder-rumble-results-summary-panel>
  </app-auto-team-builder-rumble-results-loading-panel>
`;

@Component({
  selector: 'app-auto-team-builder-rumble-controls-layout-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-controls-layout-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleControlsLayoutPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-controls-hero-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-controls-hero-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleControlsHeroPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-controls-summary-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-controls-summary-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleControlsSummaryPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-controls-filter-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-controls-filter-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleControlsFilterPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-controls-buff-focus-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-controls-buff-focus-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleControlsBuffFocusPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-controls-toggle-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-controls-toggle-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleControlsTogglePanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-controls-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    AutoTeamBuilderRumbleControlsBuffFocusPanelComponent,
    AutoTeamBuilderRumbleControlsFilterPanelComponent,
    AutoTeamBuilderRumbleControlsHeroPanelComponent,
    AutoTeamBuilderRumbleControlsLayoutPanelComponent,
    AutoTeamBuilderRumbleControlsSummaryPanelComponent,
    AutoTeamBuilderRumbleControlsTogglePanelComponent,
  ],
  template: controlsPanelsTemplate,
  styleUrl: './auto-team-builder-rumble-controls-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleControlsPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-results-loading-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-results-loading-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleResultsLoadingPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-results-summary-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-results-summary-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleResultsSummaryPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-results-coverage-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-results-coverage-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleResultsCoveragePanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-results-comparison-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-results-comparison-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleResultsComparisonPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-results-team-flip-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-results-team-flip-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleResultsTeamFlipPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-results-excluded-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-results-excluded-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleResultsExcludedPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-results-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    AutoTeamBuilderRumbleResultsComparisonPanelComponent,
    AutoTeamBuilderRumbleResultsCoveragePanelComponent,
    AutoTeamBuilderRumbleResultsExcludedPanelComponent,
    AutoTeamBuilderRumbleResultsLoadingPanelComponent,
    AutoTeamBuilderRumbleResultsSummaryPanelComponent,
    AutoTeamBuilderRumbleResultsTeamFlipPanelComponent,
  ],
  template: resultsPanelsTemplate,
  styleUrl: './auto-team-builder-rumble-results-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleResultsPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-roster-layout-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-roster-layout-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleRosterLayoutPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-roster-media-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-roster-media-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleRosterMediaPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-roster-detail-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-roster-detail-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleRosterDetailPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-roster-buff-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-roster-buff-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleRosterBuffPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-roster-picker-modal-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-roster-picker-modal-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleRosterPickerModalPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-roster-picker-card-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-roster-picker-card-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleRosterPickerCardPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-roster-responsive-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-roster-responsive-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleRosterResponsivePanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-roster-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    AutoTeamBuilderRumbleRosterBuffPanelComponent,
    AutoTeamBuilderRumbleRosterDetailPanelComponent,
    AutoTeamBuilderRumbleRosterLayoutPanelComponent,
    AutoTeamBuilderRumbleRosterMediaPanelComponent,
    AutoTeamBuilderRumbleRosterPickerCardPanelComponent,
    AutoTeamBuilderRumbleRosterPickerModalPanelComponent,
    AutoTeamBuilderRumbleRosterResponsivePanelComponent,
  ],
  template: rosterPanelsTemplate,
  styleUrl: './auto-team-builder-rumble-roster-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleRosterPanelComponent {}
