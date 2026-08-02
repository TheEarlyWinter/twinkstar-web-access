import { uploadFiles } from '../lib/cdp-client.js';
import { browserExternalPermission } from '../lib/tool-permissions.js';

export const name = 'browser_upload_files';
export const description = '通过插件创建的浏览器标签页中的文件输入框选择本地文件上传。';
export const sessionPermission = browserExternalPermission('upload-files', '为插件创建的浏览器标签页选择本地上传文件');
export const parameters = {
  type: 'object',
  properties: {
    targetId: { type: 'string' },
    selector: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
  },
  required: ['targetId', 'selector', 'files'],
};

export async function execute(input, toolCtx) {
  const result = await uploadFiles(toolCtx, input.targetId, input.selector, input.files);
  return {
    content: [{ type: 'text', text: `已选择 ${input.files.length} 个文件用于上传` }],
    details: result,
  };
}
