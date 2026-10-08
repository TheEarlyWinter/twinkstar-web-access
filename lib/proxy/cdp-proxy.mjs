#!/usr/bin/env node
import { timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { URL } from 'node:url';
import { PROXY_AUTH_HEADER, readOwnedTabsFile } from '../common.js';
import { discoverBrowserEndpoint, resolveBrowserConfig } from '../browser-config.js';

let bootstrapData = null;
const bootstrapArgIndex = process.argv.indexOf('--bootstrap');
if (bootstrapArgIndex !== -1 && process.argv[bootstrapArgIndex + 1]) {
  const bootstrapFile = process.argv[bootstrapArgIndex + 1];
  try {
    const raw = fs.readFileSync(bootstrapFile, 'utf8');
    bootstrapData = JSON.parse(raw);
  } catch (err) {
    console.error(`[twinkstar-web-access] Failed to read bootstrap file: ${err?.message || err}`);
    process.exit(1);
  } finally {
    try {
      fs.unlinkSync(bootstrapFile);
    } catch {}
  }
}

const PORT = Number.parseInt(bootstrapData?.port || process.env.CDP_PROXY_PORT || '3457', 10);
const PROXY_TOKEN = String(bootstrapData?.token || process.env.CDP_PROXY_TOKEN || '');
const OWNED_TABS_FILE = String(bootstrapData?.ownedTabsFile || process.env.CDP_PROXY_OWNED_TABS_FILE || '');
const PLUGIN_DATA_DIR = String(bootstrapData?.pluginDataDir || process.env.CDP_PROXY_DATA_DIR || '');
const ALLOW_NON_OWNED_TABS = bootstrapData
  ? (bootstrapData.allowNonOwnedTabs !== false)
  : (process.env.CDP_PROXY_ALLOW_NON_OWNED_TABS !== '0' && process.env.CDP_PROXY_ALLOW_NON_OWNED_TABS !== 'false');
const CONFIG_FINGERPRINT = String(bootstrapData?.configFingerprint || process.env.CDP_PROXY_CONFIG_FINGERPRINT || '');
const API_VERSION = 1;
const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024;

if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  console.error('[twinkstar-web-access] Invalid CDP proxy port.');
  process.exit(1);
}
if (!/^[a-f0-9]{64}$/i.test(PROXY_TOKEN)) {
  console.error('[twinkstar-web-access] Missing or invalid proxy authentication token.');
  process.exit(1);
}
if (!OWNED_TABS_FILE || !PLUGIN_DATA_DIR) {
  console.error('[twinkstar-web-access] Missing plugin-owned storage paths.');
  process.exit(1);
}

const BROWSER_CONFIG = bootstrapData?.browserConfig || resolveBrowserConfig({
  profile: process.env.CDP_PROXY_BROWSER_PROFILE || 'twinkstar',
  userDataDir: process.env.CDP_PROXY_BROWSER_USER_DATA_DIR || '',
  probeCommonDebuggingPorts: process.env.CDP_PROXY_PROBE_COMMON_PORTS === '1',
});

let ws = null;
let cmdId = 0;
let chromePort = null;
let chromeEndpoint = null;
let browserProduct = null;
let connectingPromise = null;
const pending = new Map();
const sessions = new Map();

const WS = globalThis.WebSocket;
if (typeof WS === 'undefined') {
  console.error('[twinkstar-web-access] Node.js 22 or newer with the built-in WebSocket API is required.');
  process.exit(1);
}

function socketIsOpen() {
  return !!ws && (ws.readyState === WS.OPEN || ws.readyState === 1);
}

function rejectPending(reason) {
  for (const { reject, timer } of pending.values()) {
    clearTimeout(timer);
    reject(new Error(reason));
  }
  pending.clear();
}

function hasValidToken(req) {
  const raw = req.headers[PROXY_AUTH_HEADER];
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  if (typeof candidate !== 'string' || candidate.length !== PROXY_TOKEN.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(PROXY_TOKEN));
}

function configuredBrowserSummary(endpoint) {
  if (!endpoint) return null;
  return {
    browser: endpoint.browser,
    source: endpoint.source,
    port: endpoint.port,
  };
}

async function healthPayload() {
  const discovered = chromeEndpoint || await discoverBrowserEndpoint(BROWSER_CONFIG);
  return {
    status: 'ok',
    apiVersion: API_VERSION,
    auth: 'token',
    configFingerprint: CONFIG_FINGERPRINT,
    connected: socketIsOpen(),
    sessions: sessions.size,
    browser: {
      profile: BROWSER_CONFIG.profile,
      detected: configuredBrowserSummary(discovered),
      product: browserProduct,
    },
    ownedTabGuard: !ALLOW_NON_OWNED_TABS,
  };
}

