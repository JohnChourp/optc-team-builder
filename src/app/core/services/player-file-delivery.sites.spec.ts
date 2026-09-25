import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/*
 * 869f63gqg. Every export in the Android app did nothing, and it was the same defect eleven
 * times: each site built its own `<a download>` link, which the Android WebView drops. The fix
 * is one helper with a native path, so the defect comes back the moment a twelfth export
 * builds its own link again - and on the website that export would look perfectly fine.
 *
 * So this reads the app's source and fails when an element's `download` is set anywhere but
 * the helper. It reads SYNTAX, not words: a comment that explains the old mechanism, the i18n
 * key `appUpdate.confirm.download` and the in-app updater's `download({...})` call all contain
 * the word and are none of them a download link. The detector is tested on those shapes below,
 * so a green run means the search was pointed at the right thing.
 *
 * Scope: shipped code - every non-spec `.ts` and `.html` under `src/app`, inline component
 * templates included, and not `src/app/testing/`, which holds test helpers only.
 */

const HELPER = 'src/app/core/services/player-file-delivery.utils.ts';

/** The eleven export sites of 869f63gqg. Each one must hand its file to the helper. */
const EXPORT_SITES = [
  'src/app/pages/auto-team-builder-rumble/auto-team-builder-rumble-export.utils.ts',
  'src/app/pages/auto-team-builder/auto-team-builder-export.utils.ts',
  'src/app/pages/auto-team-builder/auto-team-builder.page.ts',
  'src/app/pages/character-boxes/character-boxes-transfer.utils.ts',
  'src/app/pages/character-detail/character-overrides-transfer.utils.ts',
  'src/app/pages/characters/characters-favorites.utils.ts',
  'src/app/pages/saved-enemies/saved-enemies-transfer.utils.ts',
  'src/app/pages/saved-teams/saved-teams-export.utils.ts',
  'src/app/pages/settings/all-data-transfer.utils.ts',
  'src/app/pages/settings/favorite-ships-transfer.utils.ts',
  'src/app/pages/settings/settings.page.ts',
] as const;

function shippedFiles(extension: '.html' | '.ts'): string[] {
  return (readdirSync(resolve(process.cwd(), 'src/app'), { recursive: true }) as string[])
    .map((entry) => `src/app/${entry.replaceAll('\\', '/')}`)
    .filter(
      (file) =>
        file.endsWith(extension) &&
        !file.endsWith('.spec.ts') &&
        !file.startsWith('src/app/testing/'),
    )
    .sort();
}

function read(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8');
}

function isDownloadName(node: ts.Node): boolean {
  return (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text === 'download';
}

/**
 * Every place a script sets an element's `download`: `x.download = ...`, `x['download'] = ...`
 * and `x.setAttribute('download', ...)`. Comments and strings are not code, so they never match.
 */
function countScriptDownloadSetters(source: string, fileName = 'source.ts'): number {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  let count = 0;

  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const target = node.left;

      if (
        (ts.isPropertyAccessExpression(target) && target.name.text === 'download') ||
        (ts.isElementAccessExpression(target) && isDownloadName(target.argumentExpression))
      ) {
        count += 1;
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'setAttribute' &&
      node.arguments[0] !== undefined &&
      isDownloadName(node.arguments[0])
    ) {
      count += 1;
    }

    ts.forEachChild(node, visit);
  };

  visit(file);

  return count;
}

/**
 * `download`, `[download]` or `[attr.download]` on any element, outside HTML comments.
 *
 * Attribute VALUES are blanked before names are read, so `title="a download"` or
 * `(click)="download()"` is not an attribute called download - and a `>` inside a value
 * does not end the tag early.
 */
