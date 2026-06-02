import { Component } from '@angular/core';

const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'character-boxes-style-panel', style: 'display: contents;' };
const stylePanelsTemplate = `
  <app-character-boxes-shell-panel>
    <app-character-boxes-box-list-panel>
      <app-character-boxes-editor-panel>
        <app-character-boxes-character-link-panel>
          <app-character-boxes-character-list-panel>
            <app-character-boxes-character-grid-panel>
              <app-character-boxes-responsive-panel>
                <ng-content></ng-content>
              </app-character-boxes-responsive-panel>
            </app-character-boxes-character-grid-panel>
          </app-character-boxes-character-list-panel>
        </app-character-boxes-character-link-panel>
      </app-character-boxes-editor-panel>
    </app-character-boxes-box-list-panel>
  </app-character-boxes-shell-panel>
`;

@Component({
  selector: 'app-character-boxes-shell-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './character-boxes-shell-panel.component.scss',
  host: panelHost,
})
export class CharacterBoxesShellPanelComponent {}

@Component({
  selector: 'app-character-boxes-box-list-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './character-boxes-box-list-panel.component.scss',
  host: panelHost,
})
export class CharacterBoxesBoxListPanelComponent {}

@Component({
  selector: 'app-character-boxes-editor-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './character-boxes-editor-panel.component.scss',
  host: panelHost,
})
export class CharacterBoxesEditorPanelComponent {}

@Component({
  selector: 'app-character-boxes-character-link-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './character-boxes-character-link-panel.component.scss',
  host: panelHost,
})
export class CharacterBoxesCharacterLinkPanelComponent {}

@Component({
  selector: 'app-character-boxes-character-list-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './character-boxes-character-list-panel.component.scss',
  host: panelHost,
})
export class CharacterBoxesCharacterListPanelComponent {}

@Component({
  selector: 'app-character-boxes-character-grid-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './character-boxes-character-grid-panel.component.scss',
  host: panelHost,
})
export class CharacterBoxesCharacterGridPanelComponent {}

@Component({
  selector: 'app-character-boxes-responsive-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './character-boxes-responsive-panel.component.scss',
  host: panelHost,
})
export class CharacterBoxesResponsivePanelComponent {}

@Component({
  selector: 'app-character-boxes-style-panels',
  standalone: true,
  imports: [
    CharacterBoxesBoxListPanelComponent,
    CharacterBoxesCharacterGridPanelComponent,
    CharacterBoxesCharacterLinkPanelComponent,
    CharacterBoxesCharacterListPanelComponent,
    CharacterBoxesEditorPanelComponent,
    CharacterBoxesResponsivePanelComponent,
    CharacterBoxesShellPanelComponent,
  ],
  template: stylePanelsTemplate,
  host: panelHost,
})
export class CharacterBoxesStylePanelsComponent {}
