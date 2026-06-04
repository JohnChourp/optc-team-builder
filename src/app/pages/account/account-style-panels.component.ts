import { Component, ViewEncapsulation } from '@angular/core';

const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'account-style-panel', style: 'display: contents;' };
const stylePanelsTemplate = `
  <app-account-layout-panel>
    <app-account-identity-panel>
      <app-account-drive-overview-panel>
        <app-account-transfer-panel>
          <app-account-review-shell-panel>
            <app-account-review-rows-panel>
              <app-account-responsive-panel>
                <ng-content></ng-content>
              </app-account-responsive-panel>
            </app-account-review-rows-panel>
          </app-account-review-shell-panel>
        </app-account-transfer-panel>
      </app-account-drive-overview-panel>
    </app-account-identity-panel>
  </app-account-layout-panel>
`;

@Component({
  selector: 'app-account-layout-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './account-layout-panel.component.scss',
  host: panelHost,
})
export class AccountLayoutPanelComponent {}

@Component({
  selector: 'app-account-identity-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './account-identity-panel.component.scss',
  host: panelHost,
})
export class AccountIdentityPanelComponent {}

@Component({
  selector: 'app-account-drive-overview-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './account-drive-overview-panel.component.scss',
  host: panelHost,
})
export class AccountDriveOverviewPanelComponent {}

@Component({
  selector: 'app-account-transfer-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './account-transfer-panel.component.scss',
  host: panelHost,
})
export class AccountTransferPanelComponent {}

@Component({
  selector: 'app-account-review-shell-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './account-review-shell-panel.component.scss',
  host: panelHost,
})
export class AccountReviewShellPanelComponent {}

@Component({
  selector: 'app-account-review-rows-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './account-review-rows-panel.component.scss',
  host: panelHost,
})
export class AccountReviewRowsPanelComponent {}

@Component({
  selector: 'app-account-responsive-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: projectedTemplate,
  styleUrl: './account-responsive-panel.component.scss',
  host: panelHost,
})
export class AccountResponsivePanelComponent {}

@Component({
  selector: 'app-account-style-panels',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    AccountDriveOverviewPanelComponent,
    AccountIdentityPanelComponent,
    AccountLayoutPanelComponent,
    AccountResponsivePanelComponent,
    AccountReviewRowsPanelComponent,
    AccountReviewShellPanelComponent,
    AccountTransferPanelComponent,
  ],
  template: stylePanelsTemplate,
  host: panelHost,
})
export class AccountStylePanelsComponent {}
