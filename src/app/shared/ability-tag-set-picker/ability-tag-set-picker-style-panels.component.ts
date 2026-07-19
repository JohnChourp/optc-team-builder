import { Component, ViewEncapsulation } from '@angular/core';

const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'ability-tag-set-picker-style-panel', style: 'display: contents;' };
const stylePanelsTemplate = `
  <app-ability-tag-set-picker-shell-panel>
    <app-ability-tag-set-picker-formula-panel>
      <app-ability-tag-set-picker-set-panel>
        <app-ability-tag-set-picker-operator-panel>
          <app-ability-tag-set-picker-catalog-panel>
            <app-ability-tag-set-picker-footer-panel>
              <app-ability-tag-set-picker-responsive-panel>
                <app-ability-tag-set-picker-motion-panel>
                  <ng-content></ng-content>
                </app-ability-tag-set-picker-motion-panel>
              </app-ability-tag-set-picker-responsive-panel>
            </app-ability-tag-set-picker-footer-panel>
          </app-ability-tag-set-picker-catalog-panel>
        </app-ability-tag-set-picker-operator-panel>
      </app-ability-tag-set-picker-set-panel>
    </app-ability-tag-set-picker-formula-panel>
  </app-ability-tag-set-picker-shell-panel>
`;

@Component({
  selector: 'app-ability-tag-set-picker-shell-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './ability-tag-set-picker-shell-panel.component.scss',
  host: panelHost,
})
export class AbilityTagSetPickerShellPanelComponent {}

@Component({
  selector: 'app-ability-tag-set-picker-formula-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './ability-tag-set-picker-formula-panel.component.scss',
  host: panelHost,
})
export class AbilityTagSetPickerFormulaPanelComponent {}

@Component({
  selector: 'app-ability-tag-set-picker-set-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './ability-tag-set-picker-set-panel.component.scss',
  host: panelHost,
})
export class AbilityTagSetPickerSetPanelComponent {}

@Component({
  selector: 'app-ability-tag-set-picker-operator-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './ability-tag-set-picker-operator-panel.component.scss',
  host: panelHost,
})
export class AbilityTagSetPickerOperatorPanelComponent {}

@Component({
  selector: 'app-ability-tag-set-picker-catalog-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './ability-tag-set-picker-catalog-panel.component.scss',
  host: panelHost,
})
export class AbilityTagSetPickerCatalogPanelComponent {}

@Component({
  selector: 'app-ability-tag-set-picker-footer-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './ability-tag-set-picker-footer-panel.component.scss',
  host: panelHost,
})
export class AbilityTagSetPickerFooterPanelComponent {}

@Component({
  selector: 'app-ability-tag-set-picker-responsive-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './ability-tag-set-picker-responsive-panel.component.scss',
  host: panelHost,
})
export class AbilityTagSetPickerResponsivePanelComponent {}

@Component({
  selector: 'app-ability-tag-set-picker-motion-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './ability-tag-set-picker-motion-panel.component.scss',
  host: panelHost,
})
export class AbilityTagSetPickerMotionPanelComponent {}

@Component({
  selector: 'app-ability-tag-set-picker-style-panels',
  standalone: true,
  imports: [
    AbilityTagSetPickerShellPanelComponent,
    AbilityTagSetPickerFormulaPanelComponent,
    AbilityTagSetPickerSetPanelComponent,
    AbilityTagSetPickerOperatorPanelComponent,
    AbilityTagSetPickerCatalogPanelComponent,
    AbilityTagSetPickerFooterPanelComponent,
    AbilityTagSetPickerResponsivePanelComponent,
    AbilityTagSetPickerMotionPanelComponent,
  ],
  template: stylePanelsTemplate,
  host: { class: 'ability-tag-set-picker-style-panels', style: 'display: contents;' },
})
export class AbilityTagSetPickerStylePanelsComponent {}
