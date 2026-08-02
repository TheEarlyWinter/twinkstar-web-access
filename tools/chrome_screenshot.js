import { screenshotPage } from '../lib/cdp-client.js';
import { browserExternalPermission } from '../lib/tool-permissions.js';

export const name = 'browser_screenshot';
export const description = 'Capture a screenshot from a plugin-owned browser tab and store it in plugin-private data.';
export const sessionPermission = browserExternalPermission('screenshot', 'Capture a screenshot from a plugin-owned browser tab');
export const parameters = {
  type: 'object',
  properties: {
    targetId: { type: 'string' },
  },
  required: ['targetId'],
};

export async function execute(input, toolCtx) {
  const result = await screenshotPage(toolCtx, input.targetId);
  return {
    content: [{ type: 'text', text: `Saved screenshot in plugin-private data: ${result.file}` }],
    details: {
      ...result,
      media: { mediaUrls: [result.file] },
    },
  };
}