async function getWebSocketUrl(port, wsPath) {
  if (wsPath) return `ws://127.0.0.1:${port}${wsPath}`;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    const data = await res.json();
    if (data.webSocketDebuggerUrl) return data.webSocketDebuggerUrl;
  } catch {}
  return `ws://127.0.0.1:${port}/devtools/browser`;
}

async function openWebSocket(endpoint) {
  const wsUrl = await getWebSocketUrl(endpoint.port, endpoint.wsPath);
  return new Promise((resolve, reject) => {
    ws = new WS(wsUrl);

    const onOpen = () => {
      cleanupStartupListeners();
      resolve();
    };
    const onError = (error) => {
      cleanupStartupListeners();
      ws = null;
      chromePort = null;
      chromeEndpoint = null;
      reject(new Error(error?.message || 'WebSocket connect failed'));
    };
    const onClose = () => {
      ws = null;
      chromePort = null;
      chromeEndpoint = null;
      browserProduct = null;
      sessions.clear();
      rejectPending('Browser CDP connection closed.');
    };
    const onMessage = (event) => {
      const raw = typeof event === 'string' ? event : (event.data || event);
      let message;
      try {
        message = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
      } catch {
        return;
      }
      if (message.method === 'Target.attachedToTarget') {
        const { sessionId, targetInfo } = message.params || {};
        if (sessionId && targetInfo?.targetId) sessions.set(targetInfo.targetId, sessionId);
      }
      if (message.id && pending.has(message.id)) {
        const { resolve: resolvePending, reject: rejectPendingRequest, timer } = pending.get(message.id);
        clearTimeout(timer);
        pending.delete(message.id);
        if (message.error) {
          rejectPendingRequest(new Error(message.error.message || 'Chrome DevTools Protocol command failed.'));
        } else {
          resolvePending(message);
        }
      }
    };
    function cleanupStartupListeners() {
      ws?.removeEventListener?.('open', onOpen);
      ws?.removeEventListener?.('error', onError);
    }

    if (ws.on) {
      ws.on('open', onOpen);
      ws.on('error', onError);
      ws.on('close', onClose);
      ws.on('message', onMessage);
    } else {
      ws.addEventListener('open', onOpen);
      ws.addEventListener('error', onError);
      ws.addEventListener('close', onClose);
      ws.addEventListener('message', onMessage);
    }
  });
}

function sendCDP(method, params = {}, sessionId = null) {
  return new Promise((resolve, reject) => {
    if (!socketIsOpen()) {
      reject(new Error('WebSocket is not connected.'));
      return;
    }
    const id = ++cmdId;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 30000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify(message));
  });
}

async function connect() {
  if (socketIsOpen()) return;
  if (connectingPromise) return connectingPromise;

  connectingPromise = (async () => {
    const endpoint = await discoverBrowserEndpoint(BROWSER_CONFIG);
    if (!endpoint) {
      throw new Error('No live Twinkstar Browser debugging endpoint found. In Twinkstar, open chrome://inspect/#remote-debugging and enable remote debugging.');
    }
    chromePort = endpoint.port;
    chromeEndpoint = endpoint;
    await openWebSocket(endpoint);
    try {
      const version = await sendCDP('Browser.getVersion');
      browserProduct = version?.result?.product || null;
    } catch {
      browserProduct = null;
    }
  })();

  try {
    await connectingPromise;
  } catch (error) {
    ws = null;
    chromePort = null;
    chromeEndpoint = null;
    throw error;
  } finally {
    connectingPromise = null;
  }
}

async function ensureSession(targetId) {
  if (sessions.has(targetId)) return sessions.get(targetId);
  const response = await sendCDP('Target.attachToTarget', { targetId, flatten: true });
  const sessionId = response?.result?.sessionId;
  if (!sessionId) throw new Error('Failed to attach browser target.');
  sessions.set(targetId, sessionId);
  return sessionId;
}

async function waitForLoad(sessionId, timeoutMs = 15000) {
  await sendCDP('Page.enable', {}, sessionId);
  return new Promise((resolve) => {
    let done = false;
    const finish = (reason) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(interval);
      resolve(reason);
    };
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    const interval = setInterval(async () => {
      try {
        const response = await sendCDP('Runtime.evaluate', {
          expression: 'document.readyState',
          returnByValue: true,
        }, sessionId);
        if (response?.result?.result?.value === 'complete') finish('complete');
      } catch {}
    }, 400);
  });
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_REQUEST_BODY_BYTES) {
      throw new Error('Request body exceeds the 2 MiB proxy limit.');
    }
  }
  return body;
}

