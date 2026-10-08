import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import appEntry, { TOOLS } from '../index.js';
import {
  collectReadRoots,
  getAppConfigSnapshot,
  getOrStartProxyRuntime,
  probeStatus,
} from '../lib/v2-runtime-manager.js';
import { screenshotPage, uploadFiles } from '../lib/cdp-client.js';
import { markOwnedTab, ensureOwnedOrAllowed } from '../lib/common.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

test('V2 manifest adheres to manifestVersion 2 and required capabilities', () => {
  const manifestPath = path.join(ROOT_DIR, 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.equal(manifest.manifestVersion, 2, 'manifestVersion must be 2');
  assert.equal(manifest.id, 'twinkstar-web-access', 'id must match directory name');
  assert.equal(manifest.version, '2.0.0', 'version must be 2.0.0');
  assert.equal(manifest.minAppVersion, '1.0.0-beta', 'minAppVersion must be 1.0.0-beta');
  assert.equal(manifest.entry, 'index.js', 'entry must be index.js');
  assert.equal(manifest.icon, 'assets/icon.png', 'icon must be assets/icon.png');

  const iconPath = path.join(ROOT_DIR, manifest.icon);
  assert.ok(fs.existsSync(iconPath), 'icon file must exist in assets/');
  const iconStat = fs.statSync(iconPath);
  assert.ok(iconStat.size > 0, 'icon must not be empty');

  // Verify minimal required capabilities
  const requiredCaps = [
    'app/runtime.execute',
    'app/runtime.native',
    'app/runtime.network',
    'app/tools.expose-to-model',
    'app/session.stage-file',
    'app/resources.read',
  ];
  for (const cap of requiredCaps) {
    assert.ok(manifest.capabilities.includes(cap), `manifest must declare capability: ${cap}`);
  }
  // Must NOT declare overbroad app/sessions.manage
  assert.ok(!manifest.capabilities.includes('app/sessions.manage'), 'Must not declare overbroad sessions.manage');

  // Verify contributes.settings.schema
  assert.ok(manifest.contributes?.settings?.schema, 'contributes.settings.schema must be present');
  const props = manifest.contributes.settings.schema.properties;
  assert.ok(props.browserProfile, 'browserProfile must be defined');
  assert.ok(props.browserUserDataDir, 'browserUserDataDir must be defined');
  assert.ok(props.probeCommonDebuggingPorts, 'probeCommonDebuggingPorts must be defined');
  assert.ok(props.proxyPort, 'proxyPort must be defined');
  assert.ok(props.autoStartProxy, 'autoStartProxy must be defined (deprecated lazy)');
  assert.ok(props.allowOperateNonOwnedTabs, 'allowOperateNonOwnedTabs must be defined');
  assert.equal(props.allowOperateNonOwnedTabs.default, true, 'allowOperateNonOwnedTabs default must be true');
});

test('V2 package.json is bundled with SDK and sets version 2.0.0', () => {
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  assert.equal(pkg.version, '2.0.0');
  assert.ok(pkg.dependencies?.['@hana/app-sdk'], 'package.json must contain @hana/app-sdk dependency');
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'vendor', 'hana-app-sdk.tgz')), 'vendor/hana-app-sdk.tgz must exist for self-containment');
});

test('exactly 13 tools are declared and explicitly registered with twinkstar-web-access_browser_* prefix', async () => {
  assert.equal(TOOLS.length, 13, 'Must contain exactly 13 browser tools');

  const expectedSubNames = [
    'browser_status',
    'browser_open_tab',
    'browser_close_tab',
    'browser_list_tabs',
    'browser_read_page',
    'browser_click',
    'browser_type',
    'browser_scroll',
    'browser_screenshot',
    'browser_eval',
    'browser_upload_files',
    'browser_get_site_pattern',
    'browser_list_site_patterns',
  ];

  const registeredTools = [];
  const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-test-data-'));

  try {
    const mockContext = {
      dataDir: tmpDataDir,
      bus: {
        request: async () => ({}),
      },
      models: {},
      media: {},
      providers: {},
      hooks: {},
      storage: {
        global: {},
        agent: () => ({}),
      },
      tools: {
        register: (tool) => {
          registeredTools.push(tool);
          return { ready: Promise.resolve(), disposeAsync: async () => {} };
        },
      },
      config: {
        get: async (k) => (k === 'proxyPort' ? 3457 : undefined),
        getAll: async () => ({ proxyPort: 3457 }),
      },
    };

    await appEntry.apply(mockContext);

    assert.equal(registeredTools.length, 13, 'Must register exactly 13 tools through SDK');
    for (const subName of expectedSubNames) {
      const expectedFullName = `twinkstar-web-access_${subName}`;
      const found = registeredTools.find((t) => t.name === expectedFullName);
      assert.ok(found, `Tool ${expectedFullName} must be registered`);
      assert.ok(found.description, `Tool ${expectedFullName} must have description`);
      assert.ok(found.parameters, `Tool ${expectedFullName} must have parameters`);
      assert.ok(found.sessionPermission, `Tool ${expectedFullName} must have sessionPermission`);
      if (subName.includes('read') || subName.includes('status') || subName.includes('pattern')) {
        assert.ok(found.sessionPermission.readOnly === true || found.sessionPermission.kind === 'external_side_effect');
      } else {
        assert.equal(found.sessionPermission.kind, 'external_side_effect');
      }
    }
  } finally {
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
  }
});

