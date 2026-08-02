import { openTab } from '../lib/cdp-client.js';
import { browserExternalPermission } from '../lib/tool-permissions.js';

export const name = 'browser_open_tab';
export const description = 'Open a new background tab in the user-managed Twinkstar or Chromium browser.';
export const sessionPermission = browserExternalPermission('open-tab', 'Open a new background tab in the user-managed browser');
export const parameters = {
  type: 'object',
  properties: {
    url: { type: 'string', description: 'HTTP or HTTPS URL to open' },
  },
  required: ['url'],
};

export async function execute(input, toolCtx) {
  const result = await openTab(toolCtx, input.url);
  return {
    content: [{ type: 'text', text: `Opened browser tab: ${result.targetId}` }],
    details: result,
  };
}
