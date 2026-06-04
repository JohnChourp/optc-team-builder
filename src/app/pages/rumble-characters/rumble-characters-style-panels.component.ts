import { Component, ViewEncapsulation } from '@angular/core';

const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'rumble-characters-style-panel', style: 'display: contents;' };
const stylePanelsTemplate = `
  <app-rumble-characters-layout-panel>
    <app-rumble-characters-controls-panel>
      <app-rumble-characters-buff-focus-panel>
        <app-rumble-characters-card-panel>
          <app-rumble-characters-metrics-panel>
            <app-rumble-characters-responsive-panel>
              <ng-content></ng-content>
            </app-rumble-characters-responsive-panel>
          </app-rumble-characters-metrics-panel>
        </app-rumble-characters-card-panel>
      </app-rumble-characters-buff-focus-panel>
    </app-rumble-characters-controls-panel>
  </app-rumble-characters-layout-panel>
`;

@Component({
  selector: 'app-rumble-characters-layout-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './rumble-characters-layout-panel.component.scss',
  host: panelHost,
})
export class RumbleCharactersLayoutPanelComponent {}

@Component({
  selector: 'app-rumble-characters-controls-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './rumble-characters-controls-panel.component.scss',
  host: panelHost,
})
export class RumbleCharactersControlsPanelComponent {}

@Component({
  selector: 'app-rumble-characters-buff-focus-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './rumble-characters-buff-focus-panel.component.scss',
  host: panelHost,
})
export class RumbleCharactersBuffFocusPanelComponent {}

@Component({
  selector: 'app-rumble-characters-card-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './rumble-characters-card-panel.component.scss',
  host: panelHost,
})
export class RumbleCharactersCardPanelComponent {}

@Component({
  selector: 'app-rumble-characters-metrics-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './rumble-characters-metrics-panel.component.scss',
  host: panelHost,
})
export class RumbleCharactersMetricsPanelComponent {}

@Component({
  selector: 'app-rumble-characters-responsive-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './rumble-characters-responsive-panel.component.scss',
  host: panelHost,
})
export class RumbleCharactersResponsivePanelComponent {}

@Component({
  selector: 'app-rumble-characters-style-panels',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    RumbleCharactersBuffFocusPanelComponent,
    RumbleCharactersCardPanelComponent,
    RumbleCharactersControlsPanelComponent,
    RumbleCharactersLayoutPanelComponent,
    RumbleCharactersMetricsPanelComponent,
    RumbleCharactersResponsivePanelComponent,
  ],
  template: stylePanelsTemplate,
  host: panelHost,
})
export class RumbleCharactersStylePanelsComponent {}
