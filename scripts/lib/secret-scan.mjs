/**
 * 869f33bru. The one definition of "a value shaped like a secret", shared by every place that must
 * refuse one: the pre-commit and pre-push hooks, the `secrets` lane, the build of the published
 * site, and the build of the release APK.
 *
 * Why it exists. GitHub secret scanning alert #1 (2026-09-15) was a Google API key in a test
 * fixture - `scripts/check-app-config.spec.ts`, written to prove that the app-config guard refuses
 * secrets. The key was fake (an alphabet pattern, and Google answers API_KEY_INVALID), but nothing
 * in this repository could tell a fake from a real one before it was public, and GitHub's push
 * protection never blocks `google_api_key` at all. So the rule is about SHAPE, not validity:
 *
 *   no value shaped like a credential is committed or shipped - not a real one, not a fake one.
 *
 * A test that needs a secret-shaped value assembles it at runtime from pieces (see the spec beside
 * this file), so the literal never exists in a file. That costs one helper call and removes the
 * whole question of whether a given literal is "only a fixture".
 *
 * Deliberately NOT here:
 * - an allowlist or an inline "ignore" pragma. Either would turn the rule back into a judgement
 *   made per file, which is exactly what failed. If a rule is wrong, fix the rule.
 * - public-by-design identifiers: a GA4 measurement id (`G-...`) and a Google OAuth CLIENT id
 *   (`...apps.googleusercontent.com`) are meant to be in a browser. `check-app-config.mjs` owns
 *   what the published config may carry.
 *
 * Every finding is reported redacted - the first four characters and the length - so the scanner
 * never becomes the thing that prints a secret into a terminal log.
 */

/** Characters that may continue a token; used so a rule never matches the middle of a longer word. */
const TOKEN_CHARS = 'A-Za-z0-9_\\-';

/**
 * A password or user part that is clearly a placeholder rather than a value: `${VAR}`, `$VAR`,
 * `<password>`, `***`, `xxx`, `...`, an ALL_CAPS name, or the literal words people use in docs.
 */
const PLACEHOLDER_PATTERN =
  /^(?:\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*|\{\{[^}]*\}\}|<[^>]*>|%[A-Za-z_]+%|\*+|x+|X+|\.{3}|[A-Z][A-Z0-9_]*|password|passwd|pass|pwd|secret|changeme|example|user|username)$/u;

function isPlaceholder(value) {
  return PLACEHOLDER_PATTERN.test(value);
}

function shannonEntropy(value) {
  const counts = new Map();

  for (const char of value) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }

  let entropy = 0;

  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

/**
 * The rules. Each `pattern` is global and sticky-free; `accept(match)` returns false to discard a
 * match that has the shape but is provably not a value (a placeholder, a low-entropy word).
 *
 * Provider formats follow the providers' own published token formats, which is also what GitHub's
 * secret scanning keys on, so the two nets agree on what a finding is.
 */
