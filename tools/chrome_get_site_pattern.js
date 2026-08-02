import { getSitePattern } from '../lib/cdp-client.js';
import { pluginDataReadPermission } from '../lib/tool-permissions.js';

export const name = 'browser_get_site_pattern';
export const description = '读取此前浏览器任务为指定域名或 URL 保存的本地非正文站点笔记。';
export const sessionPermission = pluginDataReadPermission;
export const parameters = {
  type: 'object',
  properties: {
    domainOrUrl: { type: 'string', description: '如 example.com 的域名，或完整 URL' },
  },
  required: ['domainOrUrl'],
};

export async function execute(input, toolCtx) {
  const result = await getSitePattern(toolCtx, input.domainOrUrl);
  return {
    content: [{ type: 'text', text: result.content || `未找到 ${result.domain} 的本地站点笔记` }],
    details: result,
  };
}
