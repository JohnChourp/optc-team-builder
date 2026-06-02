import { Component } from '@angular/core';

const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'auto-team-builder-style-panel' };

@Component({
  selector: 'app-auto-team-builder-controls-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-controls-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderControlsPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-requirements-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-requirements-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRequirementsPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-manual-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-manual-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderManualPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-manual-chip-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-manual-chip-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderManualChipPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-candidate-card-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-candidate-card-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderCandidateCardPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-picker-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-picker-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderPickerPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-results-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-results-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderResultsPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-loading-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-loading-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderLoadingPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-actions-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-actions-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderActionsPanelComponent {}
