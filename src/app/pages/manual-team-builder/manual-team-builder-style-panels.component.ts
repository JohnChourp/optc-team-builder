import { Component } from '@angular/core';

const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'manual-team-builder-style-panel' };

@Component({
  selector: 'app-manual-team-builder-workbench-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './manual-team-builder-workbench-panel.component.scss',
  host: panelHost,
})
export class ManualTeamBuilderWorkbenchPanelComponent {}

@Component({
  selector: 'app-manual-team-builder-picker-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './manual-team-builder-picker-panel.component.scss',
  host: panelHost,
})
export class ManualTeamBuilderPickerPanelComponent {}
