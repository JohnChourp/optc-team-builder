import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const i18nRoot = path.join(projectRoot, "public", "i18n");
const srcRoot = path.join(projectRoot, "src", "app");
const validatorScript = path.join(
  projectRoot,
  "..",
  "codex_utilities",
  "Downloads",
  "projects",
  "node_modules",
  "@jsverse",
  "transloco-validator",
  "src",
  "index.js",
);
const validatorArgs = collectTranslationJsonFiles(i18nRoot).map((file) =>
  path.relative(projectRoot, file).replace(/\\/g, "/"),
);

if (validatorArgs.length === 0) {
  console.error(`[i18n-audit] No translation JSON files found under ${i18nRoot}`);
  process.exit(1);
}

const validatorResult = spawnSync(process.execPath, [validatorScript, ...validatorArgs], {
  cwd: projectRoot,
  stdio: "inherit",
});

if (validatorResult.error) {
  console.error(`[i18n-audit] Failed to start transloco-validator: ${validatorResult.error.message}`);
  process.exit(1);
}

if (validatorResult.status !== 0) {
  process.exit(validatorResult.status ?? 1);
}

const rootEnglishPath = path.join(i18nRoot, "en.json");

if (!existsSync(rootEnglishPath)) {
  console.error(`[i18n-audit] Missing root translation file: ${rootEnglishPath}`);
  process.exit(1);
}

const rootTranslationTree = JSON.parse(readFileSync(rootEnglishPath, "utf8"));
const knownScopes = new Set(
  readdirSync(i18nRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(i18nRoot, entry.name, "en.json")))
    .map((entry) => entry.name),
);
const scopeTranslationTrees = new Map(
  [...knownScopes].map((scope) => [
    scope,
    JSON.parse(readFileSync(path.join(i18nRoot, scope, "en.json"), "utf8")),
  ]),
);

const findings = [
  ...scanTypeScriptFiles(srcRoot, rootTranslationTree, scopeTranslationTrees),
  ...scanTemplateFiles(srcRoot, rootTranslationTree, scopeTranslationTrees),
];

if (findings.length === 0) {
  console.log("[i18n-audit] No scoped translation misuse found.");
  process.exit(0);
}

console.error("[i18n-audit] Scoped translation misuse detected:");

for (const finding of findings) {
  console.error(
    `- ${path.relative(projectRoot, finding.file)}:${finding.line} ${finding.message} (${finding.key})`,
  );
}

process.exit(1);

function scanTypeScriptFiles(rootDir, rootTranslationTree, scopeTranslationTrees) {
  const findings = [];

  for (const file of walkFiles(rootDir, [".ts"])) {
    const source = readFileSync(file, "utf8");
    const helperScopes = findScopedTranslateHelpers(source);

    for (const helper of helperScopes) {
      const helperCallPattern = new RegExp(
        `this\\.${escapeRegExp(helper.name)}\\(\\s*["']([^"'\\n]+)["']`,
        "g",
      );

      for (const match of source.matchAll(helperCallPattern)) {
        const key = match[1];
        const issue = resolveScopedKeyIssue(
          key,
          helper.scope,
          rootTranslationTree,
          scopeTranslationTrees,
        );

        if (!issue || match.index === undefined) {
          continue;
        }

        findings.push({
          file,
          line: resolveLineNumber(source, match.index),
          key,
          message: `${issue} via scoped helper \`${helper.name}()\` for scope \`${helper.scope}\``,
        });
      }
    }

    for (const translateCall of findDirectScopedTranslateCalls(source)) {
      const issue = resolveScopedKeyIssue(
        translateCall.key,
        translateCall.scope,
        rootTranslationTree,
        scopeTranslationTrees,
      );

      if (!issue) {
        continue;
      }

      findings.push({
        file,
        line: resolveLineNumber(source, translateCall.index),
        key: translateCall.key,
        message: `${issue} via direct scoped translate for scope \`${translateCall.scope}\``,
      });
    }
  }

  return findings;
}

