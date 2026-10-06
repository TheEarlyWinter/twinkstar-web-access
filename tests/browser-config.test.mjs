import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveBrowserConfig } from '../lib/browser-config.js';

test('a configured user-data directory is exclusive', () => {
  const customDir = path.join(os.tmpdir(), 'twinkstar-web-access-test-profile');
  const config = resolveBrowserConfig({
    profile: 'twinkstar',
    userDataDir: customDir,
    probeCommonDebuggingPorts: true,
  });

  assert.equal(config.profile, 'twinkstar');
  assert.equal(config.candidates.length, 1);
  assert.equal(config.candidates[0].source, 'configuration');
  assert.equal(config.candidates[0].userDataDir, path.resolve(customDir));
  assert.equal(config.probeCommonDebuggingPorts, true);
});

test('auto discovery keeps Twinkstar ahead of other Chromium browsers on Windows', { skip: process.platform !== 'win32' }, () => {
  const config = resolveBrowserConfig({ profile: 'auto' });
  assert.deepEqual(config.candidates.map((candidate) => candidate.id), ['twinkstar', 'chrome', 'chromium']);
});

test('probeCommonDebuggingPorts defaults to true when omitted', () => {
  const config = resolveBrowserConfig({});
  assert.equal(config.probeCommonDebuggingPorts, true);
});

test('resolves twinkstar profile to auto on Linux when unset or default', () => {
  const config = resolveBrowserConfig({}, { platform: 'linux', homeDir: '/tmp/testuser' });
  assert.equal(config.profile, 'auto');
  assert.deepEqual(config.candidates.map((c) => c.id), ['chrome', 'chromium']);
});

