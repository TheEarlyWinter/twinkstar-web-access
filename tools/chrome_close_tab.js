import { closeTab } from '../lib/cdp-client.js';
import { browserExternalPermission } from '../lib/tool-permissions.js';

export const name = 'browser_close_tab';
export const description = '关闭由本插件创建的浏览器标签页。';
export const sessionPermission = browserExternalPermission('close-tab', '关闭插件创建的浏览器标签页');
export const parameters = {
  type: 'object',
  properties: {
    targetId: { type: 'string' },
  },
  required: ['targetId'],
};

export async function execute(input, toolCtx) {
  const result = await closeTab(toolCtx, input.targetId);
  return {
    content: [{ type: 'text', text: `已关闭浏览器标签页：${input.targetId}` }],
    details: result,
  };
}