export const SECRET_RULES = Object.freeze([
  {
    id: 'google-api-key',
    description: 'Google API key (AIza + 35)',
    pattern: new RegExp(`(?<![${TOKEN_CHARS}])AIza[0-9A-Za-z_\\-]{35}(?![${TOKEN_CHARS}])`, 'gu'),
  },
  {
    id: 'google-oauth-client-secret',
    description: 'Google OAuth client secret (GOCSPX-)',
    pattern: new RegExp(`(?<![${TOKEN_CHARS}])GOCSPX-[A-Za-z0-9_\\-]{20,}`, 'gu'),
  },
  {
    id: 'google-service-account',
    description: 'Google service account key file',
    // `\\?` lets it through a key file embedded as an escaped JSON string, the usual way one is pasted.
    pattern: /\\?"type\\?"\s*:\s*\\?"service_account\\?"/gu,
  },
  {
    id: 'private-key-block',
    description: 'PEM private key',
    pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/gu,
  },
  {
    id: 'aws-access-key-id',
    description: 'AWS access key id',
    pattern: /(?<![A-Z0-9])(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA|AIPA)[A-Z0-9]{16}(?![A-Z0-9])/gu,
  },
  {
    id: 'aws-secret-access-key',
    description: 'AWS secret access key assignment',
    pattern: /aws_?secret_?(?:access_?)?key\\?["']?\s*[:=]\s*\\?["']?[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/giu,
  },
  {
    id: 'github-token',
    description: 'GitHub token (ghp_/gho_/ghu_/ghs_/ghr_)',
    pattern: new RegExp(`(?<![${TOKEN_CHARS}])gh[pousr]_[A-Za-z0-9]{36,255}(?![${TOKEN_CHARS}])`, 'gu'),
  },
  {
    id: 'github-fine-grained-token',
    description: 'GitHub fine-grained token (github_pat_)',
    pattern: new RegExp(`(?<![${TOKEN_CHARS}])github_pat_[A-Za-z0-9_]{50,}`, 'gu'),
  },
  {
    id: 'slack-token',
    description: 'Slack token (xox?-)',
    pattern: new RegExp(`(?<![${TOKEN_CHARS}])xox[abposr]-[A-Za-z0-9-]{10,}`, 'gu'),
  },
  {
    id: 'slack-webhook',
    description: 'Slack incoming webhook URL',
    pattern: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{6,}\/B[A-Z0-9]{6,}\/[A-Za-z0-9]{20,}/gu,
  },
  {
    id: 'stripe-secret-key',
    description: 'Stripe live secret or restricted key',
    pattern: new RegExp(`(?<![${TOKEN_CHARS}])(?:sk|rk)_live_[A-Za-z0-9]{20,}`, 'gu'),
  },
  {
    id: 'clickup-token',
    description: 'ClickUp personal API token (pk_)',
    pattern: new RegExp(`(?<![${TOKEN_CHARS}])pk_\\d{6,12}_[A-Z0-9]{32}(?![${TOKEN_CHARS}])`, 'gu'),
  },
  {
    id: 'npm-token',
    description: 'npm access token (npm_)',
    pattern: new RegExp(`(?<![${TOKEN_CHARS}])npm_[A-Za-z0-9]{36}(?![${TOKEN_CHARS}])`, 'gu'),
  },
  {
    id: 'openai-api-key',
    description: 'OpenAI API key',
    pattern: new RegExp(`(?<![${TOKEN_CHARS}])sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_\\-]{20,}T3BlbkFJ[A-Za-z0-9_\\-]{20,}`, 'gu'),
  },
  {
    id: 'anthropic-api-key',
    description: 'Anthropic API key',
    pattern: new RegExp(`(?<![${TOKEN_CHARS}])sk-ant-(?:api|admin)\\d{2}-[A-Za-z0-9_\\-]{80,}`, 'gu'),
  },
  {
    id: 'sendgrid-api-key',
    description: 'SendGrid API key',
    pattern: new RegExp(`(?<![${TOKEN_CHARS}])SG\\.[A-Za-z0-9_\\-]{22}\\.[A-Za-z0-9_\\-]{43}(?![${TOKEN_CHARS}])`, 'gu'),
  },
  {
    id: 'firebase-server-key',
    description: 'Firebase Cloud Messaging legacy server key',
    pattern: new RegExp(`(?<![${TOKEN_CHARS}])AAAA[A-Za-z0-9_\\-]{7}:APA91b[A-Za-z0-9_\\-]{100,}`, 'gu'),
  },
  {
    id: 'telegram-bot-token',
    description: 'Telegram bot token',
    pattern: new RegExp(`(?<![0-9])\\d{8,10}:AA[A-Za-z0-9_\\-]{33}(?![${TOKEN_CHARS}])`, 'gu'),
  },
  {
    id: 'azure-storage-key',
    description: 'Azure storage account key',
    pattern: /AccountKey=[A-Za-z0-9+/]{80,}={0,2}/gu,
  },
  {
    id: 'jwt',
    description: 'JSON Web Token',
    pattern: new RegExp(`(?<![${TOKEN_CHARS}])eyJ[A-Za-z0-9_\\-]{10,}\\.eyJ[A-Za-z0-9_\\-]{10,}\\.[A-Za-z0-9_\\-]{10,}`, 'gu'),
  },
  {
    /*
     * The shape of the optc-box-exporter alert (a Heroku Postgres URL, 2020, inherited with the
     * fork): a connection string that carries its own password. `user:password@host` in docs is a
     * placeholder and is let through; anything else is a credential in a URL.
     */
    id: 'credentials-in-url',
    description: 'Connection URL with an embedded password',
    pattern:
      /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?|mssql|sqlserver|s?ftp|https?):\/\/([^\s:@/'"`<>]+):([^\s@/'"`<>]+)@[^\s'"`<>/]+/giu,
    accept(match) {
      const [, user, password] = match;
      return !isPlaceholder(password) && !isPlaceholder(user) && password.length >= 6;
    },
  },
  {
    /*
     * A value assigned to a name that says it is secret. Narrow on purpose: the value must be one
     * unbroken token of 16+ characters with letters AND digits and real entropy, so i18n copy
     * ("password": "Enter your password") and placeholders never match.
     */
    id: 'generic-secret-assignment',
    description: 'High-entropy value assigned to a secret-named key',
    pattern:
      /\b(?:api[_-]?key|api[_-]?secret|client[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|private[_-]?key|password|passwd)\\?["']?\s*[:=]\s*\\?["']([A-Za-z0-9+/_=.\-]{16,})\\?["']/giu,
    accept(match) {
      const value = match[1];
      return (
        !isPlaceholder(value) &&
        /[A-Za-z]/u.test(value) &&
        /\d/u.test(value) &&
        shannonEntropy(value) >= 3.5
      );
    },
  },
]);

/** A buffer is treated as binary when it carries a NUL byte early on, the same heuristic git uses. */
export function isProbablyBinary(buffer) {
  const length = Math.min(buffer.length, 8000);

  for (let index = 0; index < length; index += 1) {
    if (buffer[index] === 0) {
      return true;
    }
  }

  return false;
}

/** First four characters and the length. Never the value. */
export function redact(value) {
  return `${value.slice(0, 4)}… (${value.length} chars)`;
}

function lineStarts(text) {
  const starts = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      starts.push(index + 1);
    }
  }

  return starts;
}

function locate(starts, offset) {
  let low = 0;
  let high = starts.length - 1;

  while (low < high) {
    const mid = (low + high + 1) >> 1;

    if (starts[mid] <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return { line: low + 1, column: offset - starts[low] + 1 };
}

/**
 * Every secret-shaped value in `text`, as `{ path, line, column, ruleId, preview }`.
 * `lineOffset` lets a caller that scans a fragment (one added diff line) report the file's line.
 */
export function scanText(text, { path = '<text>', rules = SECRET_RULES, lineNumbers = null } = {}) {
  const findings = [];
  let starts = null;

  for (const rule of rules) {
    rule.pattern.lastIndex = 0;

    for (const match of text.matchAll(rule.pattern)) {
      if (rule.accept && !rule.accept(match)) {
        continue;
      }

      starts ??= lineStarts(text);
      const position = locate(starts, match.index);
      findings.push({
        path,
        line: lineNumbers ? lineNumbers[position.line - 1] ?? position.line : position.line,
        column: position.column,
        ruleId: rule.id,
        preview: redact(match[0]),
      });
    }
  }

  return findings.sort((a, b) => a.line - b.line || a.column - b.column || a.ruleId.localeCompare(b.ruleId));
}

/**
 * Scans only the ADDED lines of a unified diff (`git diff`, `git diff-tree -p`), reporting each
 * finding at the file and line the addition lands on. Used by the pre-push hook, so a secret that
 * was committed and then deleted inside the same push is still refused - it is in history either
 * way.
 */
export function scanUnifiedDiff(diffText, { commit = null } = {}) {
  const findings = [];
  let currentPath = null;
  let newLine = 0;
  let added = [];
  let addedLineNumbers = [];

  const flush = () => {
    if (currentPath && added.length) {
      for (const finding of scanText(added.join('\n'), {
        path: currentPath,
        lineNumbers: addedLineNumbers,
      })) {
        findings.push(commit ? { ...finding, commit } : finding);
      }
    }

    added = [];
    addedLineNumbers = [];
  };

  for (const line of diffText.split('\n')) {
    if (line.startsWith('diff --git ')) {
      flush();
      currentPath = null;
      continue;
    }

    if (line.startsWith('+++ ')) {
      flush();
      const target = line.slice(4).trim();
      currentPath = target === '/dev/null' ? null : target.replace(/^b\//u, '');
      continue;
    }

    if (line.startsWith('--- ')) {
      continue;
    }

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(line);

    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }

    if (!currentPath) {
      continue;
    }

    if (line.startsWith('+')) {
      added.push(line.slice(1));
      addedLineNumbers.push(newLine);
      newLine += 1;
    } else if (line.startsWith(' ')) {
      newLine += 1;
    }
  }

  flush();
  return findings;
}

export function formatFinding(finding) {
  const where = `${finding.path}:${finding.line}:${finding.column}`;
  const commit = finding.commit ? ` (commit ${finding.commit.slice(0, 8)})` : '';

  return `${where} ${finding.ruleId} ${finding.preview}${commit}`;
}