function collectTranslationJsonFiles(rootDir) {
  const files = [];

  for (const file of walkFiles(rootDir, [".json"])) {
    files.push(file);
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function scanTemplateFiles(rootDir, rootTranslationTree, scopeTranslationTrees) {
  const findings = [];

  for (const file of walkFiles(rootDir, [".html"])) {
    const source = readFileSync(file, "utf8");
    const scope = resolveTemplateScope(source);

    if (!scope) {
      continue;
    }

    const localTranslatePattern = /\bt\(\s*["']([^"'\n]+)["']/g;

    for (const match of source.matchAll(localTranslatePattern)) {
      const key = match[1];
      const issue = resolveScopedKeyIssue(key, scope, rootTranslationTree, scopeTranslationTrees);

      if (!issue || match.index === undefined) {
        continue;
      }

      findings.push({
        file,
        line: resolveLineNumber(source, match.index),
        key,
        message: `${issue} via local template \`t()\` for scope \`${scope}\``,
      });
    }
  }

  return findings;
}

function findScopedTranslateHelpers(source) {
  const helpers = [];
  const methodHelperPattern =
    /(?:private|public|protected)\s+([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)[\s\S]*?\)\s*:\s*string\s*\{[\s\S]*?return this\.i18n\.translate\(\s*\2\s*,[\s\S]*?,\s*["']([^"']+)["']\s*\);[\s\S]*?\}/g;
  const propertyHelperPattern =
    /(?:private|public|protected)\s+(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*=\s*\(\s*([A-Za-z_$][\w$]*)[\s\S]*?\)\s*:\s*string\s*=>\s*this\.i18n\.translate\(\s*\2\s*,[\s\S]*?,\s*["']([^"']+)["']\s*\)/g;

  for (const match of source.matchAll(methodHelperPattern)) {
    const [, name, , scope] = match;
    helpers.push({ name, scope });
  }

  for (const match of source.matchAll(propertyHelperPattern)) {
    const [, name, , scope] = match;
    helpers.push({ name, scope });
  }

  return helpers;
}

function findDirectScopedTranslateCalls(source) {
  const calls = [];
  const needle = "this.i18n.translate(";
  let searchStart = 0;

  while (searchStart < source.length) {
    const startIndex = source.indexOf(needle, searchStart);

    if (startIndex === -1) {
      break;
    }

    const openParenIndex = startIndex + needle.length - 1;
    const callEndIndex = findMatchingParenIndex(source, openParenIndex);

    if (callEndIndex === -1) {
      searchStart = startIndex + needle.length;
      continue;
    }

    const argsSource = source.slice(openParenIndex + 1, callEndIndex);
    const args = splitTopLevelArguments(argsSource);

    if (args.length >= 3) {
      const key = readStringLiteral(args[0]);
      const scope = readStringLiteral(args[2]);

      if (key && scope) {
        calls.push({ key, scope, index: startIndex });
      }
    }

    searchStart = callEndIndex + 1;
  }

  return calls;
}

function resolveTemplateScope(source) {
  const match = source.match(/\*transloco\s*=\s*(["'])([\s\S]*?)\1/);

  if (!match) {
    return null;
  }

  const directive = match[2];
  const scopeMatch = directive.match(/\bscope:\s*["']([^"']+)["']/);
  const readMatch = directive.match(/\bread:\s*["']([^"']+)["']/);

  if (!scopeMatch || !readMatch || scopeMatch[1] !== readMatch[1]) {
    return null;
  }

  return scopeMatch[1];
}

function resolveScopedKeyIssue(key, scope, rootTranslationTree, scopeTranslationTrees) {
  const scopeTranslationTree = scopeTranslationTrees.get(scope);

  if (scopeTranslationTree && hasTranslationKey(scopeTranslationTree, key)) {
    return null;
  }

  const [prefix = ""] = key.split(".", 1);

  if (!prefix.length) {
    return null;
  }

  if (prefix === scope) {
    return "Scoped key is already prefixed with its own scope";
  }

  if (hasTranslationKey(rootTranslationTree, key)) {
    return "Global translation key is being resolved through a scoped lookup";
  }

  if (scopeTranslationTrees.has(prefix) && prefix !== scope) {
    return "Another scope's translation key is being resolved through the wrong scoped lookup";
  }

  return null;
}

function walkFiles(rootDir, extensions) {
  const files = [];
  const pending = [rootDir];

  while (pending.length > 0) {
    const currentDir = pending.pop();
    const entries = readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const nextPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        pending.push(nextPath);
        continue;
      }

      if (extensions.includes(path.extname(entry.name))) {
        files.push(nextPath);
      }
    }
  }

  return files;
}

function resolveLineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function hasTranslationKey(tree, key) {
  const value = key.split(".").reduce((currentValue, part) => {
    if (
      currentValue === null ||
      typeof currentValue !== "object" ||
      !Object.prototype.hasOwnProperty.call(currentValue, part)
    ) {
      return undefined;
    }

    return currentValue[part];
  }, tree);

  return value !== undefined;
}

function findMatchingParenIndex(source, openParenIndex) {
  let depth = 0;
  let inString = false;
  let stringQuote = "";
  let isEscaped = false;

  for (let index = openParenIndex; index < source.length; index += 1) {
    const character = source[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === "\\") {
        isEscaped = true;
        continue;
      }

      if (character === stringQuote) {
        inString = false;
      }

      continue;
    }

    if (character === "'" || character === '"' || character === "`") {
      inString = true;
      stringQuote = character;
      continue;
    }

    if (character === "(") {
      depth += 1;
      continue;
    }

    if (character !== ")") {
      continue;
    }

    depth -= 1;

    if (depth === 0) {
      return index;
    }
  }

  return -1;
}

function splitTopLevelArguments(source) {
  const argumentsList = [];
  let currentArgument = "";
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let inString = false;
  let stringQuote = "";
  let isEscaped = false;

  for (const character of source) {
    currentArgument += character;

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === "\\") {
        isEscaped = true;
        continue;
      }

      if (character === stringQuote) {
        inString = false;
      }

      continue;
    }

    if (character === "'" || character === '"' || character === "`") {
      inString = true;
      stringQuote = character;
      continue;
    }

    if (character === "(") {
      parenDepth += 1;
      continue;
    }

    if (character === ")") {
      parenDepth -= 1;
      continue;
    }

    if (character === "{") {
      braceDepth += 1;
      continue;
    }

    if (character === "}") {
      braceDepth -= 1;
      continue;
    }

    if (character === "[") {
      bracketDepth += 1;
      continue;
    }

    if (character === "]") {
      bracketDepth -= 1;
      continue;
    }

    if (character !== "," || parenDepth > 0 || braceDepth > 0 || bracketDepth > 0) {
      continue;
    }

    argumentsList.push(currentArgument.slice(0, -1).trim());
    currentArgument = "";
  }

  const trimmedArgument = currentArgument.trim();

  if (trimmedArgument.length > 0) {
    argumentsList.push(trimmedArgument);
  }

  return argumentsList;
}

function readStringLiteral(source) {
  const match = source.trim().match(/^(['"`])([\s\S]*)\1$/);

  return match ? match[2] : null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
