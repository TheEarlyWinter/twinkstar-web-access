import { evalOnPage } from '../lib/cdp-client.js';
import { browserExternalPermission } from '../lib/tool-permissions.js';

export const name = 'browser_eval';
export const description = 'Execute JavaScript in a plugin-owned browser tab. Use only for structured DOM inspection or an explicitly requested action.';
export const sessionPermission = browserExternalPermission('eval', 'Execute JavaScript in a plugin-owned browser tab');
export const parameters = {
  type: 'object',
  properties: {
    targetId: { type: 'string' },
    expression: { type: 'string', description: 'JavaScript expression' },
  },
  required: ['targetId', 'expression'],
};

export async function execute(input, toolCtx) {
  const result = await evalOnPage(toolCtx, input.targetId, input.expression);
  return {
    content: [{ type: 'text', text: JSON.stringify(result.value ?? result, null, 2) }],
    details: result,
  };
}
