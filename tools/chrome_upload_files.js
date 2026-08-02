import { uploadFiles } from '../lib/cdp-client.js';
import { browserExternalPermission } from '../lib/tool-permissions.js';

export const name = 'browser_upload_files';
export const description = 'Select local files for upload through a file input in a plugin-owned browser tab.';
export const sessionPermission = browserExternalPermission('upload-files', 'Select local files for upload in a plugin-owned browser tab');
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
    content: [{ type: 'text', text: `Selected ${input.files.length} file(s) for upload` }],
    details: result,
  };
}
