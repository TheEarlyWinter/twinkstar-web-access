import { listTabs } from '../lib/cdp-client.js';
import { browserExternalPermission } from '../lib/tool-permissions.js';

export const name = 'browser_list_tabs';
export const description = 'List plugin-owned browser page targets for diagnosis and orientation.';
export const sessionPermission = browserExternalPermission('list-tabs', 'Read metadata from plugin-owned browser tabs');
export const parameters = { type: 'object', properties: {} };

export async function execute(_input, toolCtx) {
  const tabs = await listTabs(toolCtx);
  const text = tabs.map((tab) => `- ${tab.targetId} | ${tab.title || ''} | ${tab.url || ''}`).join('\n') || 'No plugin-owned tabs';
  return {
    content: [{ type: 'text', text }],
    details: tabs,
  };
}
