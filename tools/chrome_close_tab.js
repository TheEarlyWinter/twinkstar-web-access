import { closeTab } from '../lib/cdp-client.js';
import { browserExternalPermission } from '../lib/tool-permissions.js';

export const name = 'browser_close_tab';
export const description = 'Close a plugin-owned browser tab created by this plugin.';
export const sessionPermission = browserExternalPermission('close-tab', 'Close a plugin-owned browser tab');
export const parameters = {
  type: 'object',
  properties: {
    targetId: { type: 'string' },
  },
  required: ['targetId'],
};

export async function execute(input, toolCtx) {
  const result = await closeTab(toolCtx, input.targetId);
  return {
    content: [{ type: 'text', text: `Closed browser tab: ${input.targetId}` }],
    details: result,
  };
}
