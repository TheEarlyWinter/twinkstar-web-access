# Security Policy

## Scope

Twinkstar Web Access connects HanaAgent to a user-managed Chromium browser through the Chrome DevTools Protocol. That browser may contain authenticated sessions, personal tabs, private documents, and local upload paths. Treat the plugin as a high-trust integration.

## Local Security Boundary

- The proxy listens on loopback only and requires a random per-plugin token.
- The token, owned-tab registry, screenshots, and site notes are stored under Hana's plugin data directory.
- The proxy enforces the owned-tab registry itself. The tool layer is not the only guard.
- `allowOperateNonOwnedTabs` disables that restriction. It is intentionally dangerous and should stay off for normal use.
- The plugin never launches, kills, or copies a Twinkstar profile automatically.

A process running as the same local user can still be powerful enough to inspect user files or local loopback traffic. The token reduces accidental and cross-process exposure; it does not turn the operating system into a security sandbox.

## Privacy Notes

Page text returned by the browser tools enters the current model context. Do not use this plugin on sensitive pages unless the model provider and task are appropriate for that data.

Do not commit any of the following:

- Plugin data directories
- `proxy-token`
- `owned-tabs.json`
- `DevToolsActivePort`
- Screenshots, downloaded files, logs, or diagnostic captures
- Browser profiles, cookies, sessions, API keys, or account exports

## Reporting A Vulnerability

For a public fork, use the repository's private security advisory channel for credential exposure, browser-session access, proxy authentication bypasses, or cross-tab access bugs. Use public issues only for non-sensitive defects.

Do not include browser target IDs, cookie values, local profile paths, screenshots, or reproduction data from authenticated sites in public reports.