async function evalExpr(targetId, expression) {
  const sessionId = await ensureSession(targetId);
  const response = await sendCDP('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }, sessionId);
  if (response.result?.exceptionDetails) {
    throw new Error(response.result.exceptionDetails.text || 'JavaScript evaluation failed.');
  }
  return response.result?.result?.value ?? response.result;
}

function ownedTargetIds() {
  return new Set(Object.keys(readOwnedTabsFile(OWNED_TABS_FILE)));
}

function requireOwnedTarget(value) {
  const targetId = typeof value === 'string' ? value.trim() : '';
  if (!targetId) throw new Error('A valid browser target id is required.');
  if (!ALLOW_NON_OWNED_TABS && !ownedTargetIds().has(targetId)) {
    throw new Error(`Refusing to operate non-owned browser tab: ${targetId}.`);
  }
  return targetId;
}

function filterTargets(targets) {
  if (ALLOW_NON_OWNED_TABS) return targets;
  const owned = ownedTargetIds();
  return targets.filter((target) => owned.has(target.targetId));
}

function validateBrowserUrl(value) {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : 'about:blank';
  if (raw === 'about:blank') return raw;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Browser URL must be a valid http or https URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http, https, and about:blank browser URLs are allowed.');
  }
  return parsed.href;
}

function screenshotPath() {
  const dir = path.join(PLUGIN_DATA_DIR, 'screenshots');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `shot-${Date.now()}.png`);
}

