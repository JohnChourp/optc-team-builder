import { Component, ViewEncapsulation } from '@angular/core';

const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'saved-teams-style-panel', style: 'display: contents;' };
const stylePanelsTemplate = `
  <app-saved-teams-layout-panel>
    <app-saved-teams-list-panel>
      <app-saved-teams-preview-panel>
        <app-saved-teams-ship-panel>
          <app-saved-teams-slot-panel>
            <app-saved-teams-ability-filter-panel>
              <app-saved-teams-modal-panel>
                <app-saved-teams-import-head-panel>
                  <app-saved-teams-import-dropzone-panel>
                    <app-saved-teams-import-feedback-panel>
                      <app-saved-teams-open-destination-panel>
                        <app-saved-teams-open-copy-panel>
                          <app-saved-teams-responsive-panel>
                            <ng-content></ng-content>
                          </app-saved-teams-responsive-panel>
                        </app-saved-teams-open-copy-panel>
                      </app-saved-teams-open-destination-panel>
                    </app-saved-teams-import-feedback-panel>
                  </app-saved-teams-import-dropzone-panel>
                </app-saved-teams-import-head-panel>
              </app-saved-teams-modal-panel>
            </app-saved-teams-ability-filter-panel>
          </app-saved-teams-slot-panel>
        </app-saved-teams-ship-panel>
      </app-saved-teams-preview-panel>
    </app-saved-teams-list-panel>
  </app-saved-teams-layout-panel>
`;

@Component({
  selector: 'app-saved-teams-layout-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './saved-teams-layout-panel.component.scss',
  host: panelHost,
})
export class SavedTeamsLayoutPanelComponent {}

@Component({
  selector: 'app-saved-teams-list-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './saved-teams-list-panel.component.scss',
  host: panelHost,
})
export class SavedTeamsListPanelComponent {}

@Component({
  selector: 'app-saved-teams-preview-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './saved-teams-preview-panel.component.scss',
  host: panelHost,
})
export class SavedTeamsPreviewPanelComponent {}

@Component({
  selector: 'app-saved-teams-ship-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './saved-teams-ship-panel.component.scss',
  host: panelHost,
})
export class SavedTeamsShipPanelComponent {}

@Component({
  selector: 'app-saved-teams-slot-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './saved-teams-slot-panel.component.scss',
  host: panelHost,
})
export class SavedTeamsSlotPanelComponent {}

@Component({
  selector: 'app-saved-teams-ability-filter-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './saved-teams-ability-filter-panel.component.scss',
  host: panelHost,
})
export class SavedTeamsAbilityFilterPanelComponent {}

@Component({
  selector: 'app-saved-teams-modal-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './saved-teams-modal-panel.component.scss',
  host: panelHost,
})
export class SavedTeamsModalPanelComponent {}

@Component({
  selector: 'app-saved-teams-import-head-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './saved-teams-import-head-panel.component.scss',
  host: panelHost,
})
export class SavedTeamsImportHeadPanelComponent {}

@Component({
  selector: 'app-saved-teams-import-dropzone-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './saved-teams-import-dropzone-panel.component.scss',
  host: panelHost,
})
export class SavedTeamsImportDropzonePanelComponent {}

@Component({
  selector: 'app-saved-teams-import-feedback-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './saved-teams-import-feedback-panel.component.scss',
  host: panelHost,
})
export class SavedTeamsImportFeedbackPanelComponent {}

@Component({
  selector: 'app-saved-teams-open-destination-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './saved-teams-open-destination-panel.component.scss',
  host: panelHost,
})
export class SavedTeamsOpenDestinationPanelComponent {}

@Component({
  selector: 'app-saved-teams-open-copy-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './saved-teams-open-copy-panel.component.scss',
  host: panelHost,
})
export class SavedTeamsOpenCopyPanelComponent {}

@Component({
  selector: 'app-saved-teams-responsive-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './saved-teams-responsive-panel.component.scss',
  host: panelHost,
})
export class SavedTeamsResponsivePanelComponent {}

@Component({
  selector: 'app-saved-teams-style-panels',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    SavedTeamsImportDropzonePanelComponent,
    SavedTeamsImportFeedbackPanelComponent,
    SavedTeamsImportHeadPanelComponent,
    SavedTeamsLayoutPanelComponent,
    SavedTeamsListPanelComponent,
    SavedTeamsModalPanelComponent,
    SavedTeamsAbilityFilterPanelComponent,
    SavedTeamsOpenCopyPanelComponent,
    SavedTeamsOpenDestinationPanelComponent,
    SavedTeamsPreviewPanelComponent,
    SavedTeamsResponsivePanelComponent,
    SavedTeamsShipPanelComponent,
    SavedTeamsSlotPanelComponent,
  ],
  template: stylePanelsTemplate,
  host: panelHost,
})
export class SavedTeamsStylePanelsComponent {}
