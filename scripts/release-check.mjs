#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function isProbablyBinary(buffer) {
  return buffer.includes(0);
}

function scanText(label, text) {
  const checks = [
    {
      name: 'Windows user home path',
      pattern: /[A-Za-z]:\\Users\\[^\\\r\n]+\\/g,
    },
    {
      name: 'macOS or Linux user home path',
      pattern: /\/Users\/[^/\r\n]+\//g,
    },
    {
      name: 'private key block',
      pattern: /-----BEGIN [A-Z ]+PRIVATE KEY-----/g,
    },
    {
      name: 'GitHub token',
      pattern: /(?:ghp|github_pat)_[A-Za-z0-9_]{20,}/g,
    },
    {
      name: 'OpenAI-style API key',
      pattern: /sk-[A-Za-z0-9_-]{20,}/g,
    },
    {
      name: 'AWS access key id',
      pattern: /AKIA[0-9A-Z]{16}/g,
    },
    {
      name: 'Slack token',
      pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/g,
    },
  ];

  for (const check of checks) {
    const matches = [...text.matchAll(check.pattern)];
    if (matches.length > 0) {
      failures.push(`${label}: found ${check.name}: ${matches[0][0].slice(0, 80)}`);
    }
  }
}

const trackedFiles = git(['ls-files', '-z']).split('\0').filter(Boolean);
const untrackedFiles = git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
const sourceFiles = [...new Set([...trackedFiles, ...untrackedFiles])];
const forbiddenRuntimePath = /(^|\/)(?:plugin-data|site-patterns|screenshots|coverage|test-results)(\/|$)|(?:^|\/)(?:owned-tabs\.json|proxy-token|DevToolsActivePort)$/;

for (const file of sourceFiles) {
  if (forbiddenRuntimePath.test(file)) {
    failures.push(`tracked file path looks like runtime data: ${file}`);
    continue;
  }
  const absolutePath = path.join(root, file);
  const content = fs.readFileSync(absolutePath);
  if (!isProbablyBinary(content)) scanText(`working tree ${file}`, content.toString('utf8'));
}

const history = git(['log', '--all', '-p', '--format=']);
scanText('reachable Git history', history);

if (failures.length > 0) {
  console.error('Release privacy check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Release privacy check passed for ${sourceFiles.length} source files and reachable Git history.`);
