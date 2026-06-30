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

  if (!VALID_QUARANTINE_MODES.has(quarantineMode)) {
    throw new Error(`Unsupported quarantine mode "${quarantineMode}". Use off, exclude, or only.`);
  }

  return {
    scopedProject: project.trim(),
    userArgs: remainingArgs,
    quarantineMode,
    quarantineModeExplicit,
  };
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
  const { scopedProject, userArgs, quarantineMode } = parseRunnerArgs(rawArgs, env);
  const projectArgs = scopedProject ? [`--project=${scopedProject}`] : [];
  const quarantineTags = quarantineTagsForProject(quarantineConfig, scopedProject);
  const quarantineGrep = buildQuarantineGrep(quarantineTags);

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

  if (scopedProject && scopedProject !== 'chromium') {
    return {
      runs: [
        {
          args: withQuarantineFilter([...projectArgs, '--grep-invert', GUIDED_GREP], quarantineMode, quarantineGrep),
          env: artifactEnv(scopedProject, env),
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

  return [...args, `--grep-invert=${quarantineGrep}`, '--pass-with-no-tests'];
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
