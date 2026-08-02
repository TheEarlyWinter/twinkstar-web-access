import { getSitePatternIndex } from '../lib/cdp-client.js';
import { pluginDataReadPermission } from '../lib/tool-permissions.js';

export const name = 'browser_list_site_patterns';
export const description = 'List domains with locally stored non-content site notes.';
export const sessionPermission = pluginDataReadPermission;
export const parameters = { type: 'object', properties: {} };

export async function execute(_input, toolCtx) {
  const items = await getSitePatternIndex(toolCtx);
  return {
    content: [{ type: 'text', text: items.length ? items.map((item) => `- ${item}`).join('\n') : 'No stored site patterns yet' }],
    details: { items },
  };
}
