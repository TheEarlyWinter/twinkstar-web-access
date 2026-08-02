import { clickOnPage } from '../lib/cdp-client.js';
import { browserExternalPermission } from '../lib/tool-permissions.js';

export const name = 'browser_click';
export const description = 'Click a CSS selector in a plugin-owned browser tab.';
export const sessionPermission = browserExternalPermission('click', 'Click an element in a plugin-owned browser tab');
export const parameters = {
  type: 'object',
  properties: {
    targetId: { type: 'string' },
    selector: { type: 'string' },
  },
  required: ['targetId', 'selector'],
};

export async function execute(input, toolCtx) {
  const result = await clickOnPage(toolCtx, input.targetId, input.selector);
  return {
    content: [{ type: 'text', text: `Clicked ${input.selector}` }],
    details: result,
  };
}
