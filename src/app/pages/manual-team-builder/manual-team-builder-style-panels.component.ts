import { Component } from '@angular/core';

const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'manual-team-builder-style-panel' };
const workbenchPanelsTemplate = `
  <app-manual-team-builder-workbench-layout-panel>
    <app-manual-team-builder-workbench-control-panel>
      <app-manual-team-builder-workbench-slot-base-panel>
        <app-manual-team-builder-workbench-slot-detail-panel>
          <app-manual-team-builder-workbench-feedback-panel>
            <ng-content></ng-content>
          </app-manual-team-builder-workbench-feedback-panel>
        </app-manual-team-builder-workbench-slot-detail-panel>
      </app-manual-team-builder-workbench-slot-base-panel>
    </app-manual-team-builder-workbench-control-panel>
  </app-manual-team-builder-workbench-layout-panel>
`;
const pickerPanelsTemplate = `
  <app-manual-team-builder-picker-modal-panel>
    <app-manual-team-builder-picker-slot-panel>
      <app-manual-team-builder-picker-filter-panel>
        <app-manual-team-builder-picker-empty-panel>
          <app-manual-team-builder-picker-candidate-panel>
            <app-manual-team-builder-picker-link-panel>
              <app-manual-team-builder-picker-responsive-panel>
                <ng-content></ng-content>
              </app-manual-team-builder-picker-responsive-panel>
            </app-manual-team-builder-picker-link-panel>
          </app-manual-team-builder-picker-candidate-panel>
        </app-manual-team-builder-picker-empty-panel>
      </app-manual-team-builder-picker-filter-panel>
    </app-manual-team-builder-picker-slot-panel>
  </app-manual-team-builder-picker-modal-panel>
`;

@Component({
  selector: 'app-manual-team-builder-workbench-layout-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './manual-team-builder-workbench-layout-panel.component.scss',
  host: panelHost,
})
export class ManualTeamBuilderWorkbenchLayoutPanelComponent {}

@Component({
  selector: 'app-manual-team-builder-workbench-control-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './manual-team-builder-workbench-control-panel.component.scss',
  host: panelHost,
})
export class ManualTeamBuilderWorkbenchControlPanelComponent {}

@Component({
  selector: 'app-manual-team-builder-workbench-slot-base-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './manual-team-builder-workbench-slot-base-panel.component.scss',
  host: panelHost,
})
export class ManualTeamBuilderWorkbenchSlotBasePanelComponent {}

@Component({
  selector: 'app-manual-team-builder-workbench-slot-detail-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './manual-team-builder-workbench-slot-detail-panel.component.scss',
  host: panelHost,
})
export class ManualTeamBuilderWorkbenchSlotDetailPanelComponent {}

@Component({
  selector: 'app-manual-team-builder-workbench-feedback-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './manual-team-builder-workbench-feedback-panel.component.scss',
  host: panelHost,
})
export class ManualTeamBuilderWorkbenchFeedbackPanelComponent {}

@Component({
  selector: 'app-manual-team-builder-workbench-panel',
  standalone: true,
  imports: [
    ManualTeamBuilderWorkbenchControlPanelComponent,
    ManualTeamBuilderWorkbenchFeedbackPanelComponent,
    ManualTeamBuilderWorkbenchLayoutPanelComponent,
    ManualTeamBuilderWorkbenchSlotBasePanelComponent,
    ManualTeamBuilderWorkbenchSlotDetailPanelComponent,
  ],
  template: workbenchPanelsTemplate,
  styleUrl: './manual-team-builder-workbench-panel.component.scss',
  host: panelHost,
})
export class ManualTeamBuilderWorkbenchPanelComponent {}

@Component({
  selector: 'app-manual-team-builder-picker-modal-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './manual-team-builder-picker-modal-panel.component.scss',
  host: panelHost,
})
export class ManualTeamBuilderPickerModalPanelComponent {}

@Component({
  selector: 'app-manual-team-builder-picker-slot-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './manual-team-builder-picker-slot-panel.component.scss',
  host: panelHost,
})
export class ManualTeamBuilderPickerSlotPanelComponent {}

@Component({
  selector: 'app-manual-team-builder-picker-filter-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './manual-team-builder-picker-filter-panel.component.scss',
  host: panelHost,
})
export class ManualTeamBuilderPickerFilterPanelComponent {}

@Component({
  selector: 'app-manual-team-builder-picker-empty-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './manual-team-builder-picker-empty-panel.component.scss',
  host: panelHost,
})
export class ManualTeamBuilderPickerEmptyPanelComponent {}

@Component({
  selector: 'app-manual-team-builder-picker-candidate-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './manual-team-builder-picker-candidate-panel.component.scss',
  host: panelHost,
})
export class ManualTeamBuilderPickerCandidatePanelComponent {}

@Component({
  selector: 'app-manual-team-builder-picker-link-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './manual-team-builder-picker-link-panel.component.scss',
  host: panelHost,
})
export class ManualTeamBuilderPickerLinkPanelComponent {}

@Component({
  selector: 'app-manual-team-builder-picker-responsive-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './manual-team-builder-picker-responsive-panel.component.scss',
  host: panelHost,
})
export class ManualTeamBuilderPickerResponsivePanelComponent {}

@Component({
  selector: 'app-manual-team-builder-picker-panel',
  standalone: true,
  imports: [
    ManualTeamBuilderPickerCandidatePanelComponent,
    ManualTeamBuilderPickerEmptyPanelComponent,
    ManualTeamBuilderPickerFilterPanelComponent,
    ManualTeamBuilderPickerLinkPanelComponent,
    ManualTeamBuilderPickerModalPanelComponent,
    ManualTeamBuilderPickerResponsivePanelComponent,
    ManualTeamBuilderPickerSlotPanelComponent,
  ],
  template: pickerPanelsTemplate,
  styleUrl: './manual-team-builder-picker-panel.component.scss',
  host: panelHost,
})
export class ManualTeamBuilderPickerPanelComponent {}
