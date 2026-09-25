/**
 * Which `app-config.js` each build gets: every key the writer emits and, for every build that
 * writes one, where that key comes from.
 *
 * 869f63gu4. Each build writes its own `public/app-config.js` with `scripts/write-app-config.mjs`,
 * from whatever environment its workflow step provides, and nothing recorded which build ends up
 * with which key. Measured 2026-09-23, emptiness only: the live website carried the web client id,
 * the GA4 id and the Drive folder name, and the published APK carried only the folder name - no
 * sign-in, no Drive sync, no analytics - while `docs/release-secrets-register.md` listed each
 * secret's consumers and said nothing about the difference.
 *
 * Everything except the list of builds is DERIVED:
 *   - the keys, the variable each is read from, and the writer's gates, from the writer's SYNTAX;
 *   - what a key holds when no step supplies it, by RUNNING the writer on a copy with none of its
 *     variables set - the measure-a-fixture idiom of the release contract's version half;
 *   - which variables each build step supplies, and from which secret, from the workflow YAML;
 *   - which gate each build runs the writer with, from the npm script chain in package.json.
 *
 * The builds are declared because "this step builds the APK" is written nowhere a parser can
 * read. The guard keeps the list honest in both directions: a declared step that moved fails, and
 * a workflow that names one of the writer's variables anywhere except a declared step's own
 * `env:` fails - so a new build cannot start carrying a key without a row here.
 *
 * Never a value. A cell names the secret a key comes from, or says the key is empty or holds the
 * writer's default. No value - supplied, default or fallback - is copied into the record.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import ts from 'typescript';
import { parse as parseYaml } from 'yaml';

export const WRITER_PATH = 'scripts/write-app-config.mjs';
const WORKFLOWS_DIR = '.github/workflows';

export const SECTION_START = '<!-- generated:app-config-targets start -->';
export const SECTION_END = '<!-- generated:app-config-targets end -->';

/**
 * Every build that writes an `app-config.js` from a workflow's environment. `buildScript` is the
 * npm script the step builds with; the guard checks the step still invokes it.
 */
export const APP_CONFIG_BUILD_TARGETS = Object.freeze([
  {
    id: 'website',
    label: 'Website',
    what: 'optcteambuilder.com - built on every push to main and again by every release',
    reachesPlayers: true,
    buildScript: 'build:pages',
    steps: [
      { workflow: '.github/workflows/deploy-pages.yml', job: 'build', step: 'Build GitHub Pages artifact' },
      { workflow: '.github/workflows/release-android.yml', job: 'deploy-pages', step: 'Build GitHub Pages artifact' },
    ],
  },
  {
    id: 'apk',
    label: 'APK',
    what: 'the signed APK attached to each GitHub Release',
    reachesPlayers: true,
    buildScript: 'build:ionic',
    steps: [{ workflow: '.github/workflows/release-android.yml', job: 'release', step: 'Run Android release' }],
  },
  {
    id: 'guide-discoverability',
    label: 'Guide discoverability build',
    what: 'a verification build, checked and discarded',
    reachesPlayers: false,
    buildScript: 'build:pages',
    steps: [{ workflow: '.github/workflows/guide-discoverability.yml', job: 'verify', step: 'Build GitHub Pages artifact' }],
  },
  {
    id: 'pwa-cache-freshness',
    label: 'PWA cache-freshness build',
    what: 'a verification build, checked and discarded',
    reachesPlayers: false,
    buildScript: 'build:pages',
    steps: [{ workflow: '.github/workflows/deploy-pages.yml', job: 'cache-freshness', step: 'Verify PWA cache freshness' }],
  },
]);

const NOT_SUPPLIED_EMPTY = 'nothing - empty';
const NOT_SUPPLIED_DEFAULT = "nothing - the writer's default";

function collect(root, pick) {
  const found = [];
  const visit = (node) => {
    const value = pick(node);

    if (value !== null && value !== undefined) {
      found.push(value);
    }

    ts.forEachChild(node, visit);
  };

  visit(root);

  return found;
}

function isProcessEnv(node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === 'env' &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'process'
  );
}

/** `process.env["X"]` and `process.env.X` name the variable X; anything else names none. */
function readEnvVariable(node) {
  if (
    ts.isElementAccessExpression(node) &&
    isProcessEnv(node.expression) &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    return node.argumentExpression.text;
  }

  if (ts.isPropertyAccessExpression(node) && isProcessEnv(node.expression)) {
    return node.name.text;
  }

  return null;
}