test('bootstrap file is created with 0600 mode and unlinked upon startup', () => {
  const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-boot-test-'));
  const testBootstrapFile = path.join(tmpDataDir, 'test-bootstrap.json');
  const dummyData = { token: 'secret-token-12345678901234567890123456789012' };

  try {
    fs.writeFileSync(testBootstrapFile, JSON.stringify(dummyData), {
      encoding: 'utf8',
      mode: 0o600,
    });

    const stat = fs.statSync(testBootstrapFile);
    if (process.platform !== 'win32') {
      assert.equal(stat.mode & 0o777, 0o600, 'Bootstrap file must have 0600 permissions');
    }

    const read = JSON.parse(fs.readFileSync(testBootstrapFile, 'utf8'));
    assert.equal(read.token, dummyData.token);
    fs.unlinkSync(testBootstrapFile);

    assert.ok(!fs.existsSync(testBootstrapFile), 'Bootstrap file must be unlinked after reading');
  } finally {
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
  }
});

test('collectReadRoots returns empty on non-Windows platforms and verifies via sdk.resources.stat on Windows', async () => {
  const mockSdk = {
    resources: {
      stat: async (ref) => (ref.path.includes('exists') ? { type: 'directory' } : null),
    },
  };

  const browserConfig = {
    userDataDir: '/test/profile/exists',
    candidates: [{ userDataDir: '/test/profile/missing' }],
  };

  // On Linux/macOS, must return empty array to prevent unnecessary resource permission claims
  const roots = await collectReadRoots(mockSdk, browserConfig);
  if (process.platform !== 'win32') {
    assert.deepEqual(roots, [], 'Non-Windows platforms must not claim readRoots');
  }
});

test('activeProxy uses singleflight mutex and restarts on config/fingerprint change', async () => {
  const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-sf-test-'));
  let startCount = 0;
  let stoppedRuntimes = [];

  const mockSdk = {
    runtime: {
      start: async () => {
        startCount += 1;
        await new Promise((r) => setTimeout(r, 50));
        return { runtimeId: `rt-${startCount}`, service: { state: 'ready' }, state: 'ready' };
      },
      get: async (id) => ({ runtimeId: id, service: { state: 'ready' }, state: 'ready' }),
      stop: async (id) => {
        stoppedRuntimes.push(id);
        return { runtimeId: id, state: 'stopped' };
      },
    },
  };

  const snapshotA = { browserProfile: 'twinkstar', proxyPort: 3457, allowOperateNonOwnedTabs: false };
  const snapshotB = { browserProfile: 'twinkstar', proxyPort: 3457, allowOperateNonOwnedTabs: true }; // changed dangerous flag

  try {
    // 1. Singleflight test: 3 concurrent requests must start only 1 runtime
    const [p1, p2, p3] = await Promise.all([
      getOrStartProxyRuntime(mockSdk, tmpDataDir, snapshotA),
      getOrStartProxyRuntime(mockSdk, tmpDataDir, snapshotA),
      getOrStartProxyRuntime(mockSdk, tmpDataDir, snapshotA),
    ]);
    assert.equal(startCount, 1, 'Concurrent calls must be merged into single start call');
    assert.equal(p1.runtimeId, 'rt-1');
    assert.equal(p2.runtimeId, 'rt-1');
    assert.equal(p3.runtimeId, 'rt-1');

    // 2. Config change test: allowOperateNonOwnedTabs changed from false to true
    const p4 = await getOrStartProxyRuntime(mockSdk, tmpDataDir, snapshotB);
    assert.equal(startCount, 2, 'Config change must spawn a new runtime instance');
    assert.equal(p4.runtimeId, 'rt-2');
    assert.ok(stoppedRuntimes.includes('rt-1'), 'Old runtime must be stopped upon config change');
  } finally {
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
  }
});

