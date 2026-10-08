import fs from 'node:fs';
import path from 'node:path';
import { defineApp } from '@hana/app-sdk/server';

import * as browserStatusTool from './tools/browser_status.js';
import * as openTabTool from './tools/chrome_open_tab.js';
import * as closeTabTool from './tools/chrome_close_tab.js';
import * as listTabsTool from './tools/chrome_list_tabs.js';
import * as readPageTool from './tools/chrome_read_page.js';
import * as clickTool from './tools/chrome_click.js';
import * as typeTool from './tools/chrome_type.js';
import * as scrollTool from './tools/chrome_scroll.js';
import * as screenshotTool from './tools/chrome_screenshot.js';
import * as evalTool from './tools/chrome_eval.js';
import * as uploadFilesTool from './tools/chrome_upload_files.js';
import * as getSitePatternTool from './tools/chrome_get_site_pattern.js';
import * as listSitePatternsTool from './tools/chrome_list_site_patterns.js';

export const TOOLS = Object.freeze([
  browserStatusTool,
  openTabTool,
  closeTabTool,
  listTabsTool,
  readPageTool,
  clickTool,
  typeTool,
  scrollTool,
  screenshotTool,
  evalTool,
  uploadFilesTool,
  getSitePatternTool,
  listSitePatternsTool,
]);

export default defineApp(async (sdk) => {
  const dataDir = sdk.dataDir;
  if (dataDir) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.mkdirSync(path.join(dataDir, 'site-patterns'), { recursive: true });
      fs.mkdirSync(path.join(dataDir, 'screenshots'), { recursive: true });
    } catch {}
  }

  for (const tool of TOOLS) {
    const fullName = `twinkstar-web-access_${tool.name}`;
    await sdk.tools.register({
      name: fullName,
      description: tool.description,
      parameters: tool.parameters,
      sessionPermission: tool.sessionPermission,
      execute: async (rawArgs) => {
        const { context, ...input } = rawArgs || {};
        if (typeof sdk?.config?.getAll !== 'function') {
          throw new Error('sdk.config.getAll is required but unavailable on SDK context.');
        }
        const configSnapshot = await sdk.config.getAll();
        if (!configSnapshot || typeof configSnapshot !== 'object') {
          throw new Error('sdk.config.getAll returned invalid configuration.');
        }
        const ctxLike = {
          sdk,
          dataDir,
          config: {
            get: (key) => configSnapshot[key],
            getAll: () => ({ ...configSnapshot }),
          },
          configSnapshot,
          callToken: context?.callToken,
          sessionId: context?.sessionId,
          sessionPath: context?.sessionPath,
        };
        return await tool.execute(input, ctxLike);
      },
    });
  }
});
