import { typeOnPage } from '../lib/cdp-client.js';
import { browserExternalPermission } from '../lib/tool-permissions.js';

export const name = 'browser_type';
export const description = '向插件创建的浏览器标签页中的 CSS 选择器输入文本。';
export const sessionPermission = browserExternalPermission('type', '向插件创建的浏览器标签页输入文本');
export const parameters = {
  type: 'object',
  properties: {
    targetId: { type: 'string' },
    selector: { type: 'string' },
    text: { type: 'string' },
    submit: { type: 'boolean' },
  },
  required: ['targetId', 'selector', 'text'],
};

export async function execute(input, toolCtx) {
  const result = await typeOnPage(toolCtx, input.targetId, input.selector, input.text, input.submit === true);
  return {
    content: [{ type: 'text', text: `已向 ${input.selector} 输入文本` }],
    details: result,
  };
}
