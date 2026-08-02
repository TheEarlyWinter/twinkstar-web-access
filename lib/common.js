import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PROXY_AUTH_HEADER = 'x-twinkstar-web-access-token';
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

export function getProxyPort(ctxLike) {
  return Number(ctxLike?.config?.get?.('proxyPort') ?? process.env.CDP_PROXY_PORT ?? 3457);
}

export function proxyTokenFile(dataDir) {
  return path.join(dataDir, 'proxy-token');
}

export function getProxyToken(dataDir) {
  if (!dataDir) throw new Error('Plugin data directory is unavailable for proxy authentication.');
  const file = proxyTokenFile(dataDir);
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (TOKEN_PATTERN.test(existing)) return existing;
  } catch {}

  const token = randomBytes(32).toString('hex');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, `${token}\n`, { encoding: 'utf8', mode: 0o600 });
  return token;
}

export function proxyAuthHeaders(token) {
  return { [PROXY_AUTH_HEADER]: token };
}

export function createProxyConfigFingerprint(browserConfig, allowOperateNonOwnedTabs) {
  const payload = JSON.stringify({
    profile: browserConfig?.profile || 'twinkstar',
    userDataDir: browserConfig?.userDataDir || '',
    probeCommonDebuggingPorts: browserConfig?.probeCommonDebuggingPorts === true,
    allowOperateNonOwnedTabs: allowOperateNonOwnedTabs === true,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 24);
}

export function ownedTabsFile(dataDir) {
  return path.join(dataDir, 'owned-tabs.json');
}

export function readOwnedTabsFile(file) {
  try {
    if (!file || !fs.existsSync(file)) return {};
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function readOwnedTabs(dataDir) {
  return readOwnedTabsFile(ownedTabsFile(dataDir));
}

export function writeOwnedTabs(dataDir, data) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(ownedTabsFile(dataDir), JSON.stringify(data, null, 2));
}

export function markOwnedTab(dataDir, targetId, meta = {}) {
  const db = readOwnedTabs(dataDir);
  db[targetId] = {
    targetId,
    createdAt: new Date().toISOString(),
    ...meta,
  };
  writeOwnedTabs(dataDir, db);
}

export function unmarkOwnedTab(dataDir, targetId) {
  const db = readOwnedTabs(dataDir);
  delete db[targetId];
  writeOwnedTabs(dataDir, db);
}

export function isOwnedTab(dataDir, targetId) {
  return Object.prototype.hasOwnProperty.call(readOwnedTabs(dataDir), targetId);
}

export function ensureOwnedOrAllowed(ctxLike, dataDir, targetId) {
  if (typeof targetId !== 'string' || !targetId.trim()) {
    throw new Error('A valid browser target id is required.');
  }
  if (ctxLike?.config?.get?.('allowOperateNonOwnedTabs') === true) return;
  if (!isOwnedTab(dataDir, targetId)) {
    throw new Error(`Refusing to operate non-owned tab: ${targetId}. Open a new tab with Twinkstar Web Access first, or explicitly enable allowOperateNonOwnedTabs.`);
  }
}

export async function httpJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(data?.error || data?.raw || `HTTP ${res.status}`);
  }
  return data;
}

export function summarizeText(text, limit = 6000) {
  const value = String(text ?? '');
  return value.length > limit ? `${value.slice(0, limit)}\n...[truncated]` : value;
}
