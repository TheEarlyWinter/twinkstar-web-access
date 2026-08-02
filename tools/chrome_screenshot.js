import { screenshotPage } from '../lib/cdp-client.js';
import { browserExternalPermission } from '../lib/tool-permissions.js';

export const name = 'browser_screenshot';
export const description = '截取插件创建的浏览器标签页，并保存到插件私有数据目录。';
export const sessionPermission = browserExternalPermission('screenshot', '截取插件创建的浏览器标签页');
export const parameters = {
  type: 'object',
  properties: {
    targetId: { type: 'string' },
  },
  required: ['targetId'],
};

export async function execute(input, toolCtx) {
  const result = await screenshotPage(toolCtx, input.targetId);
  return {
    content: [{ type: 'text', text: `截图已保存到插件私有数据目录：${result.file}` }],
    details: {
      ...result,
      media: { mediaUrls: [result.file] },
    },
  };
}
