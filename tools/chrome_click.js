import { clickOnPage } from '../lib/cdp-client.js';
import { browserExternalPermission } from '../lib/tool-permissions.js';

export const name = 'browser_click';
export const description = '点击插件创建的浏览器标签页中的 CSS 选择器。';
export const sessionPermission = browserExternalPermission('click', '点击插件创建的浏览器标签页中的元素');
export const parameters = {
  type: 'object',
  properties: {
    targetId: { type: 'string' },
    selector: { type: 'string' },
  },
  required: ['targetId', 'selector'],
};

export async function execute(input, toolCtx) {
  const result = await clickOnPage(toolCtx, input.targetId, input.selector);
  return {
    content: [{ type: 'text', text: `已点击 ${input.selector}` }],
    details: result,
  };
}
