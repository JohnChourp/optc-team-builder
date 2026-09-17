import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  formatSharedPickerDismissalResult,
  inspectSharedPickerDismissal,
} from './check-shared-picker-dismissal.mjs';
import {
  inspectPickerDismissal,
  readDismissHandler,
  readMethodBody,
} from './lib/shared-picker-dismissal.mjs';

/**
 * 869f138pv. Each half of the contract is proved by removing it.
 *
 * Both halves have to be checked separately, because each fails in a way the other cannot catch: a
 * handler that ignores the reason emits twice on an explicit close, and one that never emits leaves
 * the host thinking a dismissed pop-up is still open.
 */

const TEMPLATE = `<ion-modal [isOpen]="isOpen" (didDismiss)="onModalDidDismiss()"></ion-modal>`;
const COMPONENT = `
export class PickerComponent {
  private dismissReason: 'save' | 'cancel' | null = null;

  public onModalDidDismiss(): void {
    if (this.dismissReason !== null) {
      this.dismissReason = null;
      return;
    }

    this.dismiss.emit();
  }
}
`;

function inspect(template: string, source: string) {
  return inspectPickerDismissal({ filePath: 'picker.html', template, source });
}

describe('the dismissal contract', () => {
  it('accepts a picker that keeps it', () => {
    expect(inspect(TEMPLATE, COMPONENT)).toEqual([]);
  });

  it('ignores a shared component that has no modal at all', () => {
    expect(inspect('<div class="rail"></div>', 'export class Rail {}')).toEqual([]);
  });

  it('catches a modal that binds no didDismiss', () => {
    const [finding] = inspect('<ion-modal [isOpen]="isOpen"></ion-modal>', COMPONENT);

    expect(finding.kind).toBe('picker-without-dismiss-binding');
  });

  it('catches a component with no dismiss reason to consume', () => {
    const kinds = inspect(
      TEMPLATE,
      'export class P { onModalDidDismiss(): void { this.dismiss.emit(); } }',
    ).map((finding) => finding.kind);

    expect(kinds).toContain('picker-without-dismiss-reason');
  });

  it('catches a handler that ignores the reason and would emit twice', () => {
    const kinds = inspect(
      TEMPLATE,
      `export class P {
        private dismissReason: 'save' | 'cancel' | null = null;
        onModalDidDismiss(): void { this.dismiss.emit(); }
      }`,
    ).map((finding) => finding.kind);

    expect(kinds).toEqual(['dismiss-handler-ignores-reason']);
  });

  it('catches a handler that never tells the host at all', () => {
    const kinds = inspect(
      TEMPLATE,
      `export class P {
        private dismissReason: 'save' | 'cancel' | null = null;
        onModalDidDismiss(): void { this.dismissReason = null; }
      }`,
    ).map((finding) => finding.kind);

    expect(kinds).toEqual(['dismiss-handler-does-not-emit']);
  });

  it('catches a binding that names a method the component does not have', () => {
    const [finding] = inspect(
      `<ion-modal (didDismiss)="onClosed()"></ion-modal>`,
      `export class P { private dismissReason: 'save' | null = null; }`,
    );

    expect(finding.kind).toBe('dismiss-handler-missing');
  });

  it('reads the handler name out of a binding with arguments', () => {
    expect(readDismissHandler('<ion-modal (didDismiss)="onModalDidDismiss($event, x)">')).toBe(
      'onModalDidDismiss',
    );
    expect(readDismissHandler('<ion-modal [isOpen]="x">')).toBeNull();
  });

  it('reads a method body past its own nested braces', () => {
    const body = readMethodBody('class X { run() { if (a) { b(); } c(); } after() { d(); } }', 'run');

    expect(body).toContain('c();');
    expect(body).not.toContain('d();');
  });
});

describe('inspectSharedPickerDismissal over a tree', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function fixture(files: Record<string, string>) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'optc-picker-dismissal-'));

    directories.push(root);

    for (const [name, content] of Object.entries(files)) {
      const filePath = path.join(root, name);

      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content, 'utf8');
    }

    return root;
  }

  it('counts pickers and passes a consistent tree', async () => {
    const sharedRoot = await fixture({
      'ship-picker/ship-picker.component.html': TEMPLATE,
      'ship-picker/ship-picker.component.ts': COMPONENT,
      'ability-filter-rail/ability-filter-rail.component.html': '<div class="rail"></div>',
    });
    const result = inspectSharedPickerDismissal({ sharedRoot });

    expect(result.pickerCount).toBe(1);
    expect(result.ok).toBe(true);
    expect(formatSharedPickerDismissalResult(result)).toContain('Status: passed');
  });

  it('names the picker that broke the contract', async () => {
    const sharedRoot = await fixture({
      'new-picker/new-picker.component.html': '<ion-modal [isOpen]="isOpen"></ion-modal>',
      'new-picker/new-picker.component.ts': 'export class NewPicker {}',
    });
    const report = formatSharedPickerDismissalResult(inspectSharedPickerDismissal({ sharedRoot }));

    expect(report).toContain('new-picker/new-picker.component.html');
    expect(report).toContain('picker-without-dismiss-binding');
  });
});
