/**
 * Which environment a spec meets, decided by where the spec LIVES.
 *
 * 869f13d76. This file used to declare one environment, `node`, for everything. The
 * Angular lane does not use this file at all - `ng test` is `@angular/build:unit-test`,
 * which builds its own Vitest run with a DOM and `src/test-setup.ts`. So the same spec
 * file gave two different answers depending on which command you typed:
 *
 *   npx ng test --include src/app/app.component.spec.ts   ->  34 passed
 *   npx vitest run src/app/app.component.spec.ts          ->  5 failed, 29 passed
 *
 * Measured 2026-09-21, same commit, and identical on clean `main` - so it was the
 * invocation, never anyone's change. Across the whole tree it was 45 files failing under
 * plain Vitest, and only 35 individual tests: most of those files were failing to LOAD,
 * which is this project's most expensive failure shape because a load failure reports
 * zero test failures.
 *
 * The knowledge was real and written down. It was written down in a BRAIN, which is the
 * part that was wrong: a contributor meets it as a test that behaves differently in two
 * places, which reads as a regression and is not one.
 *
 * So the environment is a property of the file's location now, and both invocations
 * honour it. `src/**` gets the DOM and the shared setup the Angular lane gives it;
 * `scripts/**` keeps plain Node, because those specs drive Node scripts against the real
 * filesystem and a DOM would only slow them down.
 *
 * WHAT THIS MUST NOT RELAX, and does not: page specs still run with no TestBed, no
 * injector and no Worker. That constraint shapes how async and worker code is DESIGNED
 * here - a design that cannot be exercised as pure functions cannot be tested in this
 * project at all - and none of it comes from the environment being `node`. jsdom has no
 * Angular injector and no Worker either.
 */
const stripMjsShebang = {
  enforce: 'pre',
  name: 'strip-mjs-shebang-for-tests',
  transform(code, id) {
    if (!id.endsWith('.mjs') || !code.startsWith('#!')) {
      return null;
    }

    return {
      code: code.replace(/^#![^\r\n]*(?:\r?\n)?/u, ''),
      map: null,
    };
  },
};

export default {
  test: {
    projects: [
      {
        plugins: [stripMjsShebang],
        test: {
          name: 'scripts',
          environment: 'node',
          // `e2e/**` is deliberately absent: those are PLAYWRIGHT specs. Vitest's default
          // glob would sweep them in, and they fail to load with "Playwright Test did not
          // expect test.describe() to be called here" - which nothing noticed before,
          // because no lane ever ran a bare `vitest run`. They are owned by
          // `playwright.config.ts` and the `e2e-*` lanes.
          include: ['scripts/**/*.spec.ts', 'scripts/**/*.spec.mjs'],
        },
      },
      {
        plugins: [stripMjsShebang],
        test: {
          /*
           * The Drive-sync backend, FROZEN out of the default checks on 2026-09-20
           * (869f13c92) with the code kept and its suite "still runnable by hand".
           * It needs a project of its own for that to stay true: without one,
           * `npm run test:drive-sync-server` matches no project and reports no test
           * files, which is the silent shape this whole change exists to remove. No
           * lane runs it; `test:drive-sync-server` does.
           */
          name: 'server',
          environment: 'node',
          include: ['server/**/*.spec.mjs'],
        },
      },
      {
        plugins: [stripMjsShebang],
        test: {
          name: 'src',
          // The same environment and setup file `@angular/build:unit-test` gives the
          // `angular` lane, so a spec cannot tell which of the two started it.
          environment: 'jsdom',
          // `@angular/compiler` first: the Angular builder loads the JIT compiler for
          // the `angular` lane, so 11 specs that never imported it themselves failed to
          // LOAD here with "needs to be compiled using the JIT compiler". Supplying it
          // once is the configuration answer; the alternative was an import line in
          // eleven files that the twelfth would forget.
          setupFiles: ['@angular/compiler', 'src/test-setup.ts'],
          include: ['src/**/*.spec.ts'],
        },
      },
    ],
  },
};
