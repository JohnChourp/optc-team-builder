import { Component } from '@angular/core';

const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'home-style-panel', style: 'display: contents;' };
const stylePanelsTemplate = `
  <app-home-layout-panel>
    <app-home-hero-panel>
      <app-home-hero-media-panel>
        <app-home-account-panel>
          <app-home-highlight-panel>
            <app-home-feature-panel>
              <app-home-workflow-panel>
                <app-home-responsive-panel>
                  <ng-content></ng-content>
                </app-home-responsive-panel>
              </app-home-workflow-panel>
            </app-home-feature-panel>
          </app-home-highlight-panel>
        </app-home-account-panel>
      </app-home-hero-media-panel>
    </app-home-hero-panel>
  </app-home-layout-panel>
`;

@Component({
  selector: 'app-home-layout-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './home-layout-panel.component.scss',
  host: panelHost,
})
export class HomeLayoutPanelComponent {}

@Component({
  selector: 'app-home-hero-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './home-hero-panel.component.scss',
  host: panelHost,
})
export class HomeHeroPanelComponent {}

@Component({
  selector: 'app-home-hero-media-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './home-hero-media-panel.component.scss',
  host: panelHost,
})
export class HomeHeroMediaPanelComponent {}

@Component({
  selector: 'app-home-account-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './home-account-panel.component.scss',
  host: panelHost,
})
export class HomeAccountPanelComponent {}

@Component({
  selector: 'app-home-highlight-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './home-highlight-panel.component.scss',
  host: panelHost,
})
export class HomeHighlightPanelComponent {}

@Component({
  selector: 'app-home-feature-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './home-feature-panel.component.scss',
  host: panelHost,
})
export class HomeFeaturePanelComponent {}

@Component({
  selector: 'app-home-workflow-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './home-workflow-panel.component.scss',
  host: panelHost,
})
export class HomeWorkflowPanelComponent {}

@Component({
  selector: 'app-home-responsive-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './home-responsive-panel.component.scss',
  host: panelHost,
})
export class HomeResponsivePanelComponent {}

@Component({
  selector: 'app-home-style-panels',
  standalone: true,
  imports: [
    HomeAccountPanelComponent,
    HomeFeaturePanelComponent,
    HomeHeroMediaPanelComponent,
    HomeHeroPanelComponent,
    HomeHighlightPanelComponent,
    HomeLayoutPanelComponent,
    HomeResponsivePanelComponent,
    HomeWorkflowPanelComponent,
  ],
  template: stylePanelsTemplate,
  host: panelHost,
})
export class HomeStylePanelsComponent {}