/**
 * The writer's keys, the variable each is read from, and its gates - read from its syntax, so a
 * comment that quotes `process.env["APP_X"]` is not a variable it reads.
 */
export function parseWriter(source) {
  const file = ts.createSourceFile(WRITER_PATH, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const keys = [];

  // `const googleWebClientId = normalizeGoogleClientId(process.env["APP_GOOGLE_WEB_CLIENT_ID"]);`
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;

    for (const declaration of statement.declarationList.declarations) {
      const initializer = declaration.initializer;

      if (
        !ts.isIdentifier(declaration.name) ||
        !initializer ||
        !ts.isCallExpression(initializer) ||
        initializer.arguments.length !== 1
      ) {
        continue;
      }

      const variable = readEnvVariable(initializer.arguments[0]);

      if (variable) {
        keys.push({ key: declaration.name.text, variable });
      }
    }
  }

  /*
   * `requireGoogleWebClientId: argv.includes("--require-google-web-client-id") || parseBooleanEnv(process.env["APP_REQUIRE_GOOGLE_WEB_CLIENT_ID"])`.
   * A `requireX:` that reads neither a flag nor a variable only passes the answer along
   * (`requireX: requiredFlags.requireX`), so it is not a gate.
   */
  const gates = collect(file, (node) => {
    if (!ts.isPropertyAssignment(node) || !ts.isIdentifier(node.name) || !/^require[A-Z]/u.test(node.name.text)) {
      return null;
    }

    const name = node.name.text.slice('require'.length);
    const flags = collect(node.initializer, (child) =>
      ts.isCallExpression(child) &&
      ts.isPropertyAccessExpression(child.expression) &&
      child.expression.name.text === 'includes' &&
      child.arguments.length === 1 &&
      ts.isStringLiteralLike(child.arguments[0]) &&
      child.arguments[0].text.startsWith('--')
        ? child.arguments[0].text
        : null,
    );
    const variables = collect(node.initializer, readEnvVariable);

    return flags.length === 0 && variables.length === 0
      ? null
      : { key: `${name[0].toLowerCase()}${name.slice(1)}`, flags, variables };
  });

  return {
    keys: keys.sort((a, b) => a.key.localeCompare(b.key)),
    gates: gates.sort((a, b) => a.key.localeCompare(b.key)),
    variables: [...new Set(collect(file, readEnvVariable))].sort(),
  };
}

/**
 * What each key holds when no step supplies anything. The writer is RUN on a copy, with none of
 * its variables set and no `.env` beside it, and each value is reduced to empty or not on the spot.
 * The real `public/app-config.js` is never touched.
 */
