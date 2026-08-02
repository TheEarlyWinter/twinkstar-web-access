import { ensureProxy } from './ensure-proxy.js';
import {
  getProxyPort,
  httpJson,
  markOwnedTab,
  unmarkOwnedTab,
  ensureOwnedOrAllowed,
  summarizeText,
} from './common.js';
import { discoverBrowserEndpoint, getBrowserConfig } from './browser-config.js';
import { domainFromUrl, readSitePattern, recordSuccessfulRead, listSitePatterns } from './site-knowledge.js';

function proxyJson(proxy, endpoint, options = {}) {
  return httpJson(`${proxy.base}${endpoint}`, {
    ...options,
    headers: {
      ...proxy.headers,
      ...(options.headers || {}),
    },
  });
}

export async function getBrowserStatus(toolCtx) {
  const config = getBrowserConfig(toolCtx);
  const endpoint = await discoverBrowserEndpoint(config);
  return {
    configuredProfile: config.profile,
    proxyPort: getProxyPort(toolCtx),
    probeCommonDebuggingPorts: config.probeCommonDebuggingPorts,
    candidates: config.candidates.map(({ id, label, source }) => ({ id, label, source })),
    detected: endpoint
      ? {
        browser: endpoint.browser,
        source: endpoint.source,
        port: endpoint.port,
      }
      : null,
  };
}

export async function openTab(toolCtx, url = 'about:blank') {
  const proxy = await ensureProxy(toolCtx);
  const result = await proxyJson(proxy, `/new?url=${encodeURIComponent(url)}`);
  const domain = domainFromUrl(url);
  markOwnedTab(toolCtx.dataDir, result.targetId, { url, domain });
  const knownPattern = domain ? readSitePattern(toolCtx.dataDir, domain) : null;
  return {
    ...result,
    domain,
    knownPattern,
  };
}

export async function listTabs(toolCtx) {
  const proxy = await ensureProxy(toolCtx);
  return proxyJson(proxy, '/targets');
}

export async function readPage(toolCtx, targetId) {
  ensureOwnedOrAllowed(toolCtx, toolCtx.dataDir, targetId);
  const proxy = await ensureProxy(toolCtx);
  const info = await proxyJson(proxy, `/info?target=${encodeURIComponent(targetId)}`);
  const text = await proxyJson(proxy, `/extractText?target=${encodeURIComponent(targetId)}`);
  const fullText = String(text.text || '');
  const summarized = summarizeText(fullText, 12000);
  const domain = domainFromUrl(info.url);
  const patternWrite = recordSuccessfulRead(toolCtx.dataDir, {
    url: info.url,
    title: info.title,
    textLength: fullText.length,
  });
  const knownPattern = domain ? readSitePattern(toolCtx.dataDir, domain) : null;
  return {
    ...info,
    domain,
    text: summarized,
    fullTextLength: fullText.length,
    knownPattern,
    sitePatternSavedTo: patternWrite?.file || null,
  };
}

export async function evalOnPage(toolCtx, targetId, expression) {
  ensureOwnedOrAllowed(toolCtx, toolCtx.dataDir, targetId);
  const proxy = await ensureProxy(toolCtx);
  return proxyJson(proxy, `/eval?target=${encodeURIComponent(targetId)}`, {
    method: 'POST',
    body: expression,
  });
}

export async function clickOnPage(toolCtx, targetId, selector) {
  ensureOwnedOrAllowed(toolCtx, toolCtx.dataDir, targetId);
  const proxy = await ensureProxy(toolCtx);
  return proxyJson(proxy, `/click?target=${encodeURIComponent(targetId)}`, {
    method: 'POST',
    body: selector,
  });
}

export async function typeOnPage(toolCtx, targetId, selector, text, submit = false) {
  ensureOwnedOrAllowed(toolCtx, toolCtx.dataDir, targetId);
  const proxy = await ensureProxy(toolCtx);
  return proxyJson(proxy, `/type?target=${encodeURIComponent(targetId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selector, text, submit }),
  });
}

export async function scrollPage(toolCtx, targetId, direction, y) {
  ensureOwnedOrAllowed(toolCtx, toolCtx.dataDir, targetId);
  const proxy = await ensureProxy(toolCtx);
  const query = direction ? `direction=${encodeURIComponent(direction)}` : `y=${encodeURIComponent(y)}`;
  return proxyJson(proxy, `/scroll?target=${encodeURIComponent(targetId)}&${query}`);
}

export async function screenshotPage(toolCtx, targetId) {
  ensureOwnedOrAllowed(toolCtx, toolCtx.dataDir, targetId);
  const proxy = await ensureProxy(toolCtx);
  return proxyJson(proxy, `/screenshot?target=${encodeURIComponent(targetId)}`);
}

export async function uploadFiles(toolCtx, targetId, selector, files) {
  ensureOwnedOrAllowed(toolCtx, toolCtx.dataDir, targetId);
  const proxy = await ensureProxy(toolCtx);
  return proxyJson(proxy, `/setFiles?target=${encodeURIComponent(targetId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selector, files }),
  });
}

export async function closeTab(toolCtx, targetId) {
  ensureOwnedOrAllowed(toolCtx, toolCtx.dataDir, targetId);
  const proxy = await ensureProxy(toolCtx);
  const result = await proxyJson(proxy, `/close?target=${encodeURIComponent(targetId)}`);
  unmarkOwnedTab(toolCtx.dataDir, targetId);
  return result;
}

export async function getSitePattern(toolCtx, domainOrUrl) {
  const domain = domainFromUrl(domainOrUrl) || domainOrUrl;
  const content = readSitePattern(toolCtx.dataDir, domain);
  return { domain, content };
}

export async function getSitePatternIndex(toolCtx) {
  return listSitePatterns(toolCtx.dataDir);
}
