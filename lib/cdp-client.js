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
import {
  fetchProxy,
  probeStatus,
  getAppConfigSnapshot,
} from './v2-runtime-manager.js';

function proxyJson(proxy, endpoint, options = {}) {
  return httpJson(`${proxy.base}${endpoint}`, {
    ...options,
    headers: {
      ...proxy.headers,
      ...(options.headers || {}),
    },
  });
}

async function executeProxyRequest(toolCtx, servicePath, options = {}) {
  if (toolCtx?.sdk?.runtime) {
    const snapshot = toolCtx.configSnapshot || await getAppConfigSnapshot(toolCtx.sdk);
    return fetchProxy(toolCtx.sdk, toolCtx.dataDir, snapshot, servicePath, options);
  }
  const proxy = await ensureProxy(toolCtx);
  return proxyJson(proxy, servicePath, options);
}

export async function getBrowserStatus(toolCtx) {
  if (toolCtx?.sdk?.runtime) {
    const snapshot = toolCtx.configSnapshot || await getAppConfigSnapshot(toolCtx.sdk);
    return probeStatus(toolCtx.sdk, toolCtx.dataDir, snapshot);
  }
  const config = getBrowserConfig(toolCtx);
  const endpoint = await discoverBrowserEndpoint(config);
  return {
    configuredProfile: config.profile,
    proxyPort: getProxyPort(toolCtx),
    probeCommonDebuggingPorts: config.probeCommonDebuggingPorts,
    candidates: (config.candidates || []).map(({ id, label, source }) => ({ id, label, source })),
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
  const result = await executeProxyRequest(toolCtx, `/new?url=${encodeURIComponent(url)}`);
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
  return executeProxyRequest(toolCtx, '/targets');
}

export async function readPage(toolCtx, targetId) {
  ensureOwnedOrAllowed(toolCtx, toolCtx.dataDir, targetId);
  const info = await executeProxyRequest(toolCtx, `/info?target=${encodeURIComponent(targetId)}`);
  const text = await executeProxyRequest(toolCtx, `/extractText?target=${encodeURIComponent(targetId)}`);
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
  return executeProxyRequest(toolCtx, `/eval?target=${encodeURIComponent(targetId)}`, {
    method: 'POST',
    body: expression,
  });
}

export async function clickOnPage(toolCtx, targetId, selector) {
  ensureOwnedOrAllowed(toolCtx, toolCtx.dataDir, targetId);
  return executeProxyRequest(toolCtx, `/click?target=${encodeURIComponent(targetId)}`, {
    method: 'POST',
    body: selector,
  });
}

export async function typeOnPage(toolCtx, targetId, selector, text, submit = false) {
  ensureOwnedOrAllowed(toolCtx, toolCtx.dataDir, targetId);
  return executeProxyRequest(toolCtx, `/type?target=${encodeURIComponent(targetId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selector, text, submit }),
  });
}

export async function scrollPage(toolCtx, targetId, direction, y) {
  ensureOwnedOrAllowed(toolCtx, toolCtx.dataDir, targetId);
  const query = direction ? `direction=${encodeURIComponent(direction)}` : `y=${encodeURIComponent(y)}`;
  return executeProxyRequest(toolCtx, `/scroll?target=${encodeURIComponent(targetId)}&${query}`);
}

export async function screenshotPage(toolCtx, targetId) {
  ensureOwnedOrAllowed(toolCtx, toolCtx.dataDir, targetId);
  if (!toolCtx?.callToken) {
    throw new Error('Screenshot staging requires an active callToken in tool invocation context.');
  }
  if (typeof toolCtx.sdk?.sessions?.stageFile !== 'function') {
    throw new Error('Host staging capability (sdk.sessions.stageFile) is unavailable.');
  }
  const result = await executeProxyRequest(toolCtx, `/screenshot?target=${encodeURIComponent(targetId)}`);
  if (!result?.file) {
    throw new Error('CDP proxy failed to capture screenshot or return file path.');
  }
  const stageResult = await toolCtx.sdk.sessions.stageFile({
    path: result.file,
    name: `screenshot-${Date.now()}.png`,
    mime: 'image/png',
    callToken: toolCtx.callToken,
  });

  if (!stageResult?.resource?.fileId) {
    throw new Error('Host staging failed: no fileId returned.');
  }

  return {
    ok: true,
    targetId,
    fileId: stageResult.resource.fileId,
    file: stageResult.file,
    resource: stageResult.resource,
    mediaItem: stageResult.mediaItem,
  };
}

export async function uploadFiles(toolCtx, targetId, selector, files) {
  ensureOwnedOrAllowed(toolCtx, toolCtx.dataDir, targetId);
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('At least one file must be provided for upload.');
  }

  const validatedLocalPaths = [];
  for (const f of files) {
    if (!toolCtx?.sdk?.resources) {
      throw new Error('sdk.resources is required for upload authorization.');
    }
    const fileRef = typeof f === 'object' && f !== null ? f : { kind: 'local-file', path: String(f) };
    
    // Explicit authorization check
    const stat = await toolCtx.sdk.resources.stat(fileRef);
    if (!stat) {
      throw new Error(`File not found or permission denied: ${typeof f === 'string' ? f : JSON.stringify(f)}`);
    }

    const materialized = await toolCtx.sdk.resources.materialize(fileRef);
    const localPath = materialized?.localPath || (typeof materialized === 'string' ? materialized : null);
    if (!localPath) {
      throw new Error(`Failed to materialize authorized localPath for: ${typeof f === 'string' ? f : JSON.stringify(f)}`);
    }
    validatedLocalPaths.push(localPath);
  }

  return executeProxyRequest(toolCtx, `/setFiles?target=${encodeURIComponent(targetId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selector, files: validatedLocalPaths }),
  });
}

export async function closeTab(toolCtx, targetId) {
  ensureOwnedOrAllowed(toolCtx, toolCtx.dataDir, targetId);
  const result = await executeProxyRequest(toolCtx, `/close?target=${encodeURIComponent(targetId)}`);
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
