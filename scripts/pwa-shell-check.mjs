#!/usr/bin/env node
import { chromium, request as playwrightRequest } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist', 'optc-team-builder', 'browser');
const DEFAULT_BRAIN_ARTIFACT_DIR = path.resolve(
  ROOT_DIR,
  '..',
  'optc-team-builder-brain',
  'live-artifacts',
  '869dwc7wk',
  'pwa-shell',
);
const DEFAULT_ARTIFACT_DIR = fs.existsSync(path.resolve(ROOT_DIR, '..', 'optc-team-builder-brain'))
  ? DEFAULT_BRAIN_ARTIFACT_DIR
  : path.join(ROOT_DIR, 'test-results', 'pwa-shell');
const ARTIFACT_DIR = path.resolve(process.env.PWA_SHELL_ARTIFACT_DIR || DEFAULT_ARTIFACT_DIR);
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, 'screenshots');
const TEMP_ROOT = path.join(ROOT_DIR, 'dist', `.pwa-shell-check-${process.pid}-${Date.now()}`);
const RELEASE_A_DIR = path.join(TEMP_ROOT, 'release-a');
const RELEASE_B_DIR = path.join(TEMP_ROOT, 'release-b');
const ROUTES = [
  { path: '/', expectedText: /OPTC Team Builder/iu },
  { path: '/tabs/characters', expectedText: /OPTC Character Vault/iu },
  { path: '/tabs/auto-team-builder', expectedText: /Auto Team Builder/iu },
  { path: '/tabs/saved-teams', expectedText: /Saved Teams/iu },
  { path: '/tabs/settings', expectedText: /Manage language|offline data|Settings/iu },
  { path: '/guides/guided-build-compare-team-sharing', expectedText: /Guided Build|Compare Mode|Team Sharing/iu },
];
const ROUTE_PATHS = ROUTES.map((route) => route.path);
const SERVICE_WORKER_READY_TIMEOUT_MS = 45_000;
const APP_READY_TIMEOUT_MS = 45_000;

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.wasm', 'application/wasm'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeArtifact(relativePath, content) {
  const outputPath = path.join(ARTIFACT_DIR, relativePath);
  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, content, 'utf8');
  return outputPath;
}

function sanitizeRoute(value) {
  return value === '/' ? 'root' : value.replace(/^\/+/u, '').replace(/[^a-z0-9_-]+/giu, '-');
}

function runCommand(label, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = [
    `$ ${[command, ...args].join(' ')}`,
    '',
    '## stdout',
    result.stdout || '',
    '',
    '## stderr',
    result.stderr || '',
    '',
    `exitCode=${result.status ?? 'null'}`,
  ].join('\n');
  writeArtifact(`logs/${label}.log`, log);

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    throw result.error;
  }
  if (result.signal) {
    throw new Error(`${label} exited from signal ${result.signal}`);
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

function npmCommand() {
  if (process.platform === 'win32') {
    return {
      command: process.execPath,
      prefixArgs: [path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')],
    };
  }
  return { command: 'npm', prefixArgs: [] };
}

function npxCommand() {
  if (process.platform === 'win32') {
    return {
      command: process.execPath,
      prefixArgs: [path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')],
    };
  }
  return { command: 'npx', prefixArgs: [] };
}

function regenerateNgsw(releaseDir, label) {
  const npx = npxCommand();
  runCommand(label, npx.command, [
    ...npx.prefixArgs,
    'ngsw-config',
    path.relative(ROOT_DIR, releaseDir),
    'ngsw-config.json',
    '/',
  ]);
}

function copyRelease(sourceDir, targetDir, label) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true });
  patchReleaseMarker(targetDir, label);
  regenerateNgsw(targetDir, `ngsw-${label}`);
}

function patchReleaseMarker(releaseDir, label) {
  const indexPath = path.join(releaseDir, 'index.html');
  const original = fs.readFileSync(indexPath, 'utf8');
  const marker = `<meta name="pwa-shell-release" content="${label}">`;
  const next = original.includes('name="pwa-shell-release"')
    ? original.replace(/<meta name="pwa-shell-release" content="[^"]*">/u, marker)
    : original.replace(/<\/head>/iu, `  ${marker}\n</head>`);
  fs.writeFileSync(indexPath, next, 'utf8');
}

