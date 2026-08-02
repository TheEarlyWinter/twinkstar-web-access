import { typeOnPage } from '../lib/cdp-client.js';
import { browserExternalPermission } from '../lib/tool-permissions.js';

export const name = 'browser_type';
export const description = 'Type text into a CSS selector in a plugin-owned browser tab.';
export const sessionPermission = browserExternalPermission('type', 'Type text into a plugin-owned browser tab');
export const parameters = {
  type: 'object',
  properties: {
    targetId: { type: 'string' },
    selector: { type: 'string' },
    text: { type: 'string' },
    submit: { type: 'boolean' },
  },
  required: ['targetId', 'selector', 'text'],
};

export async function execute(input, toolCtx) {
  const result = await typeOnPage(toolCtx, input.targetId, input.selector, input.text, input.submit === true);
  return {
    content: [{ type: 'text', text: `Typed into ${input.selector}` }],
    details: result,
  };
}
