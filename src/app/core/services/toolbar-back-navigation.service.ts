import { Location } from '@angular/common';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class ToolbarBackNavigationService {
  private readonly history: string[] = [];
  private pendingBackNavigation = false;

  public constructor(
    private readonly location: Location,
    private readonly router: Router,
  ) {}

  public recordNavigation(url: string): void {
    const normalizedUrl = url.trim();
    const currentUrl = this.history.at(-1) ?? null;

    if (!normalizedUrl) {
      return;
    }

    if (normalizedUrl === currentUrl) {
      this.pendingBackNavigation = false;
      return;
    }

    if (this.pendingBackNavigation) {
      this.pendingBackNavigation = false;
      const existingIndex = this.history.lastIndexOf(normalizedUrl, this.history.length - 2);

      if (existingIndex >= 0) {
        this.history.splice(existingIndex + 1);
        return;
      }

      this.history.splice(0, this.history.length, normalizedUrl);
      return;
    }

    this.history.push(normalizedUrl);
  }

  public async goBackOrFallback(fallbackUrl = '/tabs/characters'): Promise<void> {
    if (this.history.length > 1) {
      this.pendingBackNavigation = true;
      this.location.back();
      return;
    }

    this.pendingBackNavigation = false;
    this.history.splice(0, this.history.length, fallbackUrl);
    await this.router.navigateByUrl(fallbackUrl, { replaceUrl: true });
  }
}
