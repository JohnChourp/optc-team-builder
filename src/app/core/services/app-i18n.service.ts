import { DOCUMENT } from "@angular/common";
import { Inject, Injectable, signal } from "@angular/core";
import { Preferences } from "@capacitor/preferences";
import { TranslocoService } from "@jsverse/transloco";
import { firstValueFrom } from "rxjs";

import {
  APP_I18N_AVAILABLE_LANGUAGES,
  APP_LANGUAGE_PREFERENCE_KEY,
  DEFAULT_APP_LANGUAGE,
  type SupportedLanguage,
} from "../i18n/app-i18n.types";

type TranslationParams = Record<string, string | number | boolean | null | undefined>;

@Injectable({ providedIn: "root" })
export class AppI18nService {
  private readonly activeLanguageState = signal<SupportedLanguage>(DEFAULT_APP_LANGUAGE);
  private readonly translationRevision = signal(0);
  private readonly loadedPaths = new Set<string>();
  private readonly pendingLoads = new Map<string, Promise<void>>();
  private readonly readyPromise: Promise<void>;

  public readonly availableLanguages = APP_I18N_AVAILABLE_LANGUAGES;
  public readonly activeLanguage = this.activeLanguageState.asReadonly();

  public constructor(
    private readonly transloco: TranslocoService,
    @Inject(DOCUMENT) private readonly document: Document,
  ) {
    this.readyPromise = this.hydrate();

    this.transloco.events$.subscribe((event) => {
      if (
        event.type === "translationLoadSuccess" ||
        event.type === "translationLoadFailure" ||
        event.type === "langChanged"
      ) {
        this.translationRevision.update((value) => value + 1);
      }
    });
  }

  public async ready(): Promise<void> {
    await this.readyPromise;
  }

  public async setLanguage(language: SupportedLanguage): Promise<void> {
    const nextLanguage = this.resolveSupportedLanguage(language);

    await this.ensureLoaded(nextLanguage);
    this.transloco.setActiveLang(nextLanguage);
    this.activeLanguageState.set(nextLanguage);
    this.document.documentElement.lang = nextLanguage;
    await Preferences.set({ key: APP_LANGUAGE_PREFERENCE_KEY, value: nextLanguage });
  }

  public async preloadScope(scope: string): Promise<void> {
    await this.ensureLoaded(this.activeLanguageState(), scope);
  }

  public translate(
    key: string,
    params?: TranslationParams,
    scope?: string,
  ): string {
    const language = this.activeLanguageState();
    this.translationRevision();
    void this.ensureLoaded(language, scope);

    const resolvedKey = scope ? `${scope}.${key}` : key;
    return this.transloco.translate<string>(resolvedKey, params, language);
  }

  private async hydrate(): Promise<void> {
    const { value } = await Preferences.get({ key: APP_LANGUAGE_PREFERENCE_KEY });
    await this.setLanguage(this.resolveSupportedLanguage(value));
  }

  private resolveSupportedLanguage(value: string | null | undefined): SupportedLanguage {
    return this.availableLanguages.some((language) => language.id === value)
      ? (value as SupportedLanguage)
      : DEFAULT_APP_LANGUAGE;
  }

  private async ensureLoaded(language: SupportedLanguage, scope?: string): Promise<void> {
    const path = scope ? `${scope}/${language}` : language;

    if (this.loadedPaths.has(path)) {
      return;
    }

    const existing = this.pendingLoads.get(path);
    if (existing) {
      await existing;
      return;
    }

    const loadPromise = firstValueFrom(this.transloco.load(path))
      .then(() => {
        this.loadedPaths.add(path);
      })
      .catch(() => {
        this.pendingLoads.delete(path);
      })
      .finally(() => {
        this.pendingLoads.delete(path);
      });

    this.pendingLoads.set(path, loadPromise);
    await loadPromise;
  }
}
