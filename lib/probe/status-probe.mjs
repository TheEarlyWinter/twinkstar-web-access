#!/usr/bin/env node
import fs from 'node:fs';
import { discoverBrowserEndpoint } from '../browser-config.js';

let bootstrapData = null;
const bootstrapArgIndex = process.argv.indexOf('--bootstrap');
if (bootstrapArgIndex !== -1 && process.argv[bootstrapArgIndex + 1]) {
  const bootstrapFile = process.argv[bootstrapArgIndex + 1];
  try {
    const raw = fs.readFileSync(bootstrapFile, 'utf8');
    bootstrapData = JSON.parse(raw);
  } catch (err) {
    console.error(`[twinkstar-web-access probe] Failed to read bootstrap file: ${err?.message || err}`);
    process.exit(1);
  } finally {
    try {
      fs.unlinkSync(bootstrapFile);
    } catch {}
  }
}

if (!bootstrapData?.browserConfig || !bootstrapData?.resultFile) {
  console.error('[twinkstar-web-access probe] Missing browserConfig or resultFile in bootstrap data.');
  process.exit(1);
}

try {
  const { browserConfig, proxyPort, resultFile } = bootstrapData;
  const endpoint = await discoverBrowserEndpoint(browserConfig);
  const result = {
    configuredProfile: browserConfig.profile,
    proxyPort: proxyPort || 3457,
    probeCommonDebuggingPorts: browserConfig.probeCommonDebuggingPorts,
    candidates: (browserConfig.candidates || []).map(({ id, label, source }) => ({ id, label, source })),
    detected: endpoint
      ? {
        browser: endpoint.browser,
        source: endpoint.source,
        port: endpoint.port,
      }
      : null,
  };
  fs.writeFileSync(resultFile, JSON.stringify(result), 'utf8');
  console.log('TWINKSTAR_PROBE_DONE');
  process.exit(0);
} catch (error) {
  console.error(`[twinkstar-web-access probe] Probe execution failed: ${error?.message || error}`);
  process.exit(1);
}
