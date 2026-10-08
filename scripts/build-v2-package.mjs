#!/usr/bin/env node
// Assemble a self-contained, privacy-safe App tree before official validation
// and packaging. This does not install an extension or touch HANA_HOME.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.indexOf('--out');
const outParent = outArg >= 0 ? process.argv[outArg + 1] : path.resolve(source, '..', 'packages');
if (!outParent) throw new Error('--out requires a destination parent directory');
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
if (manifest.manifestVersion !== 2 || manifest.id !== 'twinkstar-web-access') throw new Error('Expected the Twinkstar V2 App manifest');
const output = path.resolve(outParent, manifest.id);
const parent = path.dirname(output);
if (parent === source || parent.startsWith(source + path.sep) || source.startsWith(output + path.sep) || output === source) {
  throw new Error('Package output must be outside the source tree');
}
if (fs.existsSync(output)) throw new Error(`Package output already exists: ${output}; use a fresh --out parent`);
const sdk = path.join(source, 'node_modules', '@hana', 'app-sdk');
if (!fs.existsSync(path.join(sdk, 'package.json'))) throw new Error('Missing packaged App SDK; run npm install in the source directory first');

const blockedNames = new Set(['.git', '.github', '.env', 'proxy-token', 'owned-tabs.json', 'DevToolsActivePort', 'screenshots', 'site-patterns', 'plugin-data', 'app-data']);
function copyTree(from, to) {
  const stat = fs.lstatSync(from);
  if (stat.isSymbolicLink()) throw new Error(`Symlinks are not allowed in the App package: ${path.relative(source, from)}`);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) {
      if (blockedNames.has(name) || name.startsWith('.env.') || name.startsWith('bootstrap-') || name.startsWith('probe-result-') || name.endsWith('.log')) {
        throw new Error(`Unexpected runtime/private data in package source: ${path.relative(source, path.join(from, name))}`);
      }
      copyTree(path.join(from, name), path.join(to, name));
    }
  } else if (stat.isFile()) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    fs.chmodSync(to, stat.mode & 0o777);
  } else throw new Error('Only regular files and directories can be packaged');
}
try {
  fs.mkdirSync(output, { recursive: true });
  for (const item of ['manifest.json', 'package.json', 'index.js', 'assets', 'lib', 'tools', 'skills', 'tests', 'vendor', 'README.md', 'SECURITY.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    const from = path.join(source, item);
    if (!fs.existsSync(from)) throw new Error(`Required package component missing: ${item}`);
    copyTree(from, path.join(output, item));
  }
  copyTree(path.join(source, 'docs', 'V2-MIGRATION.md'), path.join(output, 'docs', 'V2-MIGRATION.md'));
  copyTree(fileURLToPath(import.meta.url), path.join(output, 'scripts', 'build-v2-package.mjs'));
  copyTree(sdk, path.join(output, 'node_modules', '@hana', 'app-sdk'));
  console.log(JSON.stringify({ source, output, id: manifest.id, version: manifest.version, sdkBundled: true, installed: false }));
} catch (error) {
  // Only remove the fresh generated tree owned by this script.
  fs.rmSync(output, { recursive: true, force: true });
  throw error;
}
