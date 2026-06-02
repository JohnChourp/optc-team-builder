import { Component } from '@angular/core';

const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'saved-enemies-style-panel', style: 'display: contents;' };
const overviewPanelsTemplate = `
  <app-saved-enemies-overview-layout-panel>
    <app-saved-enemies-overview-copy-panel>
      <app-saved-enemies-overview-flow-panel>
        <ng-content></ng-content>
      </app-saved-enemies-overview-flow-panel>
    </app-saved-enemies-overview-copy-panel>
  </app-saved-enemies-overview-layout-panel>
`;
const editorPanelsTemplate = `
  <app-saved-enemies-editor-modal-panel>
    <app-saved-enemies-editor-modal-header-panel>
      <app-saved-enemies-editor-modal-footer-panel>
        <ng-content></ng-content>
      </app-saved-enemies-editor-modal-footer-panel>
    </app-saved-enemies-editor-modal-header-panel>
  </app-saved-enemies-editor-modal-panel>
`;
const associationPanelsTemplate = `
  <app-saved-enemies-association-modal-panel>
    <app-saved-enemies-association-head-panel>
      <app-saved-enemies-association-counter-panel>
        <ng-content></ng-content>
      </app-saved-enemies-association-counter-panel>
    </app-saved-enemies-association-head-panel>
  </app-saved-enemies-association-modal-panel>
`;
const stylePanelsTemplate = `
  <app-saved-enemies-overview-panel>
    <app-saved-enemies-list-panel>
      <app-saved-enemies-chip-panel>
        <app-saved-enemies-editor-panel>
          <app-saved-enemies-editor-form-panel>
            <app-saved-enemies-editor-cards-panel>
              <app-saved-enemies-editor-associated-teams-panel>
                <app-saved-enemies-animations-panel>
                  <app-saved-enemies-association-panel>
                    <app-saved-enemies-association-card-panel>
                      <app-saved-enemies-association-card-state-panel>
                        <app-saved-enemies-association-card-copy-panel>
                          <app-saved-enemies-association-card-media-panel>
                            <app-saved-enemies-association-card-slots-panel>
                              <app-saved-enemies-association-media-panel>
                                <app-saved-enemies-association-footer-panel>
                                  <app-saved-enemies-import-panel>
                                    <app-saved-enemies-parsed-ability-panel>
                                      <app-saved-enemies-paste-autocomplete-panel>
                                        <app-saved-enemies-responsive-panel>
                                          <ng-content></ng-content>
                                        </app-saved-enemies-responsive-panel>
                                      </app-saved-enemies-paste-autocomplete-panel>
                                    </app-saved-enemies-parsed-ability-panel>
                                  </app-saved-enemies-import-panel>
                                </app-saved-enemies-association-footer-panel>
                              </app-saved-enemies-association-media-panel>
                            </app-saved-enemies-association-card-slots-panel>
                          </app-saved-enemies-association-card-media-panel>
                        </app-saved-enemies-association-card-copy-panel>
                      </app-saved-enemies-association-card-state-panel>
                    </app-saved-enemies-association-card-panel>
                  </app-saved-enemies-association-panel>
                </app-saved-enemies-animations-panel>
              </app-saved-enemies-editor-associated-teams-panel>
            </app-saved-enemies-editor-cards-panel>
          </app-saved-enemies-editor-form-panel>
        </app-saved-enemies-editor-panel>
      </app-saved-enemies-chip-panel>
    </app-saved-enemies-list-panel>
  </app-saved-enemies-overview-panel>
`;

