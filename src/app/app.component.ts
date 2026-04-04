import { App } from "@capacitor/app";
import { Component, DestroyRef, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { IonApp, IonRouterOutlet } from "@ionic/angular/standalone";
import { NavigationEnd, Router } from "@angular/router";
import { filter } from "rxjs";
import packageJson from "../../package.json";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
      <a
        class="app-credit-badge"
        [class.app-credit-badge--tabs]="isTabsRoute()"
        [class.app-credit-badge--standalone]="!isTabsRoute()"
        href="https://github.com/JohnChourp/optc-team-builder"
        target="_blank"
        rel="noreferrer noopener"
        aria-label="Open the optc-team-builder GitHub repository"
      >
        {{ creditLabel() }}
      </a>
    </ion-app>
  `,
  styleUrl: "./app.component.scss",
})
export class AppComponent {
  public readonly appVersion = signal(packageJson.version);
  public readonly creditLabel = computed(() => `powered by johnChourp v.${this.appVersion()}`);
  public readonly currentUrl = signal("");
  public readonly isTabsRoute = computed(() => this.currentUrl().startsWith("/tabs"));

  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  public constructor() {
    this.currentUrl.set(this.router.url);
    void this.loadAppVersion();

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        this.currentUrl.set(event.urlAfterRedirects);
      });
  }

  private async loadAppVersion(): Promise<void> {
    try {
      // Native builds read the platform version fields; web keeps the package.json fallback.
      const { version } = await App.getInfo();

      if (version) {
        this.appVersion.set(version);
      }
    } catch {
      return;
    }
  }
}
