import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ensureProxy, stopProxy } from '../lib/ensure-proxy.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proxyPath = path.join(root, 'lib', 'proxy', 'cdp-proxy.mjs');
const token = 'a'.repeat(64);

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(url) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${url}/health`, {
        headers: { 'x-twinkstar-web-access-token': token },
      });
      if (response.ok) return response;
    } catch (error) {
      lastError = error;
    }
    await sleep(50);
  }
  throw lastError || new Error('Proxy health endpoint did not become ready.');
}

async function waitForExit(child) {
  await Promise.race([
    once(child, 'exit'),
    sleep(3000).then(() => { throw new Error('Proxy did not exit after shutdown.'); }),
  ]);
}

test('proxy rejects unauthenticated requests and accepts authenticated shutdown', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twinkstar-proxy-test-'));
  const port = await reservePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [proxyPath], {
    cwd: root,
    env: {
      ...process.env,
      CDP_PROXY_PORT: String(port),
      CDP_PROXY_TOKEN: token,
      CDP_PROXY_BROWSER_PROFILE: 'twinkstar',
      CDP_PROXY_BROWSER_USER_DATA_DIR: path.join(tempDir, 'profile'),
      CDP_PROXY_OWNED_TABS_FILE: path.join(tempDir, 'owned-tabs.json'),
      CDP_PROXY_DATA_DIR: tempDir,
      CDP_PROXY_CONFIG_FINGERPRINT: 'test-fingerprint',
    },
    stdio: 'ignore',
  });

  try {
    const health = await waitForHealth(url);
    const healthJson = await health.json();
    assert.equal(healthJson.status, 'ok');
    assert.equal(healthJson.auth, 'token');
    assert.equal(healthJson.ownedTabGuard, false, 'ownedTabGuard is false by default');

    const anonymous = await fetch(`${url}/health`);
    assert.equal(anonymous.status, 401);

    const shutdown = await fetch(`${url}/shutdown`, {
      method: 'POST',
      headers: { 'x-twinkstar-web-access-token': token },
    });
    assert.equal(shutdown.status, 200);
    await waitForExit(child);
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([once(child, 'exit'), sleep(1000)]);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('a browser tool can start the proxy on demand when eager startup is disabled', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twinkstar-on-demand-test-'));
  const port = await reservePort();
  const values = {
    proxyPort: port,
    autoStartProxy: false,
    browserProfile: 'twinkstar',
    browserUserDataDir: path.join(dataDir, 'profile'),
    probeCommonDebuggingPorts: false,
    allowOperateNonOwnedTabs: false,
  };
  const ctx = {
    dataDir,
    config: { get: (key) => values[key] },
    log: { info() {}, warn() {} },
  };

  try {
    const proxy = await ensureProxy(ctx);
    assert.equal(proxy.health.status, 'ok');
    assert.equal(proxy.health.auth, 'token');
    const result = await stopProxy(ctx);
    assert.equal(result.ok, true);
    assert.equal(result.stopped, true);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
