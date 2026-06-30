import { buildQuarantineGrep, VALID_QUARANTINE_MODES } from './playwright-quarantine.mjs';

export const GUIDED_GREP = '@guided-auto-build';

export function parseRunnerArgs(args, env = process.env) {
  const remainingArgs = [];
  let project = (env.E2E_PROJECT ?? '').trim();
  let quarantineMode = (env.E2E_QUARANTINE_MODE ?? '').trim();
  let quarantineModeExplicit = Boolean(quarantineMode);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--e2e-project') {
      project = args[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (arg.startsWith('--e2e-project=')) {
      project = arg.slice('--e2e-project='.length);
      continue;
    }

    if (arg === '--quarantine-mode') {
      quarantineMode = args[index + 1] ?? '';
      quarantineModeExplicit = true;
      index += 1;
      continue;
    }

    if (arg.startsWith('--quarantine-mode=')) {
      quarantineMode = arg.slice('--quarantine-mode='.length);
      quarantineModeExplicit = true;
      continue;
    }

    remainingArgs.push(arg);
  }

  quarantineMode = quarantineMode || 'off';
  const nativeProjects = collectNativeProjects(remainingArgs);

  if (!VALID_QUARANTINE_MODES.has(quarantineMode)) {
    throw new Error(`Unsupported quarantine mode "${quarantineMode}". Use off, exclude, or only.`);
  }

  if (project && nativeProjects.some((nativeProject) => nativeProject !== project)) {
    throw new Error('Use either --e2e-project or a matching Playwright --project filter, not both.');
  }

  if (!project && nativeProjects.length === 1) {
    project = nativeProjects[0];
  }

  if (quarantineMode !== 'off' && nativeProjects.length > 1) {
    throw new Error('Quarantine mode supports one native --project filter at a time. Use --e2e-project per browser.');
  }

  return {
    scopedProject: project.trim(),
    hasNativeProjectFilter: nativeProjects.length > 0,
    userArgs: remainingArgs,
    quarantineMode,
    quarantineModeExplicit,
  };
}

export function assertValidQuarantineConfig(quarantineConfig) {
  const failures = quarantineConfig.failures ?? [];
  if (failures.length === 0) {
    return;
  }

  throw new Error(
    ['Invalid Playwright quarantine metadata:', ...failures.map((failure) => `- ${failure}`)].join('\n'),
  );
}

export function artifactEnv(name, env = process.env) {
  const baseDir = (env.E2E_ARTIFACT_BASE_DIR ?? '').trim().replace(/[\\/]+$/u, '');
  const prefix = baseDir ? `${baseDir}/` : '';

  return {
    PLAYWRIGHT_HTML_REPORT: `${prefix}playwright-report/${name}`,
    PLAYWRIGHT_OUTPUT_DIR: `${prefix}test-results/${name}`,
    PLAYWRIGHT_JSON_OUTPUT_NAME: 'results.json',
  };
}