export function measureUnsupplied(root, variables) {
  const work = mkdtempSync(path.join(os.tmpdir(), 'optc-app-config-targets-'));

  try {
    const copy = path.join(work, WRITER_PATH);
    mkdirSync(path.dirname(copy), { recursive: true });
    cpSync(path.join(root, WRITER_PATH), copy);

    const env = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.startsWith('APP_') && !variables.includes(name)),
    );

    execFileSync(process.execPath, [copy], { cwd: work, env, stdio: 'pipe' });

    const written = readFileSync(path.join(work, 'public/app-config.js'), 'utf8');
    const match = written.match(/window\.__appConfig\s*=\s*(\{[\s\S]*\})\s*;/u);

    if (!match) {
      throw new Error(`${WRITER_PATH} wrote no \`window.__appConfig = { ... };\` assignment.`);
    }

    return Object.fromEntries(
      Object.entries(JSON.parse(match[1]))
        .map(([key, value]) => [key, value === '' || value === null || value === undefined ? 'empty' : 'default'])
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export function readWorkflows(root) {
  const dir = path.join(root, WORKFLOWS_DIR);

  return readdirSync(dir)
    .filter((name) => /\.ya?ml$/u.test(name))
    .sort()
    .map((name) => ({
      file: `${WORKFLOWS_DIR}/${name}`,
      workflow: parseYaml(readFileSync(path.join(dir, name), 'utf8')),
    }));
}

/** Where a step's `env:` entry comes from - named, never quoted. */
export function describeSupply(raw) {
  const text = String(raw ?? '').trim();
  const expression = text.match(/^\$\{\{\s*([\s\S]*?)\s*\}\}$/u)?.[1];

  if (expression !== undefined) {
    const secret = expression.match(/^secrets\.([A-Za-z_]\w*)(\s*\|\|[\s\S]+)?$/u);

    if (secret) {
      return secret[2] ? `secret ${secret[1]}, else a fallback written in the workflow` : `secret ${secret[1]}`;
    }

    const variable = expression.match(/^vars\.([A-Za-z_]\w*)$/u);

    return variable ? `configuration variable ${variable[1]}` : 'an expression in the workflow';
  }

  if (text.includes('${{')) {
    return 'an expression in the workflow';
  }

  return text.length > 0 ? 'a value written in the workflow' : 'an empty value in the workflow';
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * Whether a step builds with `script`: `npm run <script>` in its `run:` or in an `env:` value
 * (`BUILD_MOBILE_COMMAND`), or an `env:` value that IS the script name (`PWA_SHELL_BUILD_SCRIPT`).
 * Bounded both sides, so `build:pages` does not match `build:pages-preview`.
 */
export function stepInvokesScript(step, script) {
  const texts = [step.run, ...Object.values(step.env ?? {})].filter((text) => typeof text === 'string');
  const npmRun = new RegExp(`(?:^|[\\s;&|(])npm run ${escapeRegExp(script)}(?=$|[\\s;&|)])`, 'mu');

  return texts.some((text) => npmRun.test(text) || text.trim() === script);
}

/**
 * The places `script` runs the writer, following `npm run` through package.json. Each is the npm
 * script that holds the `node ./scripts/write-app-config.mjs` call, and the flags it passes.
 */
export function resolveWriterRuns(scripts, script, seen = new Set()) {
  if (seen.has(script) || typeof scripts[script] !== 'string') return [];

  seen.add(script);

  const runs = [];

  for (const part of scripts[script].split(/&&|\|\||;/u).map((segment) => segment.trim())) {
    const writer = part.match(/^node\s+(?:\.\/)?scripts\/write-app-config\.mjs((?:\s+--[a-z0-9-]+)*)$/u);

    if (writer) {
      runs.push({ script, flags: writer[1].split(/\s+/u).filter(Boolean) });
      continue;
    }

    const npmRun = part.match(/^npm run ([\w:.-]+)(?:\s|$)/u);

    if (npmRun) {
      runs.push(...resolveWriterRuns(scripts, npmRun[1], seen));
    }
  }

  return runs;
}

function environmentOf(job) {
  if (typeof job?.environment === 'string') return job.environment;

  return job?.environment?.name ?? null;
}

function describeStep(declared) {
  return `${declared.workflow} > ${declared.job} > "${declared.step}"`;
}

function* walkStrings(value, trail) {
  if (typeof value === 'string') {
    yield { trail, text: value, isKey: false };
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      yield* walkStrings(item, [...trail, index]);
    }

    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      yield { trail: [...trail, key], text: key, isKey: true };
      yield* walkStrings(item, [...trail, key]);
    }
  }
}

function describeTrail(workflow, trail) {
  const [first, job, third, index] = trail;

  if (first === 'jobs' && third === 'steps' && typeof index === 'number') {
    const name = workflow?.jobs?.[job]?.steps?.[index]?.name;

    return `job "${job}", step ${name ? `"${name}"` : `#${index + 1}`} (${trail.slice(4).join('.') || 'the step'})`;
  }

  return trail.join('.');
}

/**
 * The table, and every reason it cannot be trusted. Pure: the caller reads the files and runs the
 * measurement, so the spec can hand it fixtures.
 */
