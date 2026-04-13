import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from "@ionic/angular/standalone";
import { TranslocoDirective } from "@jsverse/transloco";

@Component({
  selector: "app-privacy-policy-page",
  standalone: true,
  imports: [
    CommonModule,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    RouterLink,
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