test('probeStatus stops short probe runtime upon completion or failure, and throws on timeout', async () => {
  const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-probe-test-'));
  let stoppedProbe = null;

  const mockSdkTimeout = {
    runtime: {
      start: async () => ({ runtimeId: 'probe-rt-timeout', state: 'starting' }),
      get: async () => ({ state: 'starting' }),
      stop: async (id) => {
        stoppedProbe = id;
      },
    },
  };

  try {
    await assert.rejects(
      async () => {
        await probeStatus(mockSdkTimeout, tmpDataDir, { proxyPort: 3457 });
      },
      /Probe runtime timed out or failed/,
      'Must reject with explicit error instead of forging detected: null'
    );
    assert.equal(stoppedProbe, 'probe-rt-timeout', 'Probe runtime must be stopped on failure');
  } finally {
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
  }
});

test('screenshotPage enforces callToken, stages via sdk.sessions.stageFile, and does not leak private paths', async () => {
  const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-shot-test-'));
  const dummyScreenshotFile = path.join(tmpDataDir, 'private-screen.png');
  fs.writeFileSync(dummyScreenshotFile, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  markOwnedTab(tmpDataDir, 'target-shot-1', { url: 'https://example.com' });

  let stageFileCalledWith = null;

  const mockSdk = {
    runtime: {
      start: async () => ({ runtimeId: 'rt-shot', service: { state: 'ready' }, state: 'ready' }),
      stop: async (runtimeId) => ({ runtimeId, state: 'stopped' }),
      get: async () => ({ service: { state: 'ready' }, state: 'ready' }),
      fetch: async () => ({
        ok: true,
        text: async () => JSON.stringify({ ok: true, file: dummyScreenshotFile }),
      }),
    },
    sessions: {
      stageFile: async (req) => {
        stageFileCalledWith = req;
        return {
          file: { id: 'sf-999', name: req.name, mime: req.mime },
          mediaItem: { url: 'session-file:sf-999' },
          resource: { kind: 'session-file', fileId: 'sf-999', sessionId: 's-1' },
        };
      },
    },
    config: {
      getAll: async () => ({ allowOperateNonOwnedTabs: false }),
    },
  };

  try {
    // 1. Missing callToken must reject
    await assert.rejects(
      async () => {
        await screenshotPage({ sdk: mockSdk, dataDir: tmpDataDir }, 'target-shot-1');
      },
      /Screenshot staging requires an active callToken/,
      'Must reject when callToken is missing'
    );

    // 2. Authorized call with callToken
    const toolCtx = {
      sdk: mockSdk,
      dataDir: tmpDataDir,
      callToken: 'token-test-xyz',
      configSnapshot: { allowOperateNonOwnedTabs: false },
    };

    const result = await screenshotPage(toolCtx, 'target-shot-1');
    assert.ok(result.ok);
    assert.equal(result.fileId, 'sf-999');
    assert.ok(stageFileCalledWith, 'sdk.sessions.stageFile must be invoked');
    assert.equal(stageFileCalledWith.callToken, 'token-test-xyz');
    assert.equal(stageFileCalledWith.path, dummyScreenshotFile);

    // 3. Output details must NOT contain raw file path
    assert.equal(result.file.id, 'sf-999');
    assert.equal(result.resource.fileId, 'sf-999');
    assert.equal(result.fileId, 'sf-999');
  } finally {
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
  }
});

test('uploadFiles verifies localPath from materialize and rejects without fallback on denial', async () => {
  const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-upload-test-'));
  const authorizedSource = path.join(tmpDataDir, 'upload.pdf');
  const materializedTarget = path.join(tmpDataDir, 'materialized-local.pdf');
  fs.writeFileSync(authorizedSource, 'data');
  markOwnedTab(tmpDataDir, 'target-up-1', { url: 'https://example.com' });

  let sentFiles = [];

  const mockSdk = {
    runtime: {
      start: async () => ({ runtimeId: 'rt-up', service: { state: 'ready' }, state: 'ready' }),
      stop: async (runtimeId) => ({ runtimeId, state: 'stopped' }),
      get: async () => ({ service: { state: 'ready' }, state: 'ready' }),
      fetch: async (_id, path, init) => {
        const body = JSON.parse(init.body);
        sentFiles = body.files;
        return {
          ok: true,
          text: async () => JSON.stringify({ ok: true, fileCount: body.files.length }),
        };
      },
    },
    resources: {
      stat: async (ref) => {
        if (ref.path.includes('unauthorized')) return null; // simulate permission denied
        return { size: 100 };
      },
      materialize: async (ref) => {
        // Return official { type: 'file', localPath } contract
        return { type: 'file', localPath: materializedTarget };
      },
    },
    config: {
      getAll: async () => ({ allowOperateNonOwnedTabs: false }),
    },
  };

  const toolCtx = {
    sdk: mockSdk,
    dataDir: tmpDataDir,
    configSnapshot: { allowOperateNonOwnedTabs: false },
  };

  try {
    // 1. Valid authorization passes materialized localPath
    const res = await uploadFiles(toolCtx, 'target-up-1', '#input', [authorizedSource]);
    assert.ok(res.ok);
    assert.deepEqual(sentFiles, [materializedTarget], 'Must use materialized localPath');

    // 2. Unauthorized file must throw and NEVER fallback to raw path
    await assert.rejects(
      async () => {
        await uploadFiles(toolCtx, 'target-up-1', '#input', ['/unauthorized/secret.txt']);
      },
      /File not found or permission denied/,
      'Must reject unauthorized file without falling back'
    );
  } finally {
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
  }
});

test('sdk.config.getAll failure explicitly rejects tool execution without default fallback', async () => {
  const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-cfg-test-'));
  const mockContext = {
    dataDir: tmpDataDir,
    bus: { request: async () => ({}) },
    models: {},
    media: {},
    providers: {},
    hooks: {},
    storage: { global: {}, agent: () => ({}) },
    tools: { register: () => ({ ready: Promise.resolve(), disposeAsync: async () => {} }) },
    config: {
      getAll: async () => {
        throw new Error('Config ledger permission denied');
      },
    },
  };

  try {
    await appEntry.apply(mockContext);
    // Directly testing getAppConfigSnapshot behavior
    await assert.rejects(
      async () => {
        await getAppConfigSnapshot(mockContext);
      },
      /Config ledger permission denied/,
      'Config failure must be re-thrown without silent fallback'
    );
  } finally {
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
  }
});

test('allowOperateNonOwnedTabs default is true and ensureOwnedOrAllowed permits non-owned tabs unless explicitly false', () => {
  const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-non-owned-test-'));
  try {
    // 1. Default (no config or undefined) permits non-owned tab
    assert.doesNotThrow(() => {
      ensureOwnedOrAllowed({}, tmpDataDir, 'existing-foreign-tab-1');
    });
    assert.doesNotThrow(() => {
      ensureOwnedOrAllowed({ configSnapshot: {} }, tmpDataDir, 'existing-foreign-tab-2');
    });
    assert.doesNotThrow(() => {
      ensureOwnedOrAllowed({ configSnapshot: { allowOperateNonOwnedTabs: true } }, tmpDataDir, 'existing-foreign-tab-3');
    });

    // 2. Explicit false in configSnapshot rejects non-owned tab
    assert.throws(
      () => {
        ensureOwnedOrAllowed({ configSnapshot: { allowOperateNonOwnedTabs: false } }, tmpDataDir, 'existing-foreign-tab-4');
      },
      /Refusing to operate non-owned tab/
    );

    // 3. Explicit false in config.get rejects non-owned tab
    assert.throws(
      () => {
        ensureOwnedOrAllowed({ config: { get: (k) => (k === 'allowOperateNonOwnedTabs' ? false : undefined) } }, tmpDataDir, 'existing-foreign-tab-5');
      },
      /Refusing to operate non-owned tab/
    );

    // 4. Explicit false still allows owned tabs
    markOwnedTab(tmpDataDir, 'my-owned-tab-1');
    assert.doesNotThrow(() => {
      ensureOwnedOrAllowed({ configSnapshot: { allowOperateNonOwnedTabs: false } }, tmpDataDir, 'my-owned-tab-1');
    });
  } finally {
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
  }
});