export function buildRunPlan({ rawArgs = [], env = process.env, quarantineConfig = { tags: [], grep: '' } } = {}) {
  const { scopedProject, hasNativeProjectFilter, userArgs, quarantineMode } = parseRunnerArgs(rawArgs, env);
  const projectArgs = scopedProject && !hasNativeProjectFilter ? [`--project=${scopedProject}`] : [];
  const quarantineTags = quarantineTagsForProject(quarantineConfig, scopedProject);
  const quarantineGrep = buildQuarantineGrep(quarantineTags);

  if (quarantineMode !== 'off' && !scopedProject && activeQuarantineTags(quarantineConfig).length > 0) {
    throw new Error('Quarantine mode requires --e2e-project or one native --project filter when active quarantine entries exist.');
  }

  if (quarantineMode === 'only') {
    if (quarantineTags.length === 0 || !quarantineGrep) {
      return {
        message: '[test:e2e] No active quarantined Playwright tests are registered.',
        runs: [],
      };
    }

    return {
      runs: [
        {
          args: [...projectArgs, `--grep=${quarantineGrep}`, '--pass-with-no-tests', ...userArgs],
          env: artifactEnv(scopedProject ? `${scopedProject}-quarantine` : 'quarantine', env),
        },
      ],
    };
  }

  if (userArgs.length > 0) {
    return {
      runs: [
        {
          args: withQuarantineFilter([...projectArgs, ...userArgs], quarantineMode, quarantineGrep),
          env: {},
        },
      ],
    };
  }

  if (scopedProject) {
    return {
      runs: [
        {
          args: withQuarantineFilter([...projectArgs, '--grep-invert', GUIDED_GREP], quarantineMode, quarantineGrep),
          env: artifactEnv(`${scopedProject}-main`, env),
        },
        {
          args: withQuarantineFilter([...projectArgs, '--grep', GUIDED_GREP, '--workers', '1'], quarantineMode, quarantineGrep),
          env: artifactEnv(`${scopedProject}-guided`, env),
        },
      ],
    };
  }

  const nonGuidedName = scopedProject ? `${scopedProject}-main` : 'main';
  return {
    runs: [
      {
        args: withQuarantineFilter([...projectArgs, '--grep-invert', GUIDED_GREP], quarantineMode, quarantineGrep),
        env: artifactEnv(nonGuidedName, env),
      },
      {
        args: withQuarantineFilter(['--project=chromium', '--grep', GUIDED_GREP, '--workers', '1'], quarantineMode, quarantineGrep),
        env: artifactEnv('chromium-guided', env),
      },
    ],
  };
}

export function withQuarantineFilter(args, quarantineMode, quarantineGrep) {
  if (quarantineMode !== 'exclude' || !quarantineGrep) {
    return args;
  }

  const { args: argsWithoutGrepInvert, grepInvertPatterns } = extractGrepInvertPatterns(args);
  return [
    ...argsWithoutGrepInvert,
    `--grep-invert=${combineGrepPatterns([...grepInvertPatterns, quarantineGrep])}`,
    '--pass-with-no-tests',
  ];
}

function extractGrepInvertPatterns(args) {
  const argsWithoutGrepInvert = [];
  const grepInvertPatterns = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--grep-invert') {
      const pattern = args[index + 1];
      if (pattern) {
        grepInvertPatterns.push(pattern);
      }
      index += 1;
      continue;
    }

    if (arg.startsWith('--grep-invert=')) {
      grepInvertPatterns.push(arg.slice('--grep-invert='.length));
      continue;
    }

    argsWithoutGrepInvert.push(arg);
  }

  return { args: argsWithoutGrepInvert, grepInvertPatterns };
}

function combineGrepPatterns(patterns) {
  const uniquePatterns = [...new Set(patterns.filter(Boolean))];

  if (uniquePatterns.length === 1) {
    return uniquePatterns[0];
  }

  return uniquePatterns.map((pattern) => `(?:${pattern})`).join('|');
}

function quarantineTagsForProject(quarantineConfig, scopedProject) {
  if (!scopedProject) {
    return quarantineConfig.tags ?? [];
  }

  if (!Array.isArray(quarantineConfig.entries)) {
    return quarantineConfig.tags ?? [];
  }

  return quarantineConfig.entries
    .filter((entry) => Array.isArray(entry.browsers) && entry.browsers.includes(scopedProject))
    .map((entry) => entry.tag)
    .filter(Boolean);
}

function activeQuarantineTags(quarantineConfig) {
  if (Array.isArray(quarantineConfig.entries)) {
    return quarantineConfig.entries.map((entry) => entry.tag).filter(Boolean);
  }

  return quarantineConfig.tags ?? [];
}

function collectNativeProjects(args) {
  const projects = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--project') {
      const value = args[index + 1];
      if (value) {
        projects.push(value);
      }
      index += 1;
      continue;
    }

    if (arg.startsWith('--project=')) {
      projects.push(arg.slice('--project='.length));
    }
  }

  return [...new Set(projects.map((value) => value.trim()).filter(Boolean))];
}
