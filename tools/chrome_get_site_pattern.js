import { getSitePattern } from '../lib/cdp-client.js';
import { pluginDataReadPermission } from '../lib/tool-permissions.js';

export const name = 'browser_get_site_pattern';
export const description = 'Read locally stored, non-content site notes for a domain or URL from prior browser runs.';
export const sessionPermission = pluginDataReadPermission;
export const parameters = {
  type: 'object',
  properties: {
    domainOrUrl: { type: 'string', description: 'Domain like example.com or a full URL' },
  },
  required: ['domainOrUrl'],
};

export async function execute(input, toolCtx) {
  const result = await getSitePattern(toolCtx, input.domainOrUrl);
  return {
    content: [{ type: 'text', text: result.content || `No stored site pattern for ${result.domain}` }],
    details: result,
  };
}