function contentTypeFor(filePath) {
  return mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
}

function startStaticServer(initialRoot) {
  let currentRoot = initialRoot;
  const server = createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/u, '');
    const candidatePath = path.resolve(currentRoot, relativePath);
    const rootWithSep = `${path.resolve(currentRoot)}${path.sep}`;

    let filePath = candidatePath.startsWith(rootWithSep) ? candidatePath : '';
    const acceptsHtml = String(req.headers.accept || '').includes('text/html');
    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      if (acceptsHtml) {
        filePath = path.join(currentRoot, 'index.html');
      } else {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found');
        return;
      }
    }

    res.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': contentTypeFor(filePath),
    });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to resolve static server address.'));
        return;
      }
      resolve({
        baseURL: `http://127.0.0.1:${address.port}`,
        switchRoot(nextRoot) {
          currentRoot = nextRoot;
        },
        close() {
          return new Promise((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()));
          });
        },
      });
    });
  });
}

function isIgnorableConsoleError(text) {
  const ignorable = [
    /Failed to load resource:.*app-config\.js/iu,
    /Failed to load resource: net::ERR_(?:FAILED|ABORTED|INTERNET_DISCONNECTED)/iu,
    /Failed to load resource: the server responded with a status of 504 \(Gateway Timeout\)/iu,
    /accounts\.google\.com/iu,
    /Google Identity Services/iu,
    /google\.accounts/iu,
    /ResizeObserver loop/iu,
    /Manifest:.*manifest\.webmanifest/iu,
    /favicon/iu,
  ];
  return ignorable.some((pattern) => pattern.test(text));
}

function attachPageDiagnostics(page, diagnostics, scope) {
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (isIgnorableConsoleError(text)) return;
    diagnostics.consoleErrors.push({
      scope,
      text,
      location: message.location(),
    });
  });
  page.on('pageerror', (error) => {
    if (isIgnorableConsoleError(error.message)) return;
    diagnostics.pageErrors.push({ scope, message: error.message });
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    const url = request.url();
    if (/google|clarity|favicon|data:/iu.test(url)) return;
    diagnostics.requestFailures.push({
      scope,
      url,
      method: request.method(),
      resourceType: request.resourceType(),
      errorText: failure?.errorText ?? 'unknown',
    });
  });
}

async function waitForAppReady(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('ion-app').first().waitFor({ state: 'attached', timeout: APP_READY_TIMEOUT_MS });
  await page
    .locator('ion-content:not(.tabs-menu__content)')
    .first()
    .waitFor({ state: 'visible', timeout: APP_READY_TIMEOUT_MS });
}

async function assertRouteRendered(page, route) {
  const pathname = new URL(page.url()).pathname;
  if (pathname !== route.path) {
    throw new Error(`expected route ${route.path} to render, browser is at ${pathname}`);
  }

  const contentText = await page
    .locator('ion-content:not(.tabs-menu__content)')
    .first()
    .innerText({ timeout: APP_READY_TIMEOUT_MS });
  if (!route.expectedText.test(contentText)) {
    throw new Error(`route ${route.path} did not render expected content ${route.expectedText}`);
  }
}

async function waitForServiceWorkerControl(page) {
  const result = await page.evaluate(async (timeoutMs) => {
    if (!('serviceWorker' in navigator)) {
      return { supported: false, controller: false, scope: '', scriptURL: '' };
    }

    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('service worker ready timed out')), timeoutMs);
    });
    const registration = await Promise.race([navigator.serviceWorker.ready, timeout]);
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 15_000);
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => {
            clearTimeout(timer);
            resolve(undefined);
          },
          { once: true },
        );
      });
    }

    return {
      supported: true,
      controller: Boolean(navigator.serviceWorker.controller),
      scope: registration.scope,
      scriptURL: registration.active?.scriptURL ?? '',
    };
  }, SERVICE_WORKER_READY_TIMEOUT_MS);

  if (!result.supported) {
    throw new Error('Service workers are not supported in this browser context.');
  }

  if (!result.controller) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, {
      timeout: SERVICE_WORKER_READY_TIMEOUT_MS,
    });
  }

  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return {
      controller: Boolean(navigator.serviceWorker.controller),
      scope: registration.scope,
      scriptURL: registration.active?.scriptURL ?? '',
    };
  });
}

