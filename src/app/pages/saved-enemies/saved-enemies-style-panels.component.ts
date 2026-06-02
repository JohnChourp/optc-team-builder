import { Component } from '@angular/core';

const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'saved-enemies-style-panel' };

@Component({
  selector: 'app-saved-enemies-overview-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-overview-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesOverviewPanelComponent {}

@Component({
  selector: 'app-saved-enemies-editor-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-editor-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesEditorPanelComponent {}

@Component({
  selector: 'app-saved-enemies-association-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-association-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesAssociationPanelComponent {}

@Component({
  selector: 'app-saved-enemies-import-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-import-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesImportPanelComponent {}