@Component({
  selector: 'app-saved-enemies-overview-layout-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-overview-layout-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesOverviewLayoutPanelComponent {}

@Component({
  selector: 'app-saved-enemies-overview-copy-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-overview-copy-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesOverviewCopyPanelComponent {}

@Component({
  selector: 'app-saved-enemies-overview-flow-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-overview-flow-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesOverviewFlowPanelComponent {}

@Component({
  selector: 'app-saved-enemies-overview-panel',
  standalone: true,
  imports: [
    SavedEnemiesOverviewCopyPanelComponent,
    SavedEnemiesOverviewFlowPanelComponent,
    SavedEnemiesOverviewLayoutPanelComponent,
  ],
  template: overviewPanelsTemplate,
  styleUrl: './saved-enemies-overview-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesOverviewPanelComponent {}

@Component({
  selector: 'app-saved-enemies-list-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-list-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesListPanelComponent {}

@Component({
  selector: 'app-saved-enemies-chip-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-chip-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesChipPanelComponent {}

@Component({
  selector: 'app-saved-enemies-editor-modal-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-editor-modal-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesEditorModalPanelComponent {}

@Component({
  selector: 'app-saved-enemies-editor-modal-header-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-editor-modal-header-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesEditorModalHeaderPanelComponent {}

@Component({
  selector: 'app-saved-enemies-editor-modal-footer-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-editor-modal-footer-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesEditorModalFooterPanelComponent {}

@Component({
  selector: 'app-saved-enemies-editor-panel',
  standalone: true,
  imports: [
    SavedEnemiesEditorModalFooterPanelComponent,
    SavedEnemiesEditorModalHeaderPanelComponent,
    SavedEnemiesEditorModalPanelComponent,
  ],
  template: editorPanelsTemplate,
  styleUrl: './saved-enemies-editor-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesEditorPanelComponent {}

@Component({
  selector: 'app-saved-enemies-editor-form-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-editor-form-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesEditorFormPanelComponent {}

@Component({
  selector: 'app-saved-enemies-editor-cards-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-editor-cards-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesEditorCardsPanelComponent {}

@Component({
  selector: 'app-saved-enemies-editor-associated-teams-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-editor-associated-teams-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesEditorAssociatedTeamsPanelComponent {}

@Component({
  selector: 'app-saved-enemies-animations-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-animations-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesAnimationsPanelComponent {}

@Component({
  selector: 'app-saved-enemies-association-modal-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-association-modal-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesAssociationModalPanelComponent {}

@Component({
  selector: 'app-saved-enemies-association-head-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-association-head-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesAssociationHeadPanelComponent {}

@Component({
  selector: 'app-saved-enemies-association-counter-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-association-counter-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesAssociationCounterPanelComponent {}

@Component({
  selector: 'app-saved-enemies-association-panel',
  standalone: true,
  imports: [
    SavedEnemiesAssociationCounterPanelComponent,
    SavedEnemiesAssociationHeadPanelComponent,
    SavedEnemiesAssociationModalPanelComponent,
  ],
  template: associationPanelsTemplate,
  styleUrl: './saved-enemies-association-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesAssociationPanelComponent {}

@Component({
  selector: 'app-saved-enemies-association-card-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-association-card-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesAssociationCardPanelComponent {}

@Component({
  selector: 'app-saved-enemies-association-card-state-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-association-card-state-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesAssociationCardStatePanelComponent {}

@Component({
  selector: 'app-saved-enemies-association-card-copy-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-association-card-copy-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesAssociationCardCopyPanelComponent {}

@Component({
  selector: 'app-saved-enemies-association-card-media-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-association-card-media-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesAssociationCardMediaPanelComponent {}

@Component({
  selector: 'app-saved-enemies-association-card-slots-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-association-card-slots-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesAssociationCardSlotsPanelComponent {}

@Component({
  selector: 'app-saved-enemies-association-media-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-association-media-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesAssociationMediaPanelComponent {}

@Component({
  selector: 'app-saved-enemies-association-footer-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-association-footer-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesAssociationFooterPanelComponent {}

@Component({
  selector: 'app-saved-enemies-import-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-import-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesImportPanelComponent {}

@Component({
  selector: 'app-saved-enemies-parsed-ability-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-parsed-ability-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesParsedAbilityPanelComponent {}

@Component({
  selector: 'app-saved-enemies-paste-autocomplete-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-paste-autocomplete-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesPasteAutocompletePanelComponent {}

@Component({
  selector: 'app-saved-enemies-responsive-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './saved-enemies-responsive-panel.component.scss',
  host: panelHost,
})
export class SavedEnemiesResponsivePanelComponent {}

@Component({
  selector: 'app-saved-enemies-style-panels',
  standalone: true,
  imports: [
    SavedEnemiesAssociationCardPanelComponent,
    SavedEnemiesAssociationCardCopyPanelComponent,
    SavedEnemiesAssociationCardMediaPanelComponent,
    SavedEnemiesAssociationCardSlotsPanelComponent,
    SavedEnemiesAssociationCardStatePanelComponent,
    SavedEnemiesAssociationFooterPanelComponent,
    SavedEnemiesAssociationMediaPanelComponent,
    SavedEnemiesAssociationPanelComponent,
    SavedEnemiesAnimationsPanelComponent,
    SavedEnemiesChipPanelComponent,
    SavedEnemiesEditorAssociatedTeamsPanelComponent,
    SavedEnemiesEditorCardsPanelComponent,
    SavedEnemiesEditorFormPanelComponent,
    SavedEnemiesEditorPanelComponent,
    SavedEnemiesImportPanelComponent,
    SavedEnemiesListPanelComponent,
    SavedEnemiesOverviewPanelComponent,
    SavedEnemiesParsedAbilityPanelComponent,
    SavedEnemiesPasteAutocompletePanelComponent,
    SavedEnemiesResponsivePanelComponent,
  ],
  template: stylePanelsTemplate,
  host: panelHost,
})
export class SavedEnemiesStylePanelsComponent {}
