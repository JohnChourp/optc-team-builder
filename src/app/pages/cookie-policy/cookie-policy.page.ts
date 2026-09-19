import { CommonModule } from "@angular/common";
import { Component, computed } from "@angular/core";
import { RouterLink } from "@angular/router";
import { IonButton } from '@ionic/angular/ion-button';
import { IonContent } from '@ionic/angular/ion-content';
import { IonHeader } from '@ionic/angular/ion-header';
import { IonTitle } from '@ionic/angular/ion-title';
import { IonToolbar } from '@ionic/angular/ion-toolbar';
import { TranslocoDirective } from "@jsverse/transloco";

import { AnalyticsConsentService } from "../../core/services/analytics-consent.service";
import { ToolbarBackButtonComponent } from "../../shared/toolbar-back-button/toolbar-back-button.component";

@Component({
  selector: "app-cookie-policy-page",
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    RouterLink,
    ToolbarBackButtonComponent,
    TranslocoDirective,
  ],
  templateUrl: "./cookie-policy.page.html",
  styleUrl: "./cookie-policy.page.scss",
})
export class CookiePolicyPage {
  public readonly analyticsConsent;
  /** 869f13c5m. False where analytics cannot run (no GA4 id, or native): no choice is offered. */
  public readonly analyticsAvailable: boolean;
  public readonly analyticsConsentStatusKey;

  public constructor(private readonly analyticsConsentService: AnalyticsConsentService) {
    this.analyticsConsent = this.analyticsConsentService.consent;
    this.analyticsAvailable = this.analyticsConsentService.available;
    this.analyticsConsentStatusKey = computed(
      () => `consent.status.${this.analyticsAvailable ? this.analyticsConsent() : 'unavailable'}`,
    );
  }

  public async acceptAnalyticsConsent(): Promise<void> {
    await this.analyticsConsentService.accept();
  }

  public async rejectAnalyticsConsent(): Promise<void> {
    await this.analyticsConsentService.reject();
  }
}
