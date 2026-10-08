# Security Policy & Architecture (Hanako V2)

## Scope & Threat Model

Twinkstar Web Access connects HanaAgent to a user-managed Chromium browser through the Chrome DevTools Protocol (CDP). Because that browser may contain authenticated user sessions, personal tabs, private documents, and local upload paths, this App is treated as a high-trust capability and adheres to strict Hanako V2 sandboxing and execution boundaries.

## V2 Sandboxing & Execution Boundaries

1. **Managed Runtime (No Bare Spawns)**:
   - The CDP proxy is executed exclusively as a managed Node runtime (`sdk.runtime.start`) with `profile: "native"` and `network: "external"`.
   - Bare `child_process.spawn(..., { detached: true })` is completely eliminated.
   - When the App is uninstalled, disabled, or revoked, the host terminates the entire managed process group.
   - The App explicitly rejects fallback or downgrade to `local-machine` profile. Failures to start native runtime fail explicitly.

2. **Token Privacy & Bootstrap Protocol**:
   - The communication token and runtime configuration are written to a private `0600` bootstrap file in the App's private `dataDir`.
   - The worker runtime reads this configuration and unlinks the bootstrap file immediately upon startup (`fs.unlinkSync`), eliminating credential persistence on disk.
   - Tokens are never exposed in command-line arguments (`process.argv`), environment variables, or host logs.

3. **Loopback & HTTP Guard**:
   - The local proxy binds only to `127.0.0.1` on the configured port (default `3457`).
   - Every request requires the exact `x-twinkstar-web-access-token` header verified with constant-time equality (`timingSafeEqual`).
   - Communication between the App host entry and the proxy is routed via `sdk.runtime.fetch(runtimeId, path, init)`. Requests cannot target arbitrary loopback ports or external hosts.

4. **Owned Tab Protection**:
   - The App only allows operations on tabs created by this App (`owned-tabs.json`).
   - Existing user tabs (e.g. personal email, active logins, shopping) are rejected unless `allowOperateNonOwnedTabs` is explicitly toggled by the user.
   - URL validation rejects dangerous schemes (`file:`, `javascript:`, `chrome:`, `data:`).

5. **Resource Authorization for File Uploads**:
   - In `twinkstar-web-access_browser_upload_files`, local files selected for upload must be verified through `sdk.resources.stat` and `sdk.resources.materialize`.
   - The App does not pass arbitrary raw filesystem paths to the browser without checking host-granted resource permissions.

6. **Screenshot Delivery via Official Stage**:
   - Screenshots are written to private App storage and delivered to the session via `sdk.resources.stage` using `context.callToken`.
   - Screenshots are returned as registered `session-file` artifacts instead of raw base64 payloads to stay safely within the 4MiB response boundary.

7. **Windows Native Identity & Profile Boundaries**:
   - Windows native runtime operates under a dedicated runtime identity.
   - Real browser candidate directories are computed by the parent entry before runtime launch and specified as explicit `readRoots` with `app/resources.read` authorization.
   - Windows setup requires native identity initialization.

## Reporting A Vulnerability

Please use the repository's private security advisory channel for reporting any vulnerability related to credential exposure, browser-session hijacking, proxy authentication bypasses, or filesystem boundary violations.
