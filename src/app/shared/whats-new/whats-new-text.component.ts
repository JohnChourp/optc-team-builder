import { Component, Input } from '@angular/core';

import { type InlineToken, tokenizeInlineMarkdown } from './whats-new-markdown.utils';

/**
 * One release-note string, with its bold and its code rendered.
 *
 * 869f13gam. Every `**bold**` in `whats-new.data.ts` reached players as literal
 * asterisks, because the modal interpolated the strings as plain text. The rule that
 * writes those entries REQUIRES the bold, so every entry written correctly to the
 * rule looked broken.
 *
 * NO `[innerHTML]`, DELIBERATELY. This renders `<strong>` and `<code>` as real
 * elements from a token list, so no HTML string is ever built and Angular's default
 * escaping covers every character. On a player-facing surface fed from a file that
 * several people edit, closing the injection path by construction is worth more than
 * the few lines it costs - and it is not hypothetical: four live strings contain
 * `<class>` as a placeholder a player is meant to read, which `[innerHTML]` would
 * parse as an unknown element and show as nothing.
 *
 * Tokenising in the input setter rather than in the template keeps it off the
 * change-detection path: the strings are immutable release copy, so the work happens
 * once per binding rather than on every cycle. That also makes this cheaper than the
 * `{{ localised(item) }}` method calls it replaces, which ran on every cycle.
 */
@Component({
  selector: 'app-whats-new-text',
  standalone: true,
  /*
   * Written without whitespace between the branches on purpose. Token text carries
   * its own spacing - `{ text: 'The ' }` - so a newline between these blocks would
   * add a space that is not in the entry.
   */
  template: `@for (token of tokens; track $index) {@if (token.code) {<code>{{ token.text }}</code>} @else if (token.bold) {<strong>{{ token.text }}</strong>} @else {{{
        token.text
      }}}}`,
  /*
   * 869f13gam. These live HERE, not in `whats-new-modal.component.scss`.
   *
   * The first attempt put them there and they silently did nothing: view
   * encapsulation scopes a component's styles to its OWN template, and this `<code>`
   * is in a child component's template. Nothing errored - the element simply kept the
   * browser's default `monospace`, which looks close enough to a deliberate style to
   * pass a glance. Caught by reading `getComputedStyle().fontFamily` in the running
   * app and seeing `monospace` where the rule would have given `ui-monospace`.
   *
   * The background is deliberately OPAQUE. A translucent one sits on whatever is
   * behind it, which on this surface is an already-translucent card over a near-black
   * page - and a colour whose alpha is dropped is exactly how this project once
   * reported 175 contrast failures that did not exist.
   */
  styles: `
    code {
      padding: 0.05em 0.35em;
      border-radius: 0.3rem;
      background: #1b2133;
      color: var(--ion-text-color-step-100, #e9edf7);
      font-family: var(--ion-font-family-monospace, ui-monospace, 'SF Mono', Menlo, monospace);
      /*
       * 0.95, not the 0.88 this started at. Measured in the running app: the bullet
       * prose is 13.44px, so 0.88em gave 11.83px - small on a phone, and the chip
       * and the monospace face already tell a code span apart without shrinking it.
       */
      font-size: 0.95em;
      overflow-wrap: anywhere;
    }
  `,
})
export class WhatsNewTextComponent {
  public tokens: readonly InlineToken[] = [];

  /**
   * A setter rather than a plain field because the tokens are derived, and a
   * `@Input()` is not a signal - so there is nothing for a `computed` to track.
   */
  @Input({ required: true })
  public set value(source: string) {
    this.tokens = tokenizeInlineMarkdown(source ?? '');
  }
}
