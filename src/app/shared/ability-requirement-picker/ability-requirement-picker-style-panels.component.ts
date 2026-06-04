import { Component, ViewEncapsulation } from '@angular/core';

const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'ability-requirement-picker-style-panel', style: 'display: contents;' };
const stylePanelsTemplate = `
  <app-ability-requirement-picker-shell-panel>
    <app-ability-requirement-picker-catalog-panel>
      <app-ability-requirement-picker-badge-panel>
        <app-ability-requirement-picker-badge-tone-panel>
          <app-ability-requirement-picker-row-panel>
            <app-ability-requirement-picker-field-panel>
              <app-ability-requirement-picker-leader-boost-panel>
                <app-ability-requirement-picker-token-panel>
                  <app-ability-requirement-picker-footer-panel>
                    <app-ability-requirement-picker-responsive-panel>
                      <ng-content></ng-content>
                    </app-ability-requirement-picker-responsive-panel>
                  </app-ability-requirement-picker-footer-panel>
                </app-ability-requirement-picker-token-panel>
              </app-ability-requirement-picker-leader-boost-panel>
            </app-ability-requirement-picker-field-panel>
          </app-ability-requirement-picker-row-panel>
        </app-ability-requirement-picker-badge-tone-panel>
      </app-ability-requirement-picker-badge-panel>
    </app-ability-requirement-picker-catalog-panel>
  </app-ability-requirement-picker-shell-panel>
`;

@Component({
  selector: 'app-ability-requirement-picker-shell-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './ability-requirement-picker-shell-panel.component.scss',
  host: panelHost,
})
export class AbilityRequirementPickerShellPanelComponent {}

@Component({
  selector: 'app-ability-requirement-picker-catalog-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './ability-requirement-picker-catalog-panel.component.scss',
  host: panelHost,
})
export class AbilityRequirementPickerCatalogPanelComponent {}

@Component({
  selector: 'app-ability-requirement-picker-badge-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './ability-requirement-picker-badge-panel.component.scss',
  host: panelHost,
})
export class AbilityRequirementPickerBadgePanelComponent {}

@Component({
  selector: 'app-ability-requirement-picker-badge-tone-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './ability-requirement-picker-badge-tone-panel.component.scss',
  host: panelHost,
})
export class AbilityRequirementPickerBadgeTonePanelComponent {}

@Component({
  selector: 'app-ability-requirement-picker-row-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './ability-requirement-picker-row-panel.component.scss',
  host: panelHost,
})
export class AbilityRequirementPickerRowPanelComponent {}

@Component({
  selector: 'app-ability-requirement-picker-field-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './ability-requirement-picker-field-panel.component.scss',
  host: panelHost,
})
export class AbilityRequirementPickerFieldPanelComponent {}

@Component({
  selector: 'app-ability-requirement-picker-leader-boost-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './ability-requirement-picker-leader-boost-panel.component.scss',
  host: panelHost,
})
export class AbilityRequirementPickerLeaderBoostPanelComponent {}

@Component({
  selector: 'app-ability-requirement-picker-token-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './ability-requirement-picker-token-panel.component.scss',
  host: panelHost,
})
export class AbilityRequirementPickerTokenPanelComponent {}

@Component({
  selector: 'app-ability-requirement-picker-footer-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './ability-requirement-picker-footer-panel.component.scss',
  host: panelHost,
})
export class AbilityRequirementPickerFooterPanelComponent {}

@Component({
  selector: 'app-ability-requirement-picker-responsive-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './ability-requirement-picker-responsive-panel.component.scss',
  host: panelHost,
})
export class AbilityRequirementPickerResponsivePanelComponent {}

@Component({
  selector: 'app-ability-requirement-picker-style-panels',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    AbilityRequirementPickerBadgePanelComponent,
    AbilityRequirementPickerBadgeTonePanelComponent,
    AbilityRequirementPickerCatalogPanelComponent,
    AbilityRequirementPickerFieldPanelComponent,
    AbilityRequirementPickerFooterPanelComponent,
    AbilityRequirementPickerLeaderBoostPanelComponent,
    AbilityRequirementPickerResponsivePanelComponent,
    AbilityRequirementPickerRowPanelComponent,
    AbilityRequirementPickerShellPanelComponent,
    AbilityRequirementPickerTokenPanelComponent,
  ],
  template: stylePanelsTemplate,
  host: panelHost,
})
export class AbilityRequirementPickerStylePanelsComponent {}