export function deriveAppConfigTargets({
  writerSource,
  unsupplied,
  workflows,
  packageScripts,
  targets = APP_CONFIG_BUILD_TARGETS,
}) {
  const problems = [];
  const writer = parseWriter(writerSource);

  if (writer.keys.length === 0) {
    problems.push(`${WRITER_PATH} declares no key read from process.env, so there is nothing to tabulate. The parser no longer matches the writer.`);
  }

  const declaredKeys = writer.keys.map(({ key }) => key);

  for (const key of Object.keys(unsupplied)) {
    if (!declaredKeys.includes(key)) {
      problems.push(`${WRITER_PATH} writes "${key}", but no \`const ${key} = ...(process.env[...])\` says which variable it comes from.`);
    }
  }

  for (const key of declaredKeys) {
    if (!Object.hasOwn(unsupplied, key)) {
      problems.push(`${WRITER_PATH} reads "${key}" from the environment but never writes it into app-config.js.`);
    }
  }

  const gates = [];

  for (const gate of writer.gates) {
    if (gate.flags.length !== 1 || gate.variables.length !== 1 || !declaredKeys.includes(gate.key)) {
      problems.push(
        `The writer's gate for "${gate.key}" does not read as one flag and one variable guarding a key it writes, so the table cannot say which builds require it.`,
      );
      continue;
    }

    gates.push({ key: gate.key, flag: gate.flags[0], variable: gate.variables[0] });
  }

  const byFile = new Map(workflows.map(({ file, workflow }) => [file, workflow]));
  const allowed = new Set();
  const records = [];

  for (const target of targets) {
    const runs = resolveWriterRuns(packageScripts, target.buildScript);

    if (runs.length === 0) {
      problems.push(
        `${target.id}: \`npm run ${target.buildScript}\` never runs ${WRITER_PATH}, so this build ships whatever public/app-config.js was already on disk.`,
      );
    } else if (runs.length > 1) {
      problems.push(`${target.id}: \`npm run ${target.buildScript}\` runs ${WRITER_PATH} ${runs.length} times, and the last one wins.`);
    }

    const flags = runs.flatMap((run) => run.flags);
    const steps = [];
    const supplies = [];

    for (const declared of target.steps) {
      const workflow = byFile.get(declared.workflow);
      const job = workflow?.jobs?.[declared.job];
      const index = Array.isArray(job?.steps) ? job.steps.findIndex((step) => step?.name === declared.step) : -1;

      if (index === -1) {
        problems.push(
          `${target.id}: ${describeStep(declared)} was not found. It moved or was renamed, so the table no longer knows what this build is given.`,
        );
        continue;
      }

      const step = job.steps[index];
      const env = step.env && typeof step.env === 'object' ? step.env : {};

      allowed.add(`${declared.workflow}#${declared.job}#${index}`);

      if (!stepInvokesScript(step, target.buildScript)) {
        problems.push(`${target.id}: ${describeStep(declared)} no longer builds with \`npm run ${target.buildScript}\`.`);
      }

      for (const name of Object.keys(env)) {
        if (name.startsWith('APP_') && !writer.variables.includes(name)) {
          problems.push(
            `${target.id}: ${describeStep(declared)} supplies ${name}, which ${WRITER_PATH} never reads - a misspelt variable reaches no key.`,
          );
        }
      }

      supplies.push({
        keys: Object.fromEntries(
          writer.keys.map(({ key, variable }) => [key, Object.hasOwn(env, variable) ? describeSupply(env[variable]) : null]),
        ),
        gates: gates.filter((gate) => Object.hasOwn(env, gate.variable)).map((gate) => gate.key),
      });
      steps.push({ ...declared, environment: environmentOf(job) });
    }

    if (new Set(supplies.map((supply) => JSON.stringify(supply))).size > 1) {
      problems.push(
        `${target.id} is built by ${supplies.length} steps that supply different keys, so what it serves depends on which of them ran last: ${steps.map(describeStep).join('; ')}.`,
      );
    }

    const supply = supplies[0] ?? { keys: {}, gates: [] };
    const requires = [
      ...gates.filter((gate) => flags.includes(gate.flag)).map((gate) => ({ key: gate.key, by: gate.flag })),
      ...gates.filter((gate) => supply.gates.includes(gate.key)).map((gate) => ({ key: gate.key, by: gate.variable })),
    ];

    records.push({
      id: target.id,
      label: target.label,
      what: target.what,
      reachesPlayers: target.reachesPlayers,
      buildScript: target.buildScript,
      writerRunBy: runs.map((run) => run.script),
      steps,
      requires,
      keys: Object.fromEntries(
        writer.keys.map(({ key }) => [
          key,
          supply.keys[key] ?? (unsupplied[key] === 'default' ? NOT_SUPPLIED_DEFAULT : NOT_SUPPLIED_EMPTY),
        ]),
      ),
    });
  }

  /*
   * The half that keeps the declared list honest. A writer variable may appear in exactly one
   * place: as a key of a declared build step's own `env:`. Anywhere else - another step, a job or
   * workflow `env:`, a `run:` that exports it, a value that inlines it - a build could be given a
   * key this table never shows.
   *
   * `secrets.X`, `vars.X` and `env.X` are removed first: the secrets share the variables' names,
   * and `${{ secrets.APP_GA4_MEASUREMENT_ID }}` passed to some OTHER variable supplies no key.
   */
  if (writer.variables.length > 0) {
    const mention = new RegExp(`(?<![A-Za-z0-9_])(${writer.variables.map(escapeRegExp).join('|')})(?![A-Za-z0-9_])`, 'u');

    for (const { file, workflow } of workflows) {
      for (const { trail, text, isKey } of walkStrings(workflow, [])) {
        const found = text.replace(/\b(?:secrets|vars|env)\.[A-Za-z_]\w*/gu, '').match(mention)?.[1];

        if (!found) continue;

        const [first, job, third, index, fifth] = trail;
        const isDeclaredEnvKey =
          isKey &&
          first === 'jobs' &&
          third === 'steps' &&
          fifth === 'env' &&
          trail.length === 6 &&
          allowed.has(`${file}#${job}#${index}`);

        if (!isDeclaredEnvKey) {
          problems.push(
            `${file}: ${describeTrail(workflow, trail)} names ${found} outside a declared build step's env:, so the table cannot say which build it reaches. Declare the build in APP_CONFIG_BUILD_TARGETS or move the variable.`,
          );
        }
      }
    }
  }

  return {
    record: {
      note:
        'Generated from scripts/write-app-config.mjs, package.json and .github/workflows/. Names where each key comes from and whether it is empty - never a value. Whether a named secret exists is GitHub state, not repository state: see docs/release-secrets-register.md.',
      writer: WRITER_PATH,
      keys: writer.keys.map(({ key, variable }) => ({
        key,
        variable,
        whenNotSupplied: unsupplied[key] === 'default' ? "the writer's default, not empty" : 'empty',
      })),
      gates,
      targets: records,
    },
    problems,
  };
}