function countTemplateDownloadAttributes(template: string): number {
  const markup = template.replace(/<!--[\s\S]*?-->/gu, '');
  let count = 0;

  for (const [, attributes = ''] of markup.matchAll(/<[a-zA-Z][\w-]*((?:[^>"']|"[^"]*"|'[^']*')*)>/gu)) {
    const names = attributes.replace(/"[^"]*"|'[^']*'/gu, '""');

    count += [...names.matchAll(/(?:^|\s)(?:download|\[download\]|\[attr\.download\])(?=[\s=/>]|$)/gu)]
      .length;
  }

  return count;
}

/** The text of every `template:` a component declares inline. */
function inlineTemplates(source: string, fileName: string): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const templates: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'template' &&
      (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))
    ) {
      templates.push(node.initializer.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(file);

  return templates;
}

function callsGivePlayerFile(source: string, fileName: string): boolean {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  let found = false;

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'givePlayerFile') {
      found = true;
    }

    ts.forEachChild(node, visit);
  };

  visit(file);

  return found;
}

describe('the detector reads syntax, not the word', () => {
  it('finds every spelling of setting a download on an element', () => {
    expect(countScriptDownloadSetters("anchor.download = 'x.json';")).toBe(1);
    expect(countScriptDownloadSetters("link['download'] = name;")).toBe(1);
    expect(countScriptDownloadSetters("element.setAttribute('download', name);")).toBe(1);
    expect(countScriptDownloadSetters('a.download = b.download = name;')).toBe(2);
  });

  it('ignores the word where it is not a download link', () => {
    expect(countScriptDownloadSetters('// anchor.download = filename;')).toBe(0);
    expect(countScriptDownloadSetters('/* anchor.download = filename; */')).toBe(0);
    expect(countScriptDownloadSetters("const key = 'appUpdate.confirm.download';")).toBe(0);
    expect(countScriptDownloadSetters('await this.apkUpdater.download({ url });')).toBe(0);
    expect(countScriptDownloadSetters('const download = true;')).toBe(0);
    expect(countScriptDownloadSetters('progress.downloadedBytes = 3;')).toBe(0);
    expect(countScriptDownloadSetters("if (anchor.download === 'x') {}")).toBe(0);
  });

  it('finds a download attribute or binding in a template, and nothing in a comment or text', () => {
    expect(countTemplateDownloadAttributes('<a href="x" download>Save</a>')).toBe(1);
    expect(countTemplateDownloadAttributes('<a download="x.json" href="x">')).toBe(1);
    expect(countTemplateDownloadAttributes('<a [download]="name" [href]="url">')).toBe(1);
    expect(countTemplateDownloadAttributes('<a\n  [attr.download]="name"\n>')).toBe(1);
    expect(countTemplateDownloadAttributes('<!-- <a download> -->')).toBe(0);
    expect(countTemplateDownloadAttributes('<p>A spinner for a multi-megabyte download</p>')).toBe(0);
    expect(countTemplateDownloadAttributes('<ion-button (click)="downloadTeamJson()">')).toBe(0);
    expect(countTemplateDownloadAttributes('<span class="download-size">')).toBe(0);
    expect(countTemplateDownloadAttributes('<p title="Save the download here">')).toBe(0);
    expect(countTemplateDownloadAttributes('<ion-button (click)="download()">')).toBe(0);
    expect(countTemplateDownloadAttributes('<a [class.on]="a > b" download>')).toBe(1);
  });
});

describe('every file the app gives the player goes through givePlayerFile', () => {
  const scripts = shippedFiles('.ts');
  const templates = shippedFiles('.html');

  it('reads the whole app, so nothing below passes vacuously', () => {
    expect(scripts.length).toBeGreaterThan(200);
    expect(templates.length).toBeGreaterThan(30);
    expect(scripts).toContain(HELPER);
  });

  it('sets an element download in exactly one place: the helper', () => {
    const setters = scripts
      .map((file) => [file, countScriptDownloadSetters(read(file), file)] as const)
      .filter(([, count]) => count > 0);

    // The helper's own anchor is the positive control: a detector that found nothing at all
    // would pass the "nowhere else" half of this for free.
    expect(setters).toEqual([[HELPER, 1]]);
  });

  it('gives no element a download attribute in any template, inline ones included', () => {
    const inline = scripts.flatMap((file) =>
      inlineTemplates(read(file), file).map((template) => [file, template] as const),
    );
    const offenders = [
      ...templates.map((file) => [file, read(file)] as const),
      ...inline,
    ]
      .filter(([, template]) => countTemplateDownloadAttributes(template) > 0)
      .map(([file]) => file);

    // Guarded: AppComponent's shell template is inline, so a parse that found none has missed it.
    expect(inline.map(([file]) => file)).toContain('src/app/app.component.ts');
    expect(offenders).toEqual([]);
  });

  it.each(EXPORT_SITES)('%s hands its file to givePlayerFile', (site) => {
    expect(existsSync(resolve(process.cwd(), site)), `${site} no longer exists`).toBe(true);
    expect(callsGivePlayerFile(read(site), site)).toBe(true);
  });
});
