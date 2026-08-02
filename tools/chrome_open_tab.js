import { openTab } from '../lib/cdp-client.js';
import { browserExternalPermission } from '../lib/tool-permissions.js';

export const name = 'browser_open_tab';
export const description = '在用户自行管理的星愿浏览器或 Chromium 浏览器中打开新的后台标签页。';
export const sessionPermission = browserExternalPermission('open-tab', '在用户自行管理的浏览器中打开新的后台标签页');
export const parameters = {
  type: 'object',
  properties: {
    url: { type: 'string', description: '要打开的 HTTP 或 HTTPS URL' },
  },
  required: ['url'],
};

export async function execute(input, toolCtx) {
  const result = await openTab(toolCtx, input.url);
  return {
    content: [{ type: 'text', text: `已打开浏览器标签页：${result.targetId}` }],
    details: result,
  };
}