/** Reads the writer, the workflows and package.json, measures the writer, and derives. */
export function readAppConfigTargets(root = process.cwd()) {
  const writerSource = readFileSync(path.join(root, WRITER_PATH), 'utf8');
  const { variables } = parseWriter(writerSource);

  return deriveAppConfigTargets({
    writerSource,
    unsupplied: measureUnsupplied(root, variables),
    workflows: readWorkflows(root),
    packageScripts: JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts ?? {},
  });
}

function formatCell(cell, required) {
  const named = cell.replace(/\b(secret|configuration variable) ([A-Za-z_]\w*)/u, '$1 `$2`');
  const text = cell === NOT_SUPPLIED_EMPTY ? '**empty**' : cell === NOT_SUPPLIED_DEFAULT ? "the writer's default" : named;

  return required ? `${text} - **required**` : text;
}

/** The readable half, between markers in docs/release-secrets-register.md. */
export function formatAppConfigTargetsMarkdown(record) {
  const lines = [
    SECTION_START,
    '',
    // Names the generator, not its npm script: a script NAME in a tracked non-markdown file reads
    // as an invocation to check-npm-script-references.mjs, and nothing here runs it.
    '_Generated by `scripts/generate-release-contract.mjs` from `scripts/write-app-config.mjs`, `package.json` and the workflows. Do not edit by hand. It says where each key comes from and whether it is empty - never a value._',
    '',
    `| Key | Variable | ${record.targets.map((target) => target.label).join(' | ')} |`,
    `| --- | --- | ${record.targets.map(() => '---').join(' | ')} |`,
  ];

  for (const { key, variable } of record.keys) {
    const cells = record.targets.map((target) =>
      formatCell(target.keys[key], target.requires.some((requirement) => requirement.key === key)),
    );

    lines.push(`| \`${key}\` | \`${variable}\` | ${cells.join(' | ')} |`);
  }

  lines.push('', '| Build | Reaches players | Built by | Writer run by | Fails when empty |', '| --- | :-: | --- | --- | --- |');

  for (const target of record.targets) {
    const steps = target.steps
      .map(
        (step) =>
          `\`${step.workflow}\` job \`${step.job}\`, step *${step.step}*${step.environment ? ` (environment \`${step.environment}\`)` : ''}`,
      )
      .join('<br>');
    const chain = [target.buildScript, ...target.writerRunBy.filter((script) => script !== target.buildScript)]
      .map((script) => `\`${script}\``)
      .join(' → ');
    const requires = target.requires.length > 0 ? target.requires.map((requirement) => `\`${requirement.key}\``).join(', ') : 'nothing';

    lines.push(`| ${target.label} - ${target.what} | ${target.reachesPlayers ? 'yes' : 'no'} | ${steps} | ${chain} | ${requires} |`);
  }

  lines.push('', SECTION_END);

  return lines.join('\n');
}

export function replaceAppConfigSection(markdown, section, heading = '## Which `app-config.js` each build gets') {
  const start = markdown.indexOf(SECTION_START);
  const end = markdown.indexOf(SECTION_END);

  if (start === -1 || end === -1) {
    return `${markdown.trimEnd()}\n\n${heading}\n\n${section}\n`;
  }

  return `${markdown.slice(0, start)}${section}${markdown.slice(end + SECTION_END.length)}`;
}
