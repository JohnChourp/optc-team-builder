import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { ToolbarBackButtonComponent } from './toolbar-back-button.component';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonButtons: class {},
  IonIcon: class {},
}));

vi.mock('@jsverse/transloco', () => ({
  TranslocoPipe: class {},
}));

describe('ToolbarBackButtonComponent', () => {
  it('renders a toolbar back button that delegates to the shared navigation helper', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/shared/toolbar-back-button/toolbar-back-button.component.html'),
      'utf8',
    );

    expect(template).toContain("'common.actions.back' | transloco");
    expect(template).toContain('(click)="goBack()"');
    expect(template).toContain('[icon]="backIcon"');
  });

  it('delegates back navigation through the shared toolbar service', () => {
    const toolbarBackNavigation = {
      goBackOrFallback: vi.fn().mockResolvedValue(undefined),
    };
    const component = new ToolbarBackButtonComponent(toolbarBackNavigation as never);

    component.goBack();

    expect(toolbarBackNavigation.goBackOrFallback).toHaveBeenCalledOnce();
  });
});
