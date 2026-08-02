import { getSitePatternIndex } from '../lib/cdp-client.js';
import { pluginDataReadPermission } from '../lib/tool-permissions.js';

export const name = 'browser_list_site_patterns';
export const description = '列出已保存本地非正文站点笔记的域名。';
export const sessionPermission = pluginDataReadPermission;
export const parameters = { type: 'object', properties: {} };

export async function execute(_input, toolCtx) {
  const items = await getSitePatternIndex(toolCtx);
  return {
    content: [{ type: 'text', text: items.length ? items.map((item) => `- ${item}`).join('\n') : '暂未保存本地站点笔记' }],
    details: { items },
  };
}
