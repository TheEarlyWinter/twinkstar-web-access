import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  createProxyConfigFingerprint,
  getProxyToken,
  ownedTabsFile,
  proxyAuthHeaders,
} from './common.js';
import { resolveBrowserConfig } from './browser-config.js';

let activeProxy = null;
let startingPromise = null;

export async function getAppConfigSnapshot(sdk) {
  if (typeof sdk?.config?.getAll !== 'function') {
    throw new Error('sdk.config.getAll is required but unavailable on SDK context.');
  }
  const all = await sdk.config.getAll();
  if (!all || typeof all !== 'object') {
    throw new Error('sdk.config.getAll failed to return valid configuration object.');
  }
  return all;
}

export async function collectReadRoots(sdk, browserConfig) {
  if (process.platform !== 'win32') {
    return [];
  }
  if (!browserConfig || !Array.isArray(browserConfig.candidates)) return [];

  const candidateDirs = new Set();
  if (browserConfig.userDataDir) {
    candidateDirs.add(path.resolve(browserConfig.userDataDir));
  }
  for (const candidate of browserConfig.candidates) {
    if (candidate.userDataDir) {
      candidateDirs.add(path.resolve(candidate.userDataDir));
    }
  }

  const authorizedRoots = [];
  for (const dir of candidateDirs) {
    if (typeof sdk?.resources?.stat === 'function') {
      const stat = await sdk.resources.stat({ kind: 'local-file', path: dir });
      if (stat && (stat.isDirectory === true || stat.type === 'directory' || stat.size !== undefined)) {
        authorizedRoots.push(dir);
      }
    } else {
      authorizedRoots.push(dir);
    }
  }

  return authorizedRoots.slice(0, 64);
}

