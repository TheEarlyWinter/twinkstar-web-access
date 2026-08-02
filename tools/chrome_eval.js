import { evalOnPage } from '../lib/cdp-client.js';
import { browserExternalPermission } from '../lib/tool-permissions.js';

export const name = 'browser_eval';
export const description = '在插件创建的浏览器标签页中执行 JavaScript。只用于结构化 DOM 检查或用户明确要求的操作。';
export const sessionPermission = browserExternalPermission('eval', '在插件创建的浏览器标签页中执行 JavaScript');
export const parameters = {
  type: 'object',
  properties: {
    targetId: { type: 'string' },
    expression: { type: 'string', description: 'JavaScript 表达式' },
  },
  required: ['targetId', 'expression'],
};

export async function execute(input, toolCtx) {
  const result = await evalOnPage(toolCtx, input.targetId, input.expression);
  return {
    content: [{ type: 'text', text: JSON.stringify(result.value ?? result, null, 2) }],
    details: result,
  };
}