async function sendNgswOperation(page, action) {
  return page.evaluate(
    ({ action: actionName, timeoutMs }) =>
      new Promise((resolve) => {
        const controller = navigator.serviceWorker.controller;
        if (!controller) {
          resolve({ ok: false, reason: 'missing-controller' });
          return;
        }
        const nonce = Math.round(Math.random() * 10_000_000);
        const finish = (result) => {
          clearTimeout(timer);
          navigator.serviceWorker.removeEventListener('message', handleMessage);
          resolve(result);
        };
        const handleMessage = (event) => {
          const data = event.data;
          if (data?.type !== 'OPERATION_COMPLETED' || data.nonce !== nonce) {
            return;
          }
          if (data.error) {
            finish({ ok: false, nonce, error: String(data.error) });
            return;
          }
          finish({ ok: true, nonce, result: Boolean(data.result) });
        };
        const timer = setTimeout(() => finish({ ok: false, nonce, reason: 'timeout' }), timeoutMs);
        navigator.serviceWorker.addEventListener('message', handleMessage);
        controller.postMessage({ action: actionName, nonce });
      }),
    { action, timeoutMs: 15_000 },
  );
}

function assertNgswOperationSucceeded(action, result) {
  if (result.ok && result.result === true) {
    return;
  }
  throw new Error(`${action} did not complete successfully: ${JSON.stringify(result)}`);
}

async function serviceWorkerState(page) {
  return page
    .evaluate(async () => {
      const response = await fetch('/ngsw/state', { cache: 'no-store' });
      return response.ok ? response.text() : `status=${response.status}`;
    })
    .catch((error) => `unavailable: ${error instanceof Error ? error.message : String(error)}`);
}

async function screenshot(page, phase, route) {
  const outputPath = path.join(SCREENSHOT_DIR, `${phase}-${sanitizeRoute(route)}.png`);
  ensureDir(path.dirname(outputPath));
  await page.screenshot({ path: outputPath, fullPage: true });
  return path.relative(ARTIFACT_DIR, outputPath).replace(/\\/gu, '/');
}

