import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  formatAccessibleNameResult,
  inspectIonicAccessibleNames,
} from './check-ionic-accessible-names.mjs';
import { ACCESSIBLE_NAME_RULES, inspectAccessibleNames } from './lib/ionic-accessible-names.mjs';

/**
 * 869f13gaw / 869f13gbk. Every assertion here is paired with the version of the same markup that
 * must stay quiet, because a guard that also fails on correct code gets switched off.
 *
 * The false positive that shaped rule B is kept as its own case: `manual-team-builder` builds its
 * label FROM the derived value, which is a correct fix and must never be flagged.
 */

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function sourceTreeWith(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'accessible-names-'));

  temporaryRoots.push(root);

  for (const [relativePath, contents] of Object.entries(files)) {
    const target = path.join(root, relativePath);

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents, 'utf8');
  }

  return root;
}

describe('rule B - a static label over a derived body', () => {
  it('flags a control whose static label hides the value the screen shows', () => {
    const findings = inspectAccessibleNames({
      filePath: 'trigger.html',
      template: `
        <ion-button [attr.aria-label]="t('filters.characterTags.label')">
          {{ characterTagFilterTriggerLabel() }}
        </ion-button>
      `,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('static-label');
    expect(findings[0]?.detail).toContain('characterTagFilterTriggerLabel()');
  });

  it('stays quiet once the label is dropped and the content names the control', () => {
    expect(
      inspectAccessibleNames({
        filePath: 'trigger.html',
        template: `
          <ion-button>
            <span class="visually-hidden">{{ t('filters.characterTags.label') }}: </span>
            {{ characterTagFilterTriggerLabel() }}
          </ion-button>
        `,
      }),
    ).toEqual([]);
  });

  it('stays quiet when the label is built FROM the derived value', () => {
    // The first false positive this check produced. manual-team-builder ships exactly this.
    expect(
      inspectAccessibleNames({
        filePath: 'manual.html',
        template: `
          <ion-button
            [attr.aria-label]="t('picker.filters.characterTags.trigger', { summary: characterTagFilterLabel() })"
          >
            {{ characterTagFilterLabel() }}
          </ion-button>
        `,
      }),
    ).toEqual([]);
  });

  it('stays quiet when the body is only a translation lookup, which the label duplicates', () => {
    expect(
      inspectAccessibleNames({
        filePath: 'plain.html',
        template: `
          <ion-button [attr.aria-label]="t('actions.clear')">{{ t('actions.clear') }}</ion-button>
        `,
      }),
    ).toEqual([]);
  });

  it('stays quiet when a derived body carries no label at all, because content names it', () => {
    expect(
      inspectAccessibleNames({
        filePath: 'unlabelled.html',
        template: '<ion-button>{{ buildButtonLabel() }}</ion-button>',
      }),
    ).toEqual([]);
  });
});

describe('rule A - aria-describedby on an Ionic control', () => {
  it('flags it, because Ionic moves it into the shadow root where its IDREF cannot resolve', () => {
    const findings = inspectAccessibleNames({
      filePath: 'described.html',
      template: '<ion-button [attr.aria-describedby]="descriptionId">{{ label() }}</ion-button>',
    });

    expect(findings.map((finding) => finding.rule)).toContain('describedby');
  });

  it('flags the plain attribute form too', () => {
    const findings = inspectAccessibleNames({
      filePath: 'described.html',
      template: '<ion-chip aria-describedby="tier-help">{{ tierLabel() }}</ion-chip>',
    });

    expect(findings.map((finding) => finding.rule)).toContain('describedby');
  });

  it('leaves a native button alone, which has no shadow root to lose the reference in', () => {
    expect(
      inspectAccessibleNames({
        filePath: 'native.html',
        template: '<button aria-describedby="help">{{ label() }}</button><span id="help">x</span>',
      }),
    ).toEqual([]);
  });
});

describe('the walk', () => {
  it('reads inline templates, not only .html - the gap #595 repaired in a sibling checker', async () => {
    const root = await sourceTreeWith({
      'inline/thing.component.ts': [
        '@Component({',
        "  template: `<ion-button [attr.aria-label]=\"t('x')\">{{ derived() }}</ion-button>`,",
        '})',
        'export class ThingComponent {}',
      ].join('\n'),
    });

    const result = inspectIonicAccessibleNames({ sourceRoot: root });

    expect(result.templateCount).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.findings[0]?.rule).toBe('static-label');
  });

  it('skips spec files so a fixture in a test cannot fail the lane', async () => {
    const root = await sourceTreeWith({
      'thing.component.spec.ts': "const t = `<ion-button [attr.aria-label]=\"t('x')\">{{ derived() }}</ion-button>`;",
    });

    expect(inspectIonicAccessibleNames({ sourceRoot: root })).toMatchObject({ ok: true, templateCount: 0 });
  });

  it('reports a non-zero exit intent and names every finding', async () => {
    const root = await sourceTreeWith({
      'a.html': "<ion-button [attr.aria-label]=\"t('x')\">{{ derived() }}</ion-button>",
      'b.html': '<ion-chip aria-describedby="z">{{ other() }}</ion-chip>',
    });

    const result = inspectIonicAccessibleNames({ sourceRoot: root });

    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(2);

    const report = formatAccessibleNameResult(result);

    expect(report).toContain('Status: FAILED');
    expect(report).toContain('a.html');
    expect(report).toContain('b.html');
  });

  it('passes on a tree with nothing to say, and says what it checked', async () => {
    const root = await sourceTreeWith({ 'ok.html': '<ion-button>{{ t(\'actions.clear\') }}</ion-button>' });
    const result = inspectIonicAccessibleNames({ sourceRoot: root });

    expect(result).toMatchObject({ ok: true, templateCount: 1 });
    expect(formatAccessibleNameResult(result)).toContain('Status: passed');
  });
});

it('names both rules', () => {
  expect([...ACCESSIBLE_NAME_RULES]).toEqual(['describedby', 'static-label']);
});
