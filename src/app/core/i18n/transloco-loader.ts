import { DOCUMENT } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import {
  type Translation,
  type TranslocoLoader,
  type TranslocoLoaderData,
} from "@jsverse/transloco";

@Injectable({ providedIn: "root" })
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly document = inject(DOCUMENT);
  private readonly http = inject(HttpClient);

  public getTranslation(lang: string, data?: TranslocoLoaderData) {
    const scope = data?.scope;
    const normalizedLang =
      scope && lang.startsWith(`${scope}/`) ? lang.slice(scope.length + 1) : lang;
    const path = scope ? `i18n/${scope}/${normalizedLang}.json` : `i18n/${normalizedLang}.json`;

    return this.http.get<Translation>(new URL(path, this.document.baseURI).toString());
  }
}
