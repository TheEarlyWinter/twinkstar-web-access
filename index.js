import fs from 'node:fs';
import path from 'node:path';
import { ensureProxy, stopProxy } from './lib/ensure-proxy.js';

export default class TwinkstarWebAccessPlugin {
  async onload() {
    fs.mkdirSync(this.ctx.dataDir, { recursive: true });
    fs.mkdirSync(path.join(this.ctx.dataDir, 'site-patterns'), { recursive: true });

    if (this.ctx.config.get('autoStartProxy') === true) {
      try {
        await ensureProxy(this.ctx);
        this.ctx.log.info('twinkstar-web-access proxy ready');
      } catch (error) {
        this.ctx.log.warn(`twinkstar-web-access proxy not ready on load: ${error?.message || error}`);
      }
    }
  }

  async onunload() {
    try {
      const result = await stopProxy(this.ctx);
      this.ctx.log.info(`twinkstar-web-access proxy shutdown: ${result.stopped === false ? result.reason : 'requested'}`);
    } catch (error) {
      this.ctx.log.warn(`twinkstar-web-access proxy shutdown failed: ${error?.message || error}`);
    }
  }
}
