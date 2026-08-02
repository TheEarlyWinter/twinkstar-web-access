import { getBrowserStatus } from '../lib/cdp-client.js';
import { pluginDataReadPermission } from '../lib/tool-permissions.js';

export const name = 'browser_status';
export const description = '检查已配置的星愿浏览器或 Chromium CDP 端点，不会附着到浏览器标签页。';
export const sessionPermission = pluginDataReadPermission;
export const parameters = { type: 'object', properties: {} };

export async function execute(_input, toolCtx) {
  const result = await getBrowserStatus(toolCtx);
  const detected = result.detected
    ? `${result.detected.browser.label}：通过 ${result.detected.source} 在本地端口 ${result.detected.port} 发现`
    : '未发现可用的已配置浏览器调试端点';
  return {
    content: [{ type: 'text', text: detected }],
    details: result,
  };
}
