import { scrollPage } from '../lib/cdp-client.js';
import { browserExternalPermission } from '../lib/tool-permissions.js';

export const name = 'browser_scroll';
export const description = 'Scroll a plugin-owned browser tab to the bottom or a specific Y offset.';
export const sessionPermission = browserExternalPermission('scroll', 'Scroll a plugin-owned browser tab');
export const parameters = {
  type: 'object',
  properties: {
    targetId: { type: 'string' },
    direction: { type: 'string', enum: ['bottom'] },
    y: { type: 'number' },
  },
  required: ['targetId'],
};

export async function execute(input, toolCtx) {
  const result = await scrollPage(toolCtx, input.targetId, input.direction, input.y);
  return {
    content: [{ type: 'text', text: 'Scrolled page' }],
    details: result,
  };
}
