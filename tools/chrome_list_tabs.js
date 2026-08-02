import { listTabs } from '../lib/cdp-client.js';
import { browserExternalPermission } from '../lib/tool-permissions.js';

export const name = 'browser_list_tabs';
export const description = '列出插件创建的浏览器页面标签页，用于诊断和定位。';
export const sessionPermission = browserExternalPermission('list-tabs', '读取插件创建的浏览器标签页元数据');
export const parameters = { type: 'object', properties: {} };

export async function execute(_input, toolCtx) {
  const tabs = await listTabs(toolCtx);
  const text = tabs.map((tab) => `- ${tab.targetId} | ${tab.title || ''} | ${tab.url || ''}`).join('\n') || '暂无插件创建的标签页';
  return {
    content: [{ type: 'text', text }],
    details: tabs,
  };
}