function scheduleShutdown(server) {
  setTimeout(() => {
    try { ws?.close?.(); } catch {}
    try { server.closeAllConnections?.(); } catch {}
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  }, 10).unref();
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const pathname = parsed.pathname;
  const query = Object.fromEntries(parsed.searchParams);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (!hasValidToken(req)) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'Unauthorized proxy request.' }));
    return;
  }

  try {
    if (pathname === '/health') {
      res.end(JSON.stringify(await healthPayload()));
      return;
    }

    if (pathname === '/status') {
      const discovered = chromeEndpoint || await discoverBrowserEndpoint(BROWSER_CONFIG);
      res.end(JSON.stringify({
        configuredProfile: BROWSER_CONFIG.profile,
        proxyPort: PORT,
        probeCommonDebuggingPorts: BROWSER_CONFIG.probeCommonDebuggingPorts,
        candidates: (BROWSER_CONFIG.candidates || []).map(({ id, label, source }) => ({ id, label, source })),
        detected: configuredBrowserSummary(discovered),
        connected: socketIsOpen(),
      }));
      return;
    }

    if (pathname === '/shutdown') {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end(JSON.stringify({ error: 'Use POST for shutdown.' }));
        return;
      }
      res.end(JSON.stringify({ ok: true, stopping: true }));
      scheduleShutdown(server);
      return;
    }

    await connect();

    if (pathname === '/targets') {
      const response = await sendCDP('Target.getTargets');
      const pages = (response.result?.targetInfos || []).filter((target) => target.type === 'page');
      res.end(JSON.stringify(filterTargets(pages), null, 2));
      return;
    }

    if (pathname === '/new') {
      const targetUrl = validateBrowserUrl(query.url);
      const response = await sendCDP('Target.createTarget', { url: targetUrl, background: true });
      const targetId = response.result?.targetId;
      if (!targetId) throw new Error('Browser did not return a new tab id.');
      if (targetUrl !== 'about:blank') {
        try {
          const sessionId = await ensureSession(targetId);
          await waitForLoad(sessionId);
        } catch {}
      }
      res.end(JSON.stringify({ targetId }));
      return;
    }

    if (pathname === '/close') {
      const targetId = requireOwnedTarget(query.target);
      const response = await sendCDP('Target.closeTarget', { targetId });
      sessions.delete(targetId);
      res.end(JSON.stringify(response.result || { success: true }));
      return;
    }

    if (pathname === '/info') {
      const targetId = requireOwnedTarget(query.target);
      const sessionId = await ensureSession(targetId);
      const title = await evalExpr(targetId, 'document.title');
      const url = await evalExpr(targetId, 'location.href');
      const readyState = await sendCDP('Runtime.evaluate', {
        expression: 'document.readyState',
        returnByValue: true,
      }, sessionId);
      res.end(JSON.stringify({ title, url, readyState: readyState?.result?.result?.value }));
      return;
    }

    if (pathname === '/navigate') {
      const targetId = requireOwnedTarget(query.target);
      const sessionId = await ensureSession(targetId);
      const response = await sendCDP('Page.navigate', { url: validateBrowserUrl(query.url) }, sessionId);
      await waitForLoad(sessionId);
      res.end(JSON.stringify(response.result || { ok: true }));
      return;
    }

    if (pathname === '/back') {
      const targetId = requireOwnedTarget(query.target);
      const sessionId = await ensureSession(targetId);
      await sendCDP('Runtime.evaluate', { expression: 'history.back()' }, sessionId);
      await waitForLoad(sessionId);
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (pathname === '/eval') {
      const targetId = requireOwnedTarget(query.target);
      const body = await readBody(req);
      const value = await evalExpr(targetId, body || query.expr || 'document.title');
      res.end(JSON.stringify({ value }));
      return;
    }

    if (pathname === '/extractText') {
      const targetId = requireOwnedTarget(query.target);
      const expression = String.raw`(() => {
        const body = document.body;
        if (!body) return { title: document.title, url: location.href, text: '' };
        const text = (body.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
        return { title: document.title, url: location.href, text };
      })()`;
      const value = await evalExpr(targetId, expression);
      res.end(JSON.stringify(value));
      return;
    }

    if (pathname === '/click') {
      const targetId = requireOwnedTarget(query.target);
      const sessionId = await ensureSession(targetId);
      const selector = await readBody(req);
      const expression = `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { error: 'Element not found' };
        el.scrollIntoView({ block: 'center' });
        el.click();
        return { clicked: true, tag: el.tagName, text: (el.textContent || '').slice(0, 120) };
      })()`;
      const response = await sendCDP('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      }, sessionId);
      const value = response.result?.result?.value;
      if (value?.error) throw new Error(value.error);
      res.end(JSON.stringify(value || { clicked: true }));
      return;
    }

    if (pathname === '/type') {
      const targetId = requireOwnedTarget(query.target);
      const sessionId = await ensureSession(targetId);
      const body = JSON.parse(await readBody(req) || '{}');
      const { selector, text = '', submit = false } = body;
      const expression = `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { error: 'Element not found' };
        el.focus();
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
          || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (nativeSetter) nativeSetter.call(el, ${JSON.stringify(text)}); else el.value = ${JSON.stringify(text)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        if (${submit ? 'true' : 'false'}) {
          const form = el.form;
          if (form) form.requestSubmit?.();
          else el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }
        return { typed: true, length: (${JSON.stringify(text)}).length };
      })()`;
      const response = await sendCDP('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      }, sessionId);
      const value = response.result?.result?.value;
      if (value?.error) throw new Error(value.error);
      res.end(JSON.stringify(value || { typed: true }));
      return;
    }

    if (pathname === '/scroll') {
      const targetId = requireOwnedTarget(query.target);
      const sessionId = await ensureSession(targetId);
      const y = query.y ? Number(query.y) : null;
      const direction = query.direction || null;
      let expression = 'window.scrollBy(0, 800); ({ ok: true })';
      if (Number.isFinite(y)) expression = `window.scrollTo(0, ${y}); ({ ok: true, y: ${y} })`;
      if (direction === 'bottom') expression = 'window.scrollTo(0, document.body.scrollHeight); ({ ok: true, direction: "bottom" })';
      const response = await sendCDP('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
      res.end(JSON.stringify(response.result?.result?.value || { ok: true }));
      return;
    }

    if (pathname === '/setFiles') {
      const targetId = requireOwnedTarget(query.target);
      const sessionId = await ensureSession(targetId);
      const body = JSON.parse(await readBody(req) || '{}');
      const { selector, files = [] } = body;
      const documentResponse = await sendCDP('DOM.getDocument', {}, sessionId);
      const rootId = documentResponse.result?.root?.nodeId;
      const queryResponse = await sendCDP('DOM.querySelector', { nodeId: rootId, selector }, sessionId);
      const nodeId = queryResponse.result?.nodeId;
      if (!nodeId) throw new Error('File input not found.');
      const nodeResponse = await sendCDP('DOM.describeNode', { nodeId }, sessionId);
      await sendCDP('DOM.setFileInputFiles', {
        files,
        backendNodeId: nodeResponse.result?.node?.backendNodeId,
      }, sessionId);
      res.end(JSON.stringify({ ok: true, fileCount: files.length }));
      return;
    }

    if (pathname === '/screenshot') {
      const targetId = requireOwnedTarget(query.target);
      const sessionId = await ensureSession(targetId);
      await sendCDP('Page.enable', {}, sessionId);
      const screenshot = await sendCDP('Page.captureScreenshot', { format: 'png', fromSurface: true }, sessionId);
      const file = screenshotPath();
      fs.writeFileSync(file, Buffer.from(screenshot.result.data, 'base64'));
      res.end(JSON.stringify({ ok: true, file }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found.' }));
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: error?.message || String(error) }));
  }
});

server.on('error', (error) => {
  console.error(`[twinkstar-web-access] proxy failed: ${error?.message || error}`);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[twinkstar-web-access] proxy listening on 127.0.0.1:${PORT}`);
  console.log('TWINKSTAR_PROXY_READY');
});
