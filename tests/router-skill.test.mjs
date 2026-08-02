import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillPath = path.join(root, 'skills', 'twinkstar-browser-router', 'SKILL.md');

test('router skill is a standalone default-enabled skill', () => {
  const content = fs.readFileSync(skillPath, 'utf8');

  assert.match(content, /^---\r?\nname: twinkstar-browser-router\r?\n/m);
  assert.match(content, /^default-enabled: true\r?$/m);
  assert.match(content, /twinkstar-web-access_browser_status/);
  assert.match(content, /twinkstar-web-access_browser_open_tab/);
});

test('plugin ships no server-command contribution', () => {
  assert.equal(fs.existsSync(path.join(root, 'commands')), false);
});
