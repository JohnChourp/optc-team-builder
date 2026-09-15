#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

/**
 * A public class member nobody reads.
 *
 * 869f135rm. The `dead-code` lane is
 * `tsc --noEmit --noUnusedLocals --noUnusedParameters`. Those two flags see
 * unused LOCALS and PARAMETERS. They say nothing about a public field or method
 * that no template, no service and no other file ever touches - which is exactly
 * what both dead things found on 2026-09-12 were: `regionAvailability`, parsed on
 * every character read with zero non-spec consumers, and `recentCharacterIds`,
 * written on every character-detail load and read by nothing. The lane ran green
 * through both, and it is named `dead-code`.
 *
 * The recorded remedy was wrong, and that is why this file exists rather than a
 * one-line npm script. Both `docs/linting-position.md` and the `dead-code` entry
 * in `scripts/ci-check-routing.mjs` stated that knip finds unused public class
 * members and was merely too noisy to gate on. **knip 6.35.1 cannot find them at
 * all.** `classMembers` was an issue type in knip 5 and was removed in 6: it is
 * absent from the binary, absent from `schema.json`, and `--include classMembers`
 * exits with `Invalid issue type`. Measured 2026-09-15 by adding a used class
 * with two dead public members: `dead-code:check` stayed green (expected) and
 * `npx knip --include files,exports,types` named the unused *export* used to wire
 * the probe in while naming neither dead member (not expected, and the opposite of
 * what two files claimed). So the defect class had no tool, not a noisy one.
 *
 * What this reports, and what it deliberately does not:
 *
 *   A. `orphan`    - a public member with no reference anywhere, including specs.
 *   B. `spec-only` - a public member whose only reader is a `.spec.ts`. This is
 *                    the `regionAvailability` shape and the reason the check
 *                    counts spec files separately instead of ignoring them.
 *
 * It does NOT report write-only members - a field assigned everywhere and read
 * nowhere, which is the `recentCharacterIds` shape. Distinguishing a read from a
 * write through signals, `patchState`-style helpers and template bindings needs
 * real dataflow, and a check that guesses at it would be the third thing in this
 * repository to run green while claiming to cover something it does not. It is
 * recorded here as a known gap rather than half-implemented.
 *
 * Unrendered is not dead. This repository has already mistaken four deliberate
 * test probes for dead code, so a finding here is an OPEN QUESTION and never an
 * automatic delete. `scripts/data/unused-public-members-register.json` carries
 * every known finding with its kind and what would remove it, and the check fails
 * when:
 *
 *   C. a finding is not in the register - something new went dead;
 *   D. a register entry is no longer a finding - it was fixed or deleted and the
 *      entry must go, so the register can only shrink.
 *
 * Framework-called members are excluded rather than registered, because they are
 * not findings: Angular lifecycle hooks, members carrying a framework decorator
 * (`@Input`, `@Output`, `@ViewChild`, `@HostListener`, ...), and any member that
 * satisfies a member of an interface the class `implements` or a class it
 * `extends`. That last one needs the type checker, which is why this builds a real
 * program instead of parsing files one at a time: `TranslocoHttpLoader
 * .getTranslation` has no caller in this repository and is not dead - Transloco
 * calls it through `TranslocoLoader`.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const REGISTER_PATH = path.join(HERE, 'data', 'unused-public-members-register.json');
const TSCONFIG_PATH = path.join(REPO_ROOT, 'tsconfig.app.json');

/**
 * Angular, Ionic and Angular-forms entry points. Every one of these is called by
 * the framework and by nothing in this repository, so an absent caller proves
 * nothing about them.
 */
const FRAMEWORK_CALLED_NAMES = new Set([
  'ngOnInit',
  'ngOnDestroy',
  'ngOnChanges',
  'ngDoCheck',
  'ngAfterViewInit',
  'ngAfterViewChecked',
  'ngAfterContentInit',
  'ngAfterContentChecked',
  'ngDoBootstrap',
  'ionViewWillEnter',
  'ionViewDidEnter',
  'ionViewWillLeave',
  'ionViewDidLeave',
  'writeValue',
  'registerOnChange',
  'registerOnTouched',
  'setDisabledState',
]);

