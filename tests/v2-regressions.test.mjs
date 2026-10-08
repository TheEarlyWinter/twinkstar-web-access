import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getOrStartProxyRuntime, stopProxyRuntime } from '../lib/v2-runtime-manager.js';
import { screenshotPage } from '../lib/cdp-client.js';
import { markOwnedTab } from '../lib/common.js';
import * as screenshotTool from '../tools/chrome_screenshot.js';

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'twinkstar-v2-regression-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('different configurations arriving during startup get separate serialized generations', async t => {
  const dataDir = tempDir(t);
  const calls = [];
  let releaseFirst;
  const gate = new Promise(resolve => { releaseFirst = resolve; });
  let started = 0;
  const sdk = { runtime: {
    async start(input) {
      const id = `generation-${++started}`;
      calls.push(['start', input.service.port]);
      if (started === 1) await gate;
      return { runtimeId: id, state: 'starting', service: { state: 'pending' } };
    },
    async get(id) { return { runtimeId: id, state: 'ready', service: { state: 'ready' } }; },
    async stop(id) { calls.push(['stop', id]); return { runtimeId: id, state: 'stopped' }; },
  } };
  t.after(() => stopProxyRuntime(sdk));
  const first = getOrStartProxyRuntime(sdk, dataDir, { proxyPort: 41001, probeCommonDebuggingPorts: false });
  const second = getOrStartProxyRuntime(sdk, dataDir, { proxyPort: 41002, probeCommonDebuggingPorts: false });
  releaseFirst();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.port, 41001);
  assert.equal(b.port, 41002);
  assert.deepEqual(calls, [['start', 41001], ['stop', 'generation-1'], ['start', 41002]]);
  assert.equal(fs.readdirSync(dataDir).some(name => name.startsWith('bootstrap-')), false);
});

test('runtime ready does not mean its pending service is ready', async t => {
  const dataDir = tempDir(t);
  let gets = 0;
  const sdk = { runtime: {
    async start(input) {
      const bootstrap = JSON.parse(fs.readFileSync(input.args[1], 'utf8'));
      assert.equal(input.args.some(arg => arg.includes(bootstrap.token)), false);
      return { runtimeId: 'pending-service', state: 'ready', service: { state: 'pending' } };
    },
    async get(id) { return { runtimeId: id, state: 'ready', service: { state: ++gets === 1 ? 'pending' : 'ready' } }; },
    async stop(id) { return { runtimeId: id, state: 'stopped' }; },
  } };
  t.after(() => stopProxyRuntime(sdk));
  await getOrStartProxyRuntime(sdk, dataDir, { proxyPort: 41003, probeCommonDebuggingPorts: false });
  assert.ok(gets >= 2, 'must wait for service.state, not merely runtime.state');
});

test('screenshot requires a bound invocation before starting any runtime', async t => {
  const dataDir = tempDir(t);
  markOwnedTab(dataDir, 'owned-test', {});
  let starts = 0;
  const sdk = { runtime: { start: async () => { starts++; throw new Error('should not start'); } }, sessions: { stageFile: async () => ({}) } };
  await assert.rejects(screenshotPage({ sdk, dataDir, config: { get: () => false } }, 'owned-test'), /callToken/);
  assert.equal(starts, 0);
});

test('screenshot tool delivers the host receipt without malformed private media paths', async t => {
  const dataDir = tempDir(t);
  markOwnedTab(dataDir, 'owned-test', {});
  const privateShot = path.join(dataDir, 'screenshots', 'shot-test.png');
  const sdk = {
    runtime: {
      async start() { return { runtimeId: 'shot-runtime', state: 'ready', service: { state: 'ready' } }; },
      async get(id) { return { runtimeId: id, state: 'ready', service: { state: 'ready' } }; },
      async stop(id) { return { runtimeId: id, state: 'stopped' }; },
      async fetch() { return new Response(JSON.stringify({ ok: true, file: privateShot })); },
    },
    sessions: { async stageFile(input) {
      assert.equal(input.callToken, 'fixture-host-call');
      return { file: { id: 'fixture-file', name: 'shot.png' }, mediaItem: { id: 'fixture-media' }, resource: { kind: 'session-file', fileId: 'fixture-file', sessionId: 'fixture-session' } };
    } },
  };
  t.after(() => stopProxyRuntime(sdk));
  const result = await screenshotTool.execute({ targetId: 'owned-test' }, { sdk, dataDir, callToken: 'fixture-host-call', configSnapshot: { proxyPort: 41004, probeCommonDebuggingPorts: false }, config: { get: () => false } });
  assert.equal(result.details.fileId, 'fixture-file');
  assert.equal(JSON.stringify(result).includes(privateShot), false);
  assert.equal(result.details.media, undefined);
  assert.equal(result.details.resource.sessionId, 'fixture-session');
});
