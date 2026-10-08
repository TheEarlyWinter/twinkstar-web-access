import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createProxyConfigFingerprint,
  getProxyPort,
  getProxyToken,
  httpJson,
  ownedTabsFile,
  proxyAuthHeaders,
} from './common.js';
import { getBrowserConfig } from './browser-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROXY_SCRIPT = path.join(__dirname, 'proxy', 'cdp-proxy.mjs');
const API_VERSION = 1;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function proxyRuntimeOptions(ctxLike) {
  const browser = getBrowserConfig(ctxLike);
  const allowOperateNonOwnedTabs = ctxLike?.config?.get?.('allowOperateNonOwnedTabs') !== false;
  const token = getProxyToken(ctxLike?.dataDir);
  return {
    browser,
    allowOperateNonOwnedTabs,
    token,
    headers: proxyAuthHeaders(token),
    fingerprint: createProxyConfigFingerprint(browser, allowOperateNonOwnedTabs),
  };
}

function isCompatibleHealth(health, fingerprint) {
  return health?.status === 'ok'
    && health?.auth === 'token'
    && health?.apiVersion === API_VERSION
    && health?.configFingerprint === fingerprint;
}

async function readHealth(base, headers) {
  try {
    return await httpJson(`${base}/health`, { headers });
  } catch {
    return null;
  }
}

function startProxyDetached(port, runtime, ctxLike) {
  const logFile = path.join(os.tmpdir(), 'twinkstar-web-access-proxy.log');
  const fd = fs.openSync(logFile, 'a');
  const child = spawn(process.execPath, [PROXY_SCRIPT], {
    detached: true,
    stdio: ['ignore', fd, fd],
    env: {
      ...process.env,
      CDP_PROXY_PORT: String(port),
      CDP_PROXY_TOKEN: runtime.token,
      CDP_PROXY_BROWSER_PROFILE: runtime.browser.profile,
      CDP_PROXY_BROWSER_USER_DATA_DIR: runtime.browser.userDataDir || '',
      CDP_PROXY_PROBE_COMMON_PORTS: runtime.browser.probeCommonDebuggingPorts ? '1' : '0',
      CDP_PROXY_OWNED_TABS_FILE: ownedTabsFile(ctxLike.dataDir),
      CDP_PROXY_DATA_DIR: ctxLike.dataDir,
      CDP_PROXY_ALLOW_NON_OWNED_TABS: runtime.allowOperateNonOwnedTabs ? '1' : '0',
      CDP_PROXY_CONFIG_FINGERPRINT: runtime.fingerprint,
    },
    windowsHide: true,
  });
  child.unref();
  fs.closeSync(fd);
  ctxLike?.log?.info?.(`Started Twinkstar CDP proxy on port ${port}. Log: ${logFile}`);
}

function proxyResult(port, base, runtime, health) {
  return {
    port,
    base,
    headers: runtime.headers,
    health,
    browser: {
      profile: runtime.browser.profile,
      label: runtime.browser.profile === 'auto' ? 'Automatic Chromium discovery' : runtime.browser.candidates[0]?.label || 'Chromium Browser',
    },
  };
}

export async function ensureProxy(ctxLike) {
  if (!ctxLike?.dataDir) throw new Error('Twinkstar Web Access requires a plugin data directory.');
  const port = getProxyPort(ctxLike);
  const base = `http://127.0.0.1:${port}`;
  const runtime = proxyRuntimeOptions(ctxLike);
  const existingHealth = await readHealth(base, runtime.headers);

  if (isCompatibleHealth(existingHealth, runtime.fingerprint)) {
    return proxyResult(port, base, runtime, existingHealth);
  }

  if (existingHealth) {
    throw new Error(`A different or stale Twinkstar Web Access proxy is already using port ${port}. Reload the plugin after it exits, or choose another proxy port.`);
  }

  startProxyDetached(port, runtime, ctxLike);
  for (let attempt = 0; attempt < 15; attempt += 1) {
    await sleep(1000);
    const health = await readHealth(base, runtime.headers);
    if (isCompatibleHealth(health, runtime.fingerprint)) {
      return proxyResult(port, base, runtime, health);
    }
    if (health) {
      throw new Error(`A different or stale proxy claimed port ${port} while Twinkstar Web Access was starting. Choose another proxy port and retry.`);
    }
  }

  throw new Error('Twinkstar CDP proxy did not start. Confirm that the selected proxy port is free and that Node.js 22 or newer is available.');
}

async function waitForProxyStop(base, headers) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    await sleep(100);
    if (!await readHealth(base, headers)) return true;
  }
  return false;
}

export async function stopProxy(ctxLike) {
  if (!ctxLike?.dataDir) return { stopped: false, reason: 'plugin data directory unavailable' };
  const port = getProxyPort(ctxLike);
  const base = `http://127.0.0.1:${port}`;
  const runtime = proxyRuntimeOptions(ctxLike);
  const health = await readHealth(base, runtime.headers);
  if (!isCompatibleHealth(health, runtime.fingerprint)) {
    return { stopped: false, reason: 'no compatible proxy is running' };
  }
  const result = await httpJson(`${base}/shutdown`, {
    method: 'POST',
    headers: runtime.headers,
  });
  const stopped = await waitForProxyStop(base, runtime.headers);
  return {
    ...result,
    stopped,
    ...(stopped ? {} : { reason: 'proxy did not stop before the timeout' }),
  };
}