async function waitForServiceReady(sdk, runtimeId, port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const info = await sdk.runtime.get(runtimeId);
    if (!info) {
      throw new Error(`Managed runtime ${runtimeId} not found.`);
    }
    if (info.state === 'failed' || info.state === 'exited' || info.state === 'stopped') {
      throw new Error(`Managed runtime exited prematurely with state: ${info.state}`);
    }
    if (info.service?.state === 'ready') {
      return info;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for managed service on port ${port} to become ready.`);
}

export async function getOrStartProxyRuntime(sdk, dataDir, snapshot) {
  const browser = resolveBrowserConfig({
    profile: snapshot?.browserProfile,
    userDataDir: snapshot?.browserUserDataDir,
    probeCommonDebuggingPorts: snapshot?.probeCommonDebuggingPorts !== false,
  });
  const fingerprint = createProxyConfigFingerprint(browser, snapshot?.allowOperateNonOwnedTabs !== false);
  const port = Number(snapshot?.proxyPort || 3457);
  while (startingPromise) {
    const current = startingPromise;
    const proxy = await current;
    if (proxy.configFingerprint === fingerprint && proxy.port === port) return proxy;
  }
  const current = startOrReuseProxyRuntime(sdk, dataDir, snapshot);
  startingPromise = current;
  try {
    return await current;
  } finally {
    if (startingPromise === current) startingPromise = null;
  }
}

async function startOrReuseProxyRuntime(sdk, dataDir, snapshot) {
  if (!dataDir) throw new Error('Twinkstar Web Access requires a valid data directory.');

  const browserConfig = resolveBrowserConfig({
    profile: snapshot?.browserProfile,
    userDataDir: snapshot?.browserUserDataDir,
    probeCommonDebuggingPorts: snapshot?.probeCommonDebuggingPorts !== false,
  });

  const port = Number(snapshot?.proxyPort || process.env.CDP_PROXY_PORT || 3457);
  const allowNonOwnedTabs = snapshot?.allowOperateNonOwnedTabs !== false;
  const configFingerprint = createProxyConfigFingerprint(browserConfig, allowNonOwnedTabs);

  if (activeProxy) {
    if (activeProxy.configFingerprint === configFingerprint && activeProxy.port === port) {
      try {
        const info = await sdk.runtime.get(activeProxy.runtimeId);
        if (info?.service?.state === 'ready') return activeProxy;
        if (info && !['failed', 'exited', 'stopped'].includes(info.state)) {
          await sdk.runtime.stop(activeProxy.runtimeId);
        }
        activeProxy = null;
      } catch (error) {
        // A failed authorization/stop must not launch a replacement runtime.
        throw error;
      }
    } else {
      await sdk.runtime.stop(activeProxy.runtimeId);
      activeProxy = null;
    }
  }

  const launchPromise = (async () => {
    let bootstrapFile = null;
    let runtimeId = null;
    try {
      const readRoots = await collectReadRoots(sdk, browserConfig);
      const token = getProxyToken(dataDir);
      const tabsFile = ownedTabsFile(dataDir);

      fs.mkdirSync(dataDir, { recursive: true });
      const bootstrapId = crypto.randomUUID();
      bootstrapFile = path.join(dataDir, `bootstrap-proxy-${bootstrapId}.json`);

      const bootstrapData = {
        port,
        token,
        ownedTabsFile: tabsFile,
        pluginDataDir: dataDir,
        allowNonOwnedTabs,
        configFingerprint,
        browserConfig,
      };

      fs.writeFileSync(bootstrapFile, JSON.stringify(bootstrapData), {
        encoding: 'utf8',
        mode: 0o600,
      });

      const runtimeInfo = await sdk.runtime.start({
        runtime: 'node',
        entry: 'lib/proxy/cdp-proxy.mjs',
        args: ['--bootstrap', bootstrapFile],
        profile: 'native',
        network: 'external',
        readRoots: readRoots.length > 0 ? readRoots : undefined,
        service: {
          port,
          readyMarker: 'TWINKSTAR_PROXY_READY',
          id: 'cdp-proxy',
        },
      });

      runtimeId = runtimeInfo.runtimeId;
      await waitForServiceReady(sdk, runtimeId, port);

      activeProxy = {
        runtimeId,
        port,
        token,
        configFingerprint,
        headers: proxyAuthHeaders(token),
        browserConfig,
        allowNonOwnedTabs,
      };

      return activeProxy;
    } catch (error) {
      if (runtimeId) {
        try {
          await sdk.runtime.stop(runtimeId);
        } catch {}
      }
      activeProxy = null;
      throw error;
    } finally {
      if (bootstrapFile) {
        try {
          if (fs.existsSync(bootstrapFile)) fs.unlinkSync(bootstrapFile);
        } catch {}
      }
    }
  })();

  return await launchPromise;
}

export async function fetchProxy(sdk, dataDir, snapshot, servicePath, init = {}) {
  const proxy = await getOrStartProxyRuntime(sdk, dataDir, snapshot);
  const res = await sdk.runtime.fetch(proxy.runtimeId, servicePath, {
    ...init,
    headers: {
      ...proxy.headers,
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(data?.error || data?.raw || `Proxy returned HTTP ${res.status}`);
  }

  return data;
}

export async function probeStatus(sdk, dataDir, snapshot) {
  const browserConfig = resolveBrowserConfig({
    profile: snapshot?.browserProfile,
    userDataDir: snapshot?.browserUserDataDir,
    probeCommonDebuggingPorts: snapshot?.probeCommonDebuggingPorts !== false,
  });
  const port = Number(snapshot?.proxyPort || 3457);
  const allowNonOwnedTabs = snapshot?.allowOperateNonOwnedTabs !== false;
  const configFingerprint = createProxyConfigFingerprint(browserConfig, allowNonOwnedTabs);

  if (activeProxy && activeProxy.configFingerprint === configFingerprint && activeProxy.port === port) {
    try {
      const info = await sdk.runtime.get(activeProxy.runtimeId);
      if (info?.service?.state === 'ready') {
        return await fetchProxy(sdk, dataDir, snapshot, '/status');
      }
    } catch {}
  }

  const readRoots = await collectReadRoots(sdk, browserConfig);
  fs.mkdirSync(dataDir, { recursive: true });
  const probeId = crypto.randomUUID();
  const resultFile = path.join(dataDir, `probe-result-${probeId}.json`);
  const bootstrapFile = path.join(dataDir, `bootstrap-probe-${probeId}.json`);

  const bootstrapData = {
    browserConfig,
    proxyPort: port,
    resultFile,
  };

  fs.writeFileSync(bootstrapFile, JSON.stringify(bootstrapData), {
    encoding: 'utf8',
    mode: 0o600,
  });

  let probeRuntimeId = null;
  try {
    const runtimeInfo = await sdk.runtime.start({
      runtime: 'node',
      entry: 'lib/probe/status-probe.mjs',
      args: ['--bootstrap', bootstrapFile],
      profile: 'native',
      network: 'external',
      readRoots: readRoots.length > 0 ? readRoots : undefined,
    });
    probeRuntimeId = runtimeInfo.runtimeId;

    const deadline = Date.now() + 8000;
    let probeCompleted = false;

    while (Date.now() < deadline) {
      if (fs.existsSync(resultFile)) {
        try {
          const raw = fs.readFileSync(resultFile, 'utf8');
          const parsed = JSON.parse(raw);
          probeCompleted = true;
          return parsed;
        } catch {}
      }
      const stateInfo = await sdk.runtime.get(probeRuntimeId);
      if (stateInfo && (stateInfo.state === 'exited' || stateInfo.state === 'stopped' || stateInfo.state === 'failed')) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    if (!probeCompleted) {
      if (fs.existsSync(resultFile)) {
        const raw = fs.readFileSync(resultFile, 'utf8');
        return JSON.parse(raw);
      }
      throw new Error(`Probe runtime timed out or failed to detect endpoint on port ${port}.`);
    }
  } finally {
    if (probeRuntimeId) {
      try {
        await sdk.runtime.stop(probeRuntimeId);
      } catch {}
    }
    try {
      if (fs.existsSync(bootstrapFile)) fs.unlinkSync(bootstrapFile);
    } catch {}
    try {
      if (fs.existsSync(resultFile)) fs.unlinkSync(resultFile);
    } catch {}
  }
}

export async function stopProxyRuntime(sdk) {
  if (!activeProxy) return { stopped: false, reason: 'Proxy is not running.' };
  try {
    await sdk.runtime.stop(activeProxy.runtimeId);
    activeProxy = null;
    return { stopped: true };
  } catch (error) {
    activeProxy = null;
    return { stopped: false, reason: error?.message || String(error) };
  }
}
