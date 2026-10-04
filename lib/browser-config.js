import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const PROFILE_IDS = Object.freeze(['twinkstar', 'chrome', 'chromium', 'auto']);
const DEFAULT_PROFILE = 'twinkstar';

export const BROWSER_PROFILES = Object.freeze({
  twinkstar: { id: 'twinkstar', label: 'Twinkstar Browser' },
  chrome: { id: 'chrome', label: 'Google Chrome' },
  chromium: { id: 'chromium', label: 'Chromium' },
});

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function defaultUserDataDir(profile, { platform, env, homeDir }) {
  const localAppData = env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');

  if (platform === 'win32') {
    if (profile === 'twinkstar') return path.join(localAppData, 'Twinkstar', 'User Data');
    if (profile === 'chrome') return path.join(localAppData, 'Google', 'Chrome', 'User Data');
    if (profile === 'chromium') return path.join(localAppData, 'Chromium', 'User Data');
  }

  if (platform === 'darwin') {
    if (profile === 'chrome') return path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome');
    if (profile === 'chromium') return path.join(homeDir, 'Library', 'Application Support', 'Chromium');
  }

  if (platform === 'linux') {
    if (profile === 'chrome') return path.join(homeDir, '.config', 'google-chrome');
    if (profile === 'chromium') return path.join(homeDir, '.config', 'chromium');
  }

  return null;
}

export function normalizeBrowserProfile(value, platform = process.platform) {
  const profile = nonEmptyString(value).toLowerCase();
  return PROFILE_IDS.includes(profile) ? profile : (platform === 'win32' ? DEFAULT_PROFILE : 'auto');
}

export function resolveBrowserConfig(input = {}, runtime = {}) {
  const platform = runtime.platform || process.platform;
  const env = runtime.env || process.env;
  const homeDir = runtime.homeDir || os.homedir();
  let profile = normalizeBrowserProfile(input.profile, platform);
  const userDataDir = nonEmptyString(input.userDataDir);
  const probeCommonDebuggingPorts = input.probeCommonDebuggingPorts === true;

  if (platform === 'linux' && !userDataDir && profile === 'twinkstar') {
    profile = 'auto';
  }
  const candidateProfiles = profile === 'auto'
    ? ['twinkstar', 'chrome', 'chromium']
    : [profile];
  const candidates = [];
  const seen = new Set();

  const addCandidate = (candidate) => {
    if (!candidate?.userDataDir) return;
    const key = platform === 'win32'
      ? candidate.userDataDir.toLowerCase()
      : candidate.userDataDir;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  if (userDataDir) {
    addCandidate({
      id: profile === 'auto' ? 'custom' : profile,
      label: profile === 'auto' ? 'Custom Chromium Browser' : BROWSER_PROFILES[profile].label,
      userDataDir: path.resolve(userDataDir),
      source: 'configuration',
    });
  } else {
    for (const candidateProfile of candidateProfiles) {
      const defaultDir = defaultUserDataDir(candidateProfile, { platform, env, homeDir });
      if (!defaultDir) continue;
      addCandidate({
        id: candidateProfile,
        label: BROWSER_PROFILES[candidateProfile].label,
        userDataDir: defaultDir,
        source: 'default',
      });
    }
  }

  return {
    profile,
    userDataDir: userDataDir || null,
    probeCommonDebuggingPorts,
    candidates,
  };
}

export function getBrowserConfig(ctxLike) {
  return resolveBrowserConfig({
    profile: ctxLike?.config?.get?.('browserProfile'),
    userDataDir: ctxLike?.config?.get?.('browserUserDataDir'),
    probeCommonDebuggingPorts: ctxLike?.config?.get?.('probeCommonDebuggingPorts') === true,
  });
}

export function readDevToolsActivePort(userDataDir) {
  const file = path.join(userDataDir, 'DevToolsActivePort');
  try {
    const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
    const port = Number.parseInt(lines[0], 10);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
    return { file, port, wsPath: lines[1] || null };
  } catch {
    return null;
  }
}

export function isLocalPortOpen(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, '127.0.0.1');
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

export async function discoverBrowserEndpoint(config) {
  for (const candidate of config.candidates || []) {
    const endpoint = readDevToolsActivePort(candidate.userDataDir);
    if (!endpoint) continue;
    if (await isLocalPortOpen(endpoint.port)) {
      return {
        ...endpoint,
        source: 'DevToolsActivePort',
        browser: { id: candidate.id, label: candidate.label },
      };
    }
  }

  if (config.probeCommonDebuggingPorts === true) {
    for (const port of [9222, 9229, 9333]) {
      if (await isLocalPortOpen(port)) {
        let wsPath = null;
        let label = 'Chromium Browser';
        try {
          const res = await fetch(`http://127.0.0.1:${port}/json/version`);
          const data = await res.json();
          if (data.webSocketDebuggerUrl) {
            const u = new URL(data.webSocketDebuggerUrl);
            wsPath = u.pathname;
          }
          if (data.Browser) label = data.Browser;
        } catch {}
        return {
          port,
          wsPath,
          source: 'common-debugging-port',
          browser: { id: 'unknown', label },
        };
      }
    }
  }

  return null;
}