const FRAMEWORK_DECORATOR_NAMES = new Set([
  'Input',
  'Output',
  'ViewChild',
  'ViewChildren',
  'ContentChild',
  'ContentChildren',
  'HostListener',
  'HostBinding',
]);

function parseArgs(argv) {
  const args = { json: false };
  for (const arg of argv) {
    if (arg === '--json') {
      args.json = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function collectFiles(dir, predicate, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, predicate, out);
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function isSpecFile(file) {
  return file.endsWith('.spec.ts');
}

function isProductionSource(file) {
  return file.endsWith('.ts') && !isSpecFile(file) && !file.endsWith('.d.ts');
}

/**
 * Every member name reachable through the class's heritage clauses. A member that
 * appears here is called by whatever owns that contract, not by this repository.
 */
function collectHeritageMemberNames(node, checker) {
  const names = new Set();
  for (const clause of node.heritageClauses ?? []) {
    for (const typeNode of clause.types) {
      const type = checker.getTypeAtLocation(typeNode);
      for (const symbol of checker.getPropertiesOfType(type)) {
        names.add(symbol.getName());
      }
    }
  }
  return names;
}

export function collectPublicMembers(program, sourceFiles) {
  const checker = program.getTypeChecker();
  const members = [];

  for (const sourceFile of sourceFiles) {
    const visit = (node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        const heritageNames = collectHeritageMemberNames(node, checker);

        for (const member of node.members) {
          const isMemberKind =
            ts.isPropertyDeclaration(member) ||
            ts.isMethodDeclaration(member) ||
            ts.isGetAccessor(member) ||
            ts.isSetAccessor(member);
          if (!isMemberKind) {
            continue;
          }
          if (!member.name || !ts.isIdentifier(member.name)) {
            continue;
          }

          const modifierKinds = (ts.getModifiers(member) ?? []).map((modifier) => modifier.kind);
          if (
            modifierKinds.includes(ts.SyntaxKind.PrivateKeyword) ||
            modifierKinds.includes(ts.SyntaxKind.ProtectedKeyword)
          ) {
            continue;
          }

          const decoratorNames = (ts.getDecorators(member) ?? []).map((decorator) => {
            const expression = decorator.expression;
            const identifier = ts.isCallExpression(expression) ? expression.expression : expression;
            return ts.isIdentifier(identifier) ? identifier.text : '';
          });
          if (decoratorNames.some((name) => FRAMEWORK_DECORATOR_NAMES.has(name))) {
            continue;
          }

          const name = member.name.text;
          if (FRAMEWORK_CALLED_NAMES.has(name) || heritageNames.has(name)) {
            continue;
          }

          members.push({
            file: path.relative(REPO_ROOT, sourceFile.fileName),
            className: node.name.text,
            member: name,
            line: sourceFile.getLineAndCharacterOfPosition(member.getStart(sourceFile)).line + 1,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return members;
}

/**
 * A reference is any word-boundary occurrence outside the declaring file, plus any
 * second occurrence inside it. Deliberately textual: an Angular template is not
 * part of the TypeScript program, and a member used only by `page.html` is used.
 */
export function findUnusedMembers(members, { productionText, specText, templateText }) {
  const findings = [];

  for (const entry of members) {
    const pattern = new RegExp(`\\b${entry.member}\\b`);

    let usedInTemplate = false;
    for (const text of templateText.values()) {
      if (pattern.test(text)) {
        usedInTemplate = true;
        break;
      }
    }
    if (usedInTemplate) {
      continue;
    }

    let usedInProduction = false;
    for (const [file, text] of productionText) {
      if (file === entry.file) {
        const own = text.match(new RegExp(`\\b${entry.member}\\b`, 'g')) ?? [];
        if (own.length > 1) {
          usedInProduction = true;
          break;
        }
        continue;
      }
      if (pattern.test(text)) {
        usedInProduction = true;
        break;
      }
    }
    if (usedInProduction) {
      continue;
    }

    let usedInSpec = false;
    for (const text of specText.values()) {
      if (pattern.test(text)) {
        usedInSpec = true;
        break;
      }
    }

    findings.push({ ...entry, kind: usedInSpec ? 'spec-only' : 'orphan' });
  }

  return findings;
}

export function compareWithRegister(findings, register) {
  const findingKeys = new Map(findings.map((f) => [`${f.file}::${f.className}.${f.member}`, f]));
  const registerKeys = new Map(
    register.entries.map((entry) => [`${entry.file}::${entry.member}`, entry]),
  );

  const unregistered = [];
  for (const [key, finding] of findingKeys) {
    if (!registerKeys.has(key)) {
      unregistered.push(finding);
    }
  }

  const stale = [];
  for (const [key, entry] of registerKeys) {
    if (!findingKeys.has(key)) {
      stale.push(entry);
    }
  }

  const kindDrift = [];
  for (const [key, finding] of findingKeys) {
    const entry = registerKeys.get(key);
    if (entry && entry.kind !== 'intentional' && entry.kind !== finding.kind) {
      kindDrift.push({ finding, declaredKind: entry.kind });
    }
  }

  return { unregistered, stale, kindDrift };
}

export function loadRegister(file = REGISTER_PATH) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function buildProgram() {
  const configFile = ts.readConfigFile(TSCONFIG_PATH, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, REPO_ROOT);
  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
}

export function run({ json = false } = {}) {
  const srcRoot = path.join(REPO_ROOT, 'src');
  const allFiles = collectFiles(srcRoot, () => true);
  const productionFiles = allFiles.filter(isProductionSource);
  const specFiles = allFiles.filter(isSpecFile);
  const templateFiles = allFiles.filter((file) => file.endsWith('.html'));

  const program = buildProgram();
  const productionSet = new Set(productionFiles.map((file) => path.resolve(file)));
  const sourceFiles = program
    .getSourceFiles()
    .filter((sourceFile) => productionSet.has(path.resolve(sourceFile.fileName)));

  const members = collectPublicMembers(program, sourceFiles);

  const toTextMap = (files) =>
    new Map(files.map((file) => [path.relative(REPO_ROOT, file), readFileSync(file, 'utf8')]));

  const findings = findUnusedMembers(members, {
    productionText: toTextMap(productionFiles),
    specText: toTextMap(specFiles),
    templateText: toTextMap(templateFiles),
  });

  const register = loadRegister();
  const { unregistered, stale, kindDrift } = compareWithRegister(findings, register);

  if (json) {
    process.stdout.write(`${JSON.stringify({ findings, unregistered, stale, kindDrift }, null, 2)}\n`);
  }

  const problems = [];

  if (unregistered.length > 0) {
    problems.push(
      `${unregistered.length} public member(s) have no reader and are not in the register.\n` +
        `A finding is an open question, not an automatic delete. Either give the member the\n` +
        `reader it was written for, delete it with its spec, or add it to\n` +
        `scripts/data/unused-public-members-register.json with what would remove the entry.\n` +
        unregistered
          .map((f) => `  ${f.file}:${f.line}  ${f.className}.${f.member}  [${f.kind}]`)
          .join('\n'),
    );
  }

  if (stale.length > 0) {
    problems.push(
      `${stale.length} register entr(ies) no longer describe a finding. Remove them - the\n` +
        `register is only allowed to shrink.\n` +
        stale.map((entry) => `  ${entry.file}  ${entry.member}`).join('\n'),
    );
  }

  if (kindDrift.length > 0) {
    problems.push(
      `${kindDrift.length} register entr(ies) declare the wrong kind.\n` +
        kindDrift
          .map(
            ({ finding, declaredKind }) =>
              `  ${finding.file}  ${finding.className}.${finding.member}: register says ${declaredKind}, measured ${finding.kind}`,
          )
          .join('\n'),
    );
  }

  return {
    ok: problems.length === 0,
    problems,
    counts: {
      inspected: members.length,
      findings: findings.length,
      registered: register.entries.length,
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = run(args);

  if (!result.ok) {
    for (const problem of result.problems) {
      process.stderr.write(`${problem}\n\n`);
    }
    process.stderr.write('FAIL unused public members\n');
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `OK unused public members: ${result.counts.inspected} inspected, ` +
      `${result.counts.findings} known finding(s), all registered.\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
