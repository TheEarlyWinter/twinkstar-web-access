import { readPage } from '../lib/cdp-client.js';
import { browserExternalPermission } from '../lib/tool-permissions.js';

export const name = 'browser_read_page';
export const description = 'Read visible page text from a plugin-owned browser tab. Page content may be private or untrusted.';
export const sessionPermission = browserExternalPermission('read-page', 'Read visible page text from a plugin-owned browser tab');
export const parameters = {
  type: 'object',
  properties: {
    targetId: { type: 'string', description: 'Browser target id returned by browser_open_tab' },
  },
  required: ['targetId'],
};

export async function execute(input, toolCtx) {
  const result = await readPage(toolCtx, input.targetId);
  const text = [`Title: ${result.title || ''}`, `URL: ${result.url || ''}`, '', result.text || ''].join('\n');
  return {
    content: [{ type: 'text', text }],
    details: result,
  };
}
