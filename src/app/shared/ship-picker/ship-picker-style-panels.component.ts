import { Component } from '@angular/core';

const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'ship-picker-style-panel', style: 'display: contents;' };
const stylePanelsTemplate = `
  <app-ship-picker-layout-panel>
    <app-ship-picker-panel-panel>
      <app-ship-picker-card-panel>
        <app-ship-picker-media-panel>
          <app-ship-picker-preview-panel>
            <app-ship-picker-responsive-panel>
              <ng-content></ng-content>
            </app-ship-picker-responsive-panel>
          </app-ship-picker-preview-panel>
        </app-ship-picker-media-panel>
      </app-ship-picker-card-panel>
    </app-ship-picker-panel-panel>
  </app-ship-picker-layout-panel>
`;

@Component({
  selector: 'app-ship-picker-layout-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './ship-picker-layout-panel.component.scss',
  host: panelHost,
})
export class ShipPickerLayoutPanelComponent {}

@Component({
  selector: 'app-ship-picker-panel-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './ship-picker-panel-panel.component.scss',
  host: panelHost,
})
export class ShipPickerPanelPanelComponent {}

@Component({
  selector: 'app-ship-picker-card-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './ship-picker-card-panel.component.scss',
  host: panelHost,
})
export class ShipPickerCardPanelComponent {}

@Component({
  selector: 'app-ship-picker-media-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './ship-picker-media-panel.component.scss',
  host: panelHost,
})
export class ShipPickerMediaPanelComponent {}

@Component({
  selector: 'app-ship-picker-preview-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './ship-picker-preview-panel.component.scss',
  host: panelHost,
})
export class ShipPickerPreviewPanelComponent {}

@Component({
  selector: 'app-ship-picker-responsive-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './ship-picker-responsive-panel.component.scss',
  host: panelHost,
})
export class ShipPickerResponsivePanelComponent {}

@Component({
  selector: 'app-ship-picker-style-panels',
  standalone: true,
  imports: [
    ShipPickerCardPanelComponent,
    ShipPickerLayoutPanelComponent,
    ShipPickerMediaPanelComponent,
    ShipPickerPanelPanelComponent,
    ShipPickerPreviewPanelComponent,
    ShipPickerResponsivePanelComponent,
  ],
  template: stylePanelsTemplate,
  host: panelHost,
})
export class ShipPickerStylePanelsComponent {}
