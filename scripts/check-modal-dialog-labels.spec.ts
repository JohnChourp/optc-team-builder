import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  formatModalDialogLabelResult,
  inspectModalDialogLabels,
} from './check-modal-dialog-labels.mjs';
import {
  extractModalTags,
  handlerLabelsDialog,
  hasStaticAriaLabel,
  inspectModalLabels,
  readDidPresentHandler,
  readMethodBody,
} from './lib/modal-dialog-labels.mjs';

/**
 * 869f138q3. Each finding is proved by removing the one thing that named the dialog.
 *
 * The quiet cases are the load-bearing ones here: this guard's job is to fail on a new unlabelled
 * modal, and a guard that also fails on a correctly labelled one gets switched off.
 */

const LABELLED_TEMPLATE = `
<ion-modal
  #picker
  [isOpen]="isOpen"
  [attr.aria-label]="title"
  (didPresent)="labelModalDialog($event, title)"
>
  <ng-template><h2>{{ title }}</h2></ng-template>
</ion-modal>
`;

const COMPONENT = `
import { applyIonicModalDialogLabel } from '../a11y/ionic-modal-dialog-label.utils';

export class PickerComponent {
  public labelModalDialog(event: Event, label: string): void {
    applyIonicModalDialogLabel(event, label);
  }
}
`;

function inspect(template: string, source = COMPONENT) {
  return inspectModalLabels({ filePath: 'picker.html', template, source });
}

describe('modal tag reading', () => {
  it('reads one tag per modal and remembers its line', () => {
    const tags = extractModalTags(`<div>\n</div>\n${LABELLED_TEMPLATE}`);

    expect(tags).toHaveLength(1);
    expect(tags[0].line).toBe(4);
    expect(tags[0].text).toContain('(didPresent)');
  });

  it('does not end a tag on a > inside an attribute value', () => {
    const [tag] = extractModalTags('<ion-modal [isOpen]="a > b" aria-label="x"></ion-modal>');

    expect(tag.text).toContain('aria-label="x"');
  });

  it('reads the method a didPresent binding calls', () => {
    expect(readDidPresentHandler('<ion-modal (didPresent)="labelModalDialog($event, t)">')).toBe(
      'labelModalDialog',
    );
    expect(readDidPresentHandler('<ion-modal [isOpen]="x">')).toBeNull();
  });

  it('does not count an empty aria-label as a name', () => {
    expect(hasStaticAriaLabel('<ion-modal aria-label="">')).toBe(false);
    expect(hasStaticAriaLabel('<ion-modal aria-label="   ">')).toBe(false);
    expect(hasStaticAriaLabel('<ion-modal [attr.aria-label]="title">')).toBe(true);
  });

  it('reads a method body past its own nested braces', () => {
    const body = readMethodBody('class X { run() { if (a) { b(); } c(); } after() {} }', 'run');

    expect(body).toContain('c();');
    expect(body).not.toContain('after');
  });
});

describe('inspectModalLabels', () => {
  it('accepts a modal whose handler labels the dialog', () => {
    expect(inspect(LABELLED_TEMPLATE)).toEqual([]);
  });

  it('accepts a modal named only by a static aria-label', () => {
    expect(
      inspect('<ion-modal [attr.aria-label]="\'whatsNew.title\' | transloco"></ion-modal>', ''),
    ).toEqual([]);
  });

  it('fails a modal with no name at all', () => {
    const [finding] = inspect('<ion-modal [isOpen]="isOpen"></ion-modal>', '');

    expect(finding.kind).toBe('modal-without-label');
    expect(finding.line).toBe(1);
  });

  it('fails a modal whose handler does not reach the utility', () => {
    const [finding] = inspect(
      '<ion-modal (didPresent)="onPresent($event)"></ion-modal>',
      'export class X { onPresent(event: Event): void { this.focus(); } }',
    );

    expect(finding.kind).toBe('did-present-does-not-label');
    expect(finding.detail).toContain('onPresent()');
  });

  it('follows the handler one hop into a method that does label', () => {
    expect(
      inspect(
        '<ion-modal (didPresent)="onPresent($event)"></ion-modal>',
        `export class X {
          onPresent(event: Event): void { this.nameIt(event); }
          nameIt(event: Event): void { applyIonicModalDialogLabel(event, 'x'); }
        }`,
      ),
    ).toEqual([]);
  });

  it('does not follow it two hops, because a failure nobody can read is worse', () => {
    const [finding] = inspect(
      '<ion-modal (didPresent)="onPresent($event)"></ion-modal>',
      `export class X {
        onPresent(event: Event): void { this.first(event); }
        first(event: Event): void { this.second(event); }
        second(event: Event): void { applyIonicModalDialogLabel(event, 'x'); }
      }`,
    );

    expect(finding.kind).toBe('did-present-does-not-label');
  });

  it('reports every unlabelled modal in a file, not only the first', () => {
    const findings = inspect(
      '<ion-modal a></ion-modal>\n<ion-modal b></ion-modal>\n<ion-modal aria-label="x"></ion-modal>',
      '',
    );

    expect(findings).toHaveLength(2);
    expect(findings.map((finding) => finding.line)).toEqual([1, 2]);
  });

  it('accepts a handler that labels an already-presented modal', () => {
    expect(
      inspect(
        '<ion-modal (didPresent)="onPresent($event)"></ion-modal>',
        'export class X { onPresent(e: Event): void { applyIonicModalDialogLabelToElement(e.target as HTMLElement, "x"); } }',
      ),
    ).toEqual([]);
  });
});

describe('inspectModalDialogLabels over a source tree', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function fixture(files: Record<string, string>) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'optc-modal-labels-'));

    directories.push(root);

    for (const [name, content] of Object.entries(files)) {
      const filePath = path.join(root, name);

      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content, 'utf8');
    }

    return root;
  }

  it('passes a tree whose every modal is named', async () => {
    const sourceRoot = await fixture({
      'picker/picker.component.html': LABELLED_TEMPLATE,
      'picker/picker.component.ts': COMPONENT,
    });
    const result = inspectModalDialogLabels({ sourceRoot });

    expect(result.ok).toBe(true);
    expect(result.modalCount).toBe(1);
    expect(formatModalDialogLabelResult(result)).toContain('Status: passed');
  });

  it('reads a modal declared in an inline template', async () => {
    const sourceRoot = await fixture({
      'modal/inline.component.ts':
        '@Component({ template: `<ion-modal [isOpen]="open"></ion-modal>` })\nexport class X {}',
    });
    const result = inspectModalDialogLabels({ sourceRoot });

    expect(result.ok).toBe(false);
    expect(result.findings[0].kind).toBe('modal-without-label');
  });

  it('ignores a spec file that mentions a modal', async () => {
    const sourceRoot = await fixture({
      'picker/picker.component.spec.ts':
        'it("renders", () => { expect("<ion-modal></ion-modal>").toBeTruthy(); });',
    });

    expect(inspectModalDialogLabels({ sourceRoot }).modalCount).toBe(0);
  });

  it('names the file and line of an unlabelled modal', async () => {
    const sourceRoot = await fixture({
      'page/page.page.html': '<div>\n</div>\n<ion-modal [isOpen]="x"></ion-modal>',
      'page/page.page.ts': 'export class P {}',
    });
    const report = formatModalDialogLabelResult(inspectModalDialogLabels({ sourceRoot }));

    expect(report).toContain('page/page.page.html:3');
  });
});
