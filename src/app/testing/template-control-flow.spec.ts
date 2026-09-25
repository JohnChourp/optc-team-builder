import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { renderTemplateControlFlow } from './template-control-flow';

/*
 * 869f63gqt. The sign-in gate specs trust this to say what a template renders in a given state,
 * so it has to be right about the three things that would make them pass vacuously: the branch
 * it keeps, the markup it leaves alone, and a condition it cannot read.
 */

class Shell {
  public readonly available = signal(false);
  public readonly profile = signal<{ name: string; email: string | null } | null>(null);
  public readonly status = signal('signed-out');
  private readonly offline = true;

  public isOffline(): boolean {
    return this.offline;
  }
}

describe('renderTemplateControlFlow', () => {
  it('keeps only the branch whose condition holds, all the way down an else-if chain', () => {
    const shell = new Shell();
    const template = `@if (profile(); as p) {<b>SIGNED</b>} @else if (available()) {<b>OFFER</b>} @else {<b>NONE</b>}`;

    expect(renderTemplateControlFlow(template, shell)).toBe('<b>NONE</b>');

    shell.available.set(true);
    expect(renderTemplateControlFlow(template, shell)).toBe('<b>OFFER</b>');

    shell.profile.set({ name: 'Luffy', email: null });
    expect(renderTemplateControlFlow(template, shell)).toBe('<b>SIGNED</b>');
  });

  it('decides nested blocks independently, and binds an alias for the branch that took it', () => {
    const shell = new Shell();

    shell.profile.set({ name: 'Luffy', email: null });

    const rendered = renderTemplateControlFlow(
      `<p>@if (profile(); as p) {{{ p.name }}@if (p.email) {<i>mail</i>} @else {<i>none</i>}}</p>`,
      shell,
    );

    expect(rendered).toBe('<p>{{ p.name }}<i>none</i></p>');
  });

  it("calls the component's methods with the component as this, as a template does", () => {
    expect(renderTemplateControlFlow(`@if (isOffline()) {OFF}`, new Shell())).toBe('OFF');
  });

  it('drops comments, so a block or a control named in one is not rendered', () => {
    const rendered = renderTemplateControlFlow(
      `<!-- @if (available()) { <button (click)="signIn()"> } -->kept`,
      new Shell(),
    );

    expect(rendered).toBe('kept');
  });

  it('leaves braces and @ inside attribute values and interpolations alone', () => {
    const template =
      `<a [class]="{ on: count > 1 }" title="@if (x) {">{{ t('k', { n: 1 }) }}</a>` +
      `@if (available()) {<b>hidden</b>}`;

    expect(renderTemplateControlFlow(template, new Shell())).toBe(
      `<a [class]="{ on: count > 1 }" title="@if (x) {">{{ t('k', { n: 1 }) }}</a>`,
    );
  });

  it('keeps @for, @empty and @defer bodies whole, and still decides the @if inside them', () => {
    const template =
      `@for (item of [1]; track item) {<li>@if (available()) {A} @else {B}</li>} @empty {<li>none</li>}` +
      `@defer (when available()) {<modal></modal>}`;

    expect(renderTemplateControlFlow(template, new Shell())).toBe('<li>B</li> <li>none</li><modal></modal>');
  });

  it('throws on a condition it cannot evaluate instead of treating it as false', () => {
    expect(() => renderTemplateControlFlow(`@if (missingSignal()) {x}`, new Shell())).toThrow(
      /cannot evaluate @if \(missingSignal\(\)\)/u,
    );
  });

  it('refuses a block it does not model rather than misreading where it ends', () => {
    expect(() =>
      renderTemplateControlFlow(`@switch (status()) { @case ('x') {a} }`, new Shell()),
    ).toThrow(/@switch .* not supported/u);
  });
});
