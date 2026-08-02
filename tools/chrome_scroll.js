import { scrollPage } from '../lib/cdp-client.js';
import { browserExternalPermission } from '../lib/tool-permissions.js';

export const name = 'browser_scroll';
export const description = '将插件创建的浏览器标签页滚动到页面底部或指定 Y 坐标。';
export const sessionPermission = browserExternalPermission('scroll', '滚动插件创建的浏览器标签页');
export const parameters = {
  type: 'object',
  properties: {
    targetId: { type: 'string' },
    direction: { type: 'string', enum: ['bottom'] },
    y: { type: 'number' },
  },
  required: ['targetId'],
};

export async function execute(input, toolCtx) {
  const result = await scrollPage(toolCtx, input.targetId, input.direction, input.y);
  return {
    content: [{ type: 'text', text: '页面已滚动' }],
    details: result,
  };
}
