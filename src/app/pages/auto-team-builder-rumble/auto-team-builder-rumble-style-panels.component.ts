import { Component } from '@angular/core';

const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'auto-team-builder-rumble-style-panel' };

@Component({
  selector: 'app-auto-team-builder-rumble-controls-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-controls-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleControlsPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-results-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-results-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleResultsPanelComponent {}

@Component({
  selector: 'app-auto-team-builder-rumble-roster-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './auto-team-builder-rumble-roster-panel.component.scss',
  host: panelHost,
})
export class AutoTeamBuilderRumbleRosterPanelComponent {}