async function verifyManifest(baseURL) {
  const api = await playwrightRequest.newContext({ baseURL });
  try {
    const response = await api.get('/manifest.webmanifest');
    if (!response.ok()) {
      throw new Error(`manifest.webmanifest returned ${response.status()}`);
    }
    const manifest = await response.json();
    const iconSizes = new Set((manifest.icons ?? []).map((icon) => String(icon.sizes)));
    const errors = [];
    if (!manifest.name || !manifest.short_name) errors.push('name and short_name are required');
    if (manifest.start_url !== '/') errors.push('start_url must be /');
    if (manifest.scope !== '/') errors.push('scope must be /');
    if (manifest.display !== 'standalone') errors.push('display must be standalone');
    if (!iconSizes.has('192x192')) errors.push('missing 192x192 icon');
    if (!iconSizes.has('512x512')) errors.push('missing 512x512 icon');

    const iconResults = [];
    for (const icon of manifest.icons ?? []) {
      const iconUrl = new URL(icon.src, `${baseURL}/`).pathname;
      const iconResponse = await api.get(iconUrl);
      iconResults.push({
        src: icon.src,
        sizes: icon.sizes,
        status: iconResponse.status(),
        contentType: iconResponse.headers()['content-type'] ?? '',
      });
      if (!iconResponse.ok()) {
        errors.push(`icon ${icon.src} returned ${iconResponse.status()}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }

    return { manifest, iconResults };
  } finally {
    await api.dispose();
  }
}

async function verifyOnlineRoutes(browser, baseURL, diagnostics) {
  const context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  attachPageDiagnostics(page, diagnostics, 'online-routes');
  const results = [];
  try {
    for (const route of ROUTES) {
      const response = await page.goto(`${baseURL}${route.path}`, { waitUntil: 'domcontentloaded' });
      if (!response?.ok()) {
        throw new Error(`online ${route.path} returned ${response?.status() ?? 'no response'}`);
      }
      await waitForAppReady(page);
      await assertRouteRendered(page, route);
      const title = await page.title();
      const screenshotPath = await screenshot(page, 'online', route.path);
      results.push({ route: route.path, status: response.status(), title, screenshot: screenshotPath });
    }
  } finally {
    await context.close();
  }
  return results;
}

async function verifyOfflineRoutes(browser, baseURL, diagnostics) {
  const context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  attachPageDiagnostics(page, diagnostics, 'offline-routes');
  const results = [];
  try {
    await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    const serviceWorker = await waitForServiceWorkerControl(page);
    const appConfigWarmup = await page.evaluate(async () => {
      const response = await fetch('/app-config.js', { cache: 'reload' });
      return { ok: response.ok, status: response.status };
    });
    if (!appConfigWarmup.ok) {
      throw new Error(`app-config.js warmup returned ${appConfigWarmup.status}`);
    }
    await screenshot(page, 'controlled', '/');
    await context.setOffline(true);
    for (const route of ROUTES) {
      await page.goto(`${baseURL}${route.path}`, { waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      await assertRouteRendered(page, route);
      const title = await page.title();
      const screenshotPath = await screenshot(page, 'offline', route.path);
      results.push({ route: route.path, title, screenshot: screenshotPath });
    }
    await context.setOffline(false);
    return { serviceWorker, appConfigWarmup, results };
  } finally {
    await context.setOffline(false).catch(() => {});
    await context.close();
  }
}

async function verifyUpgrade(browser, serverHandle, diagnostics) {
  const context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  attachPageDiagnostics(page, diagnostics, 'upgrade');
  try {
    await page.goto(`${serverHandle.baseURL}/`, { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    const serviceWorker = await waitForServiceWorkerControl(page);
    const releaseBefore = await page.locator('meta[name="pwa-shell-release"]').getAttribute('content');
    if (releaseBefore !== 'release-a') {
      throw new Error(`expected release-a before upgrade, received ${releaseBefore}`);
    }
    const beforeScreenshot = await screenshot(page, 'upgrade-before', '/');
    const stateBefore = await serviceWorkerState(page);

    serverHandle.switchRoot(RELEASE_B_DIR);
    const registrationUpdate = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
      return {
        installing: Boolean(registration?.installing),
        waiting: Boolean(registration?.waiting),
        active: registration?.active?.scriptURL ?? '',
      };
    });
    const checkResult = await sendNgswOperation(page, 'CHECK_FOR_UPDATES');
    assertNgswOperationSucceeded('CHECK_FOR_UPDATES', checkResult);
    const activateResult = await sendNgswOperation(page, 'ACTIVATE_UPDATE');
    assertNgswOperationSucceeded('ACTIVATE_UPDATE', activateResult);
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);

    let releaseAfter = await page.locator('meta[name="pwa-shell-release"]').getAttribute('content');
    if (releaseAfter !== 'release-b') {
      await page.close();
      const nextPage = await context.newPage();
      attachPageDiagnostics(nextPage, diagnostics, 'upgrade-new-client');
      await nextPage.goto(`${serverHandle.baseURL}/`, { waitUntil: 'domcontentloaded' });
      await waitForAppReady(nextPage);
      releaseAfter = await nextPage.locator('meta[name="pwa-shell-release"]').getAttribute('content');
      if (releaseAfter !== 'release-b') {
        throw new Error(`expected release-b after upgrade, received ${releaseAfter}`);
      }
      const afterScreenshot = await screenshot(nextPage, 'upgrade-after', '/');
      const stateAfter = await serviceWorkerState(nextPage);
      return {
        serviceWorker,
        releaseBefore,
        releaseAfter,
        registrationUpdate,
        checkResult,
        activateResult,
        stateBefore,
        stateAfter,
        screenshots: [beforeScreenshot, afterScreenshot],
      };
    }

    const afterScreenshot = await screenshot(page, 'upgrade-after', '/');
    const stateAfter = await serviceWorkerState(page);
    return {
      serviceWorker,
      releaseBefore,
      releaseAfter,
      registrationUpdate,
      checkResult,
      activateResult,
      stateBefore,
      stateAfter,
      screenshots: [beforeScreenshot, afterScreenshot],
    };
  } finally {
    await context.close();
  }
}

function failOnDiagnostics(diagnostics) {
  const blockingRequestFailures = diagnostics.requestFailures.filter(
    (failure) =>
      !/net::ERR_(?:INTERNET_DISCONNECTED|ABORTED|FAILED)/iu.test(failure.errorText) &&
      ['document', 'script', 'stylesheet'].includes(failure.resourceType),
  );
  const errors = [
    ...diagnostics.consoleErrors.map((item) => `console ${item.scope}: ${item.text}`),
    ...diagnostics.pageErrors.map((item) => `page ${item.scope}: ${item.message}`),
    ...blockingRequestFailures.map((item) => `request ${item.scope}: ${item.url} ${item.errorText}`),
  ];
  if (errors.length > 0) {
    throw new Error(`PWA shell diagnostics found ${errors.length} issue(s):\n${errors.join('\n')}`);
  }
}

async function main() {
  ensureDir(ARTIFACT_DIR);
  ensureDir(SCREENSHOT_DIR);
  fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
  ensureDir(TEMP_ROOT);

  const npm = npmCommand();
  runCommand('build', npm.command, [...npm.prefixArgs, 'run', 'build']);
  if (!fs.existsSync(path.join(DIST_DIR, 'ngsw-worker.js')) || !fs.existsSync(path.join(DIST_DIR, 'ngsw.json'))) {
    throw new Error(`Production build did not produce Angular service worker files under ${DIST_DIR}`);
  }

  copyRelease(DIST_DIR, RELEASE_A_DIR, 'release-a');
  copyRelease(DIST_DIR, RELEASE_B_DIR, 'release-b');

  const serverHandle = await startStaticServer(RELEASE_A_DIR);
  const diagnostics = { consoleErrors: [], pageErrors: [], requestFailures: [] };
  const startedAt = new Date().toISOString();
  let browser;
  try {
    browser = await chromium.launch({ headless: process.env.PWA_SHELL_HEADLESS !== '0' });
    const manifest = await verifyManifest(serverHandle.baseURL);
    const onlineRoutes = await verifyOnlineRoutes(browser, serverHandle.baseURL, diagnostics);
    const offlineRoutes = await verifyOfflineRoutes(browser, serverHandle.baseURL, diagnostics);
    const upgrade = await verifyUpgrade(browser, serverHandle, diagnostics);
    failOnDiagnostics(diagnostics);

    const summary = {
      schemaVersion: 1,
      taskId: '869dwc7wk',
      status: 'passed',
      startedAt,
      completedAt: new Date().toISOString(),
      baseURL: serverHandle.baseURL,
      routes: ROUTE_PATHS,
      manifest,
      onlineRoutes,
      offlineRoutes,
      upgrade,
      diagnostics,
      artifactDir: ARTIFACT_DIR,
    };
    writeArtifact('pwa-shell-report.json', `${JSON.stringify(summary, null, 2)}\n`);
    writeArtifact(
      'pwa-shell-summary.md',
      [
        '# PWA Shell Safety Report',
        '',
        `Task: 869dwc7wk`,
        `Status: passed`,
        `Routes: ${ROUTE_PATHS.join(', ')}`,
        `Service worker: ${offlineRoutes.serviceWorker.scriptURL}`,
        `Upgrade: ${upgrade.releaseBefore} -> ${upgrade.releaseAfter}`,
        `Screenshots: ${path.relative(ARTIFACT_DIR, SCREENSHOT_DIR).replace(/\\/gu, '/')}/`,
        '',
      ].join('\n'),
    );
    console.log(`[pwa-shell] passed; artifacts written to ${ARTIFACT_DIR}`);
  } catch (error) {
    const failure = {
      schemaVersion: 1,
      taskId: '869dwc7wk',
      status: 'failed',
      startedAt,
      completedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
      diagnostics,
      artifactDir: ARTIFACT_DIR,
    };
    writeArtifact('pwa-shell-report.json', `${JSON.stringify(failure, null, 2)}\n`);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
    await serverHandle.close();
    fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[pwa-shell] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
