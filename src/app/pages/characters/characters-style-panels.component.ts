import { Component } from '@angular/core';

const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'characters-style-panel' };

@Component({
  selector: 'app-characters-catalog-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './characters-catalog-panel.component.scss',
  host: panelHost,
})
export class CharactersCatalogPanelComponent {}

@Component({
  selector: 'app-characters-import-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './characters-import-panel.component.scss',
  host: panelHost,
})
export class CharactersImportPanelComponent {}
