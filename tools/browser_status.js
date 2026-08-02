import { getBrowserStatus } from '../lib/cdp-client.js';
import { pluginDataReadPermission } from '../lib/tool-permissions.js';

export const name = 'browser_status';
export const description = 'Inspect the configured Twinkstar or Chromium CDP endpoint without attaching to a browser tab.';
export const sessionPermission = pluginDataReadPermission;
export const parameters = { type: 'object', properties: {} };

export async function execute(_input, toolCtx) {
  const result = await getBrowserStatus(toolCtx);
  const detected = result.detected
    ? `${result.detected.browser.label} via ${result.detected.source} on local port ${result.detected.port}`
    : 'No live configured browser debugging endpoint found';
  return {
    content: [{ type: 'text', text: detected }],
    details: result,
  };
}
