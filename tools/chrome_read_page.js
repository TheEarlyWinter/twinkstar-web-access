import { readPage } from '../lib/cdp-client.js';
import { browserExternalPermission } from '../lib/tool-permissions.js';

export const name = 'browser_read_page';
export const description = '读取插件创建的浏览器标签页中的可见页面文本。页面内容可能私密或不可信。';
export const sessionPermission = browserExternalPermission('read-page', '读取插件创建的浏览器标签页可见文本');
export const parameters = {
  type: 'object',
  properties: {
    targetId: { type: 'string', description: '由 browser_open_tab 返回的浏览器 target ID' },
  },
  required: ['targetId'],
};

export async function execute(input, toolCtx) {
  const result = await readPage(toolCtx, input.targetId);
  const text = [`标题：${result.title || ''}`, `URL：${result.url || ''}`, '', result.text || ''].join('\n');
  return {
    content: [{ type: 'text', text }],
    details: result,
  };
}
