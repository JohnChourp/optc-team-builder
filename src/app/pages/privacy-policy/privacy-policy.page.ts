import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { IonContent } from '@ionic/angular/ion-content';
import { IonHeader } from '@ionic/angular/ion-header';
import { IonTitle } from '@ionic/angular/ion-title';
import { IonToolbar } from '@ionic/angular/ion-toolbar';
import { TranslocoDirective } from "@jsverse/transloco";

import { ToolbarBackButtonComponent } from "../../shared/toolbar-back-button/toolbar-back-button.component";

@Component({
  selector: "app-privacy-policy-page",
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    RouterLink,
    ToolbarBackButtonComponent,
    TranslocoDirective,
  ],
  templateUrl: "./privacy-policy.page.html",
  styleUrl: "./privacy-policy.page.scss",
})
export class PrivacyPolicyPage {
  public readonly repositoryUrl = "https://github.com/JohnChourp/optc-team-builder";
  public readonly ownerUrl = "https://github.com/JohnChourp";
  public readonly authorityUrl = "https://www.dpa.gr/";
}
