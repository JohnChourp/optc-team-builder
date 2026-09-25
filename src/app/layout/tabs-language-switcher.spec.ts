import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type SupportedLanguage } from '../core/i18n/app-i18n.types';
import { AppI18nService } from '../core/services/app-i18n.service';
import { GoogleAccountService } from '../core/services/google-account.service';
import { TabsPage } from './tabs.page';

// IonModal and the two button modules are for the What's New modal the menu imports.
vi.mock('@ionic/angular', () => ({ IonIcon: class {}, IonModal: class {}, IonRouterOutlet: class {} }));
vi.mock('@ionic/angular/ion-accordion', () => ({ IonAccordion: class {} }));
vi.mock('@ionic/angular/ion-accordion-group', () => ({ IonAccordionGroup: class {} }));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-item', () => ({ IonItem: class {} }));
vi.mock('@ionic/angular/ion-label', () => ({ IonLabel: class {} }));
vi.mock('@ionic/angular/ion-list', () => ({ IonList: class {} }));
vi.mock('@ionic/angular/ion-menu', () => ({ IonMenu: class {} }));
vi.mock('@ionic/angular/ion-menu-toggle', () => ({ IonMenuToggle: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

/*
 * 869f63gnt. The side menu's language switcher was two flags, and it showed the current language by
 * DISABLING its button - which takes it out of the tab order and tells a screen reader nothing about
 * "current". Flags also stand for countries, not languages.
 *
 * Pages here are specced without a TestBed, so the switcher's button is cut from the real template,
 * its bindings are evaluated against the real menu component, and the result is built into a real
 * DOM button - what a keyboard and a screen reader would meet.
 */

const TEMPLATE = readFileSync(resolve(process.cwd(), 'src/app/layout/tabs.page.html'), 'utf8');

type LanguageItem = TabsPage['availableLanguages'][number];

function createMenu(active: SupportedLanguage) {
  const setLanguage = vi.fn().mockResolvedValue(undefined);
  const injector = Injector.create({
    providers: [
      {
        provide: GoogleAccountService,
        useValue: {
          isAvailable: signal(false),
          isSignedIn: signal(false),
          profile: signal(null),
          status: signal('signed-out'),
        },
      },
      { provide: AppI18nService, useValue: { activeLanguage: signal(active), setLanguage } },
    ],
  });

  return { menu: runInInjectionContext(injector, () => new TabsPage()), setLanguage };
}

/** The index of the `>` that ends the tag opened at `from`, skipping any `>` inside a quoted value. */
function endOfTag(source: string, from: number): number {
  let quote: string | null = null;

  for (let index = from; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      quote = character === quote ? null : quote;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index;
    }
  }

  return -1;
}

/** The element the switcher repeats for every language, cut from the real template. */
function switcherButton() {
  const loop = TEMPLATE.indexOf('@for (language of availableLanguages');
  const open = TEMPLATE.indexOf('<button', loop);
  const tagEnd = endOfTag(TEMPLATE, open);
  const close = TEMPLATE.indexOf('</button>', tagEnd);

  // Guarded: a cut that misses would make every negative assertion below pass on nothing.
  expect(loop, 'the switcher loop').toBeGreaterThan(-1);
  expect(TEMPLATE.slice(loop, open), 'the loop repeats a native button, nothing else first').not.toContain('<ion-');
  expect(tagEnd).toBeGreaterThan(open);
  expect(close).toBeGreaterThan(tagEnd);

  const tag = TEMPLATE.slice(open + '<button'.length, tagEnd);

  return {
    attributes: [...tag.matchAll(/([^\s=]+)(?:="([^"]*)")?/gu)].map(
      (match) => [match[1]!, match[2] ?? null] as const,
    ),
    body: TEMPLATE.slice(tagEnd + 1, close),
  };
}

function evaluate(expression: string, menu: TabsPage, language: LanguageItem): unknown {
  // `with` resolves names against the component the way a template expression does.
  return new Function('scope', 'language', `with (scope) { return (${expression}); }`)(menu, language) as unknown;
}

/** The button Angular would render for `language`, bindings evaluated, as a real DOM element. */
function render(menu: TabsPage, language: LanguageItem): HTMLButtonElement {
  const { attributes, body } = switcherButton();
  const button = document.createElement('button');

  for (const [name, value] of attributes) {
    if (name.startsWith('(')) {
      continue;
    }

    if (name.startsWith('[attr.')) {
      const bound = evaluate(value ?? '', menu, language);

      if (bound !== null && bound !== undefined) {
        button.setAttribute(name.slice('[attr.'.length, -1), String(bound));
      }
    } else if (name.startsWith('[class.')) {
      button.classList.toggle(name.slice('[class.'.length, -1), Boolean(evaluate(value ?? '', menu, language)));
    } else if (name.startsWith('[')) {
      (button as unknown as Record<string, unknown>)[name.slice(1, -1)] = evaluate(value ?? '', menu, language);
    } else {
      button.setAttribute(name, value ?? '');
    }
  }

  const holder = document.createElement('div');

  button.innerHTML = body.replace(/\{\{([\s\S]*?)\}\}/gu, (_match, expression: string) => {
    holder.textContent = String(evaluate(expression, menu, language));

    return holder.innerHTML;
  });

  return button;
}

/** The name a screen reader announces: `aria-label` if any, else the text that is not aria-hidden. */
function accessibleName(element: HTMLElement): string {
  const label = element.getAttribute('aria-label');

  if (label !== null) {
    return label;
  }

  const parts: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? '');
    } else if (!(node instanceof Element && node.getAttribute('aria-hidden') === 'true')) {
      node.childNodes.forEach(walk);
    }
  };

  walk(element);

  return parts.join(' ').replace(/\s+/gu, ' ').trim();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the side menu language switcher', () => {
  for (const active of ['en', 'el'] as const) {
    describe(`with the menu in ${active === 'en' ? 'English' : 'Greek'}`, () => {
      it('names each language in that language: English and Ελληνικά', () => {
        const { menu } = createMenu(active);
        const buttons = menu.availableLanguages.map((language) => render(menu, language));

        expect(buttons.map(accessibleName)).toEqual(['English', 'Ελληνικά']);
        // The flag is still there to see, and is not part of the name.
        expect(buttons.map((button) => button.textContent?.replace(/\s+/gu, ''))).toEqual(['🇬🇧English', '🇬🇷Ελληνικά']);
      });

      it('announces the current language as pressed and the other as not, and neither is disabled', () => {
        const { menu } = createMenu(active);
        const rendered = menu.availableLanguages.map((language) => ({
          id: language.id,
          button: render(menu, language),
        }));

        for (const { id, button } of rendered) {
          expect(button.getAttribute('aria-pressed'), id).toBe(id === active ? 'true' : 'false');
          // Not disabled, so still reachable with Tab: a disabled button leaves the tab order.
          expect(button.disabled, id).toBe(false);
          expect(button.hasAttribute('disabled'), id).toBe(false);
          expect(button.classList.contains('language-flag-button--active'), id).toBe(id === active);
        }
      });

      it('marks each name with its own language, so a screen reader says Ελληνικά in Greek', () => {
        const { menu } = createMenu(active);

        expect(menu.availableLanguages.map((language) => render(menu, language).getAttribute('lang'))).toEqual([
          'en',
          'el',
        ]);
      });

      it('switches only when the other language is pressed', async () => {
        const { menu, setLanguage } = createMenu(active);
        const other: SupportedLanguage = active === 'en' ? 'el' : 'en';

        await menu.onLanguageSelect(active);
        expect(setLanguage).not.toHaveBeenCalled();

        await menu.onLanguageSelect(other);
        expect(setLanguage).toHaveBeenCalledExactlyOnceWith(other);
      });
    });
  }

  it('binds no disabled state and no label that would override the name', () => {
    const names = switcherButton().attributes.map(([name]) => name);

    // The positive control: the cut really is the switcher's button.
    expect(names).toContain('[attr.aria-pressed]');
    expect(names).not.toContain('[disabled]');
    expect(names).not.toContain('disabled');
    expect(names.filter((name) => /aria-label/u.test(name))).toEqual([]);
  });

  it('keeps the switcher a named group', () => {
    const container = TEMPLATE.slice(
      TEMPLATE.indexOf('class="tabs-menu__language-switcher"'),
      TEMPLATE.indexOf('@for (language of availableLanguages'),
    );

    expect(container).toContain('role="group"');
    expect(container).toContain(`[attr.aria-label]="'tabs.languageSwitcherAriaLabel' | transloco"`);
  });
});
