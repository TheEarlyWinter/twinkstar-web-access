import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const authToken = 'd'.repeat(64);
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ2kAAAAASUVORK5CYII=';

// A local protocol fixture, not a user browser. It implements just the CDP
// commands used below and a bounded RFC6455 text-frame transport with no deps.
async function createCdpFixture() {
  const calls = [];
  const pages = new Map([['foreign-tab', { targetId: 'foreign-tab', type: 'page', title: 'Private fixture', url: 'https://foreign.invalid/' }]]);
  const sockets = new Set();
  let nextId = 0;
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ Browser: 'Chromium/fixture', webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/devtools/browser/fixture` }));
  });
  function dispatch(message) {
    calls.push(message);
    if (message.method === 'Browser.getVersion') return { product: 'Chromium/fixture' };
    if (message.method === 'Target.createTarget') {
      const targetId = `owned-${++nextId}`;
      pages.set(targetId, { targetId, type: 'page', title: 'Fixture page', url: message.params.url });
      return { targetId };
    }
    if (message.method === 'Target.getTargets') return { targetInfos: [...pages.values()] };
    if (message.method === 'Target.attachToTarget') return { sessionId: `session-${message.params.targetId}` };
    if (message.method === 'Target.closeTarget') return { success: pages.delete(message.params.targetId) };
    if (message.method === 'Page.captureScreenshot') return { data: png };
    if (message.method === 'DOM.getDocument') return { root: { nodeId: 1 } };
    if (message.method === 'DOM.querySelector') return { nodeId: 2 };
    if (message.method === 'DOM.describeNode') return { node: { backendNodeId: 3 } };
    if (message.method === 'Runtime.evaluate') {
      const expr = message.params.expression;
      let value = 42;
      if (expr === 'document.readyState') value = 'complete';
      else if (expr === 'document.title') value = 'Fixture page';
      else if (expr === 'location.href') value = 'https://fixture.invalid/';
      else if (expr.includes('body.innerText')) value = { title: 'Fixture page', url: 'https://fixture.invalid/', text: 'Fixture text only' };
      else if (expr.includes('el.click()')) value = { clicked: true, tag: 'BUTTON', text: 'Fixture button' };
      else if (expr.includes('nativeSetter')) value = { typed: true, length: 7 };
      else if (expr.includes('window.scroll')) value = { ok: true };
      return { result: { type: typeof value, value } };
    }
    return {};
  }
  server.on('upgrade', (req, socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    let buffered = Buffer.alloc(0);
    socket.on('data', chunk => {
      buffered = Buffer.concat([buffered, chunk]);
      while (buffered.length >= 2) {
        const opcode = buffered[0] & 15;
        const masked = Boolean(buffered[1] & 128);
        let length = buffered[1] & 127;
        let start = 2;
        if (length === 126) {
          if (buffered.length < 4) return;
          length = buffered.readUInt16BE(2);
          start = 4;
        } else if (length === 127) {
          socket.destroy(new Error('Fixture frame exceeds budget'));
          return;
        }
        const maskStart = start;
        if (masked) start += 4;
        if (buffered.length < start + length) return;
        const payload = Buffer.from(buffered.subarray(start, start + length));
        if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= buffered[maskStart + (i % 4)];
        buffered = buffered.subarray(start + length);
        if (opcode === 8) { socket.end(Buffer.from([0x88, 0])); return; }
        if (opcode !== 1) continue;
        const message = JSON.parse(payload.toString());
        const response = Buffer.from(JSON.stringify({ id: message.id, result: dispatch(message) }));
        const header = response.length < 126 ? Buffer.from([0x81, response.length]) : Buffer.alloc(4);
        if (response.length >= 126) { header[0] = 0x81; header[1] = 126; header.writeUInt16BE(response.length, 2); }
        socket.write(Buffer.concat([header, response]));
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    port: server.address().port, calls,
    async close() { for (const socket of sockets) socket.destroy(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); },
  };
}

async function freePort() {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function healthReady(base, child) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error(`Proxy exited ${child.exitCode}`);
    try {
      const response = await fetch(`${base}/health`, { headers: { 'x-twinkstar-web-access-token': authToken }, signal: AbortSignal.timeout(500) });
      if (response.ok) return response.json();
    } catch {}
    await delay(50);
  }
  throw new Error('Proxy readiness deadline exceeded');
}

async function childExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([once(child, 'exit'), delay(3000).then(() => { throw new Error('Proxy exit deadline exceeded'); })]);
}

test('isolated CDP wire preserves authentication, tab guard, URL policy, screenshots and shutdown', { timeout: 20000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'twinkstar-wire-'));
  const fixture = await createCdpFixture();
  t.after(async () => { await fixture.close(); fs.rmSync(temp, { recursive: true, force: true }); });
  const profile = path.join(temp, 'profile');
  fs.mkdirSync(profile);
  fs.writeFileSync(path.join(profile, 'DevToolsActivePort'), `${fixture.port}\n/devtools/browser/fixture\n`);
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const bootstrap = path.join(temp, 'bootstrap-proxy-wire.json');
  fs.writeFileSync(bootstrap, JSON.stringify({
    port, token: authToken, ownedTabsFile: path.join(temp, 'owned-tabs.json'), pluginDataDir: temp,
    allowNonOwnedTabs: false, configFingerprint: 'wire-fixture',
    browserConfig: { profile: 'chrome', userDataDir: profile, probeCommonDebuggingPorts: false,
      candidates: [{ id: 'chrome', label: 'Fixture Chromium', userDataDir: profile, source: 'test' }] },
  }), { mode: 0o600 });
  if (process.platform !== 'win32') assert.equal(fs.statSync(bootstrap).mode & 0o777, 0o600);
  const argv = [path.join(root, 'lib/proxy/cdp-proxy.mjs'), '--bootstrap', bootstrap];
  assert.equal(argv.some(arg => arg.includes(authToken)), false);
  const child = spawn(process.execPath, argv, {
    cwd: temp,
    env: { ...process.env, HOME: path.join(temp, 'redirected-runtime-home') },
    stdio: 'ignore',
  });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill(); await childExit(child); });
  const health = await healthReady(base, child);
  assert.equal(fs.existsSync(bootstrap), false, 'the real worker must consume and unlink its bootstrap');
  assert.equal(health.ownedTabGuard, true);
  assert.equal(health.connected, false, 'health must not attach to a browser session');
  assert.equal(fixture.calls.length, 0);
  assert.equal((await fetch(`${base}/health`)).status, 401);
  assert.equal((await fetch(`${base}/health`, { headers: { 'x-twinkstar-web-access-token': 'e'.repeat(64) } })).status, 401);
  async function request(endpoint, options = {}) {
    return fetch(base + endpoint, { ...options, headers: { ...options.headers, 'x-twinkstar-web-access-token': authToken }, signal: AbortSignal.timeout(3000) });
  }
  const before = fixture.calls.length;
  const denied = await request('/eval?target=foreign-tab', { method: 'POST', body: 'document.title' });
  assert.equal(denied.status, 500);
  assert.match((await denied.json()).error, /non-owned/);
  assert.equal(fixture.calls.slice(before).filter(call => call.method === 'Runtime.evaluate').length, 0);
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'chrome://settings', 'data:text/html,private']) {
    const response = await request(`/new?url=${encodeURIComponent(url)}`);
    assert.equal(response.ok, false);
  }
  assert.equal(fixture.calls.filter(call => call.method === 'Target.createTarget').length, 0);
  const created = await (await request('/new?url=about%3Ablank')).json();
  assert.equal(created.targetId, 'owned-1');
  assert.equal(fixture.calls.find(call => call.method === 'Target.createTarget').params.background, true);
  fs.writeFileSync(path.join(temp, 'owned-tabs.json'), JSON.stringify({ [created.targetId]: { targetId: created.targetId } }));
  const listed = await (await request('/targets')).json();
  assert.deepEqual(listed.map(page => page.targetId), [created.targetId]);
  const info = await (await request(`/info?target=${created.targetId}`)).json();
  assert.equal(info.title, 'Fixture page');
  const text = await (await request(`/extractText?target=${created.targetId}`)).json();
  assert.equal(text.text, 'Fixture text only');
  const evaluated = await (await request(`/eval?target=${created.targetId}`, { method: 'POST', body: '6 * 7' })).json();
  assert.equal(evaluated.value, 42);
  const clicked = await (await request(`/click?target=${created.targetId}`, { method: 'POST', body: '#fixture-button' })).json();
  assert.equal(clicked.clicked, true);
  const typed = await (await request(`/type?target=${created.targetId}`, { method: 'POST', body: JSON.stringify({ selector: '#fixture-input', text: 'fixture', submit: false }) })).json();
  assert.equal(typed.typed, true);
  assert.equal((await (await request(`/scroll?target=${created.targetId}&direction=bottom`)).json()).ok, true);
  const uploadFile = path.join(temp, 'fixture-upload.txt');
  fs.writeFileSync(uploadFile, 'Synthetic test file only');
  const uploaded = await (await request(`/setFiles?target=${created.targetId}`, { method: 'POST', body: JSON.stringify({ selector: '#fixture-file', files: [uploadFile] }) })).json();
  assert.equal(uploaded.fileCount, 1);
  assert.deepEqual(fixture.calls.find(call => call.method === 'DOM.setFileInputFiles').params, { files: [uploadFile], backendNodeId: 3 });
  const shot = await (await request(`/screenshot?target=${created.targetId}`)).json();
  assert.equal(path.dirname(shot.file), path.join(temp, 'screenshots'));
  assert.deepEqual(fs.readFileSync(shot.file), Buffer.from(png, 'base64'));
  assert.equal((await (await request('/close?target=foreign-tab')).json()).error.includes('non-owned'), true);
  assert.equal((await (await request(`/close?target=${created.targetId}`)).json()).success, true);
  assert.equal((await request('/shutdown')).status, 405);
  const exit = childExit(child);
  assert.equal((await request('/shutdown', { method: 'POST' })).status, 200);
  await exit;
  assert.equal(child.exitCode, 0);
});
