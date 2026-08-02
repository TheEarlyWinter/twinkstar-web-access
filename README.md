# Twinkstar Web Access

Token-protected Chrome DevTools Protocol access for a user-managed Twinkstar Browser instance in HanaAgent.

This is a personal fork of [hanako-web-access](https://github.com/huanyu16/hanako-web-access). It keeps the useful background-tab workflow while making Twinkstar Browser the explicit default and tightening the local proxy boundary.

## What It Does

Twinkstar Web Access connects to a browser instance that the user has already enabled for remote debugging. It can create background tabs, read visible text, run scoped page JavaScript, click, type, scroll, upload files, take screenshots, and close tabs created for the task.

It is intended for login-required and JavaScript-heavy sites where a separate headless browser would lose the user's established session.

## Requirements

- HanaAgent 0.89.0 or newer.
- Node.js 22 or newer in the Hana runtime.
- Twinkstar Browser or another Chromium browser with remote debugging enabled.

Twinkstar Browser uses Chromium, so its DevTools Protocol endpoint is compatible with this plugin.

## Enable Twinkstar Debugging

1. Open Twinkstar Browser.
2. Navigate to `chrome://inspect/#remote-debugging`.
3. Enable remote debugging and accept the browser authorization prompt when shown.
4. In HanaAgent, use `twinkstar-web-access_browser_status` to confirm discovery before opening a tab.

The default discovery location on Windows is `%LOCALAPPDATA%\Twinkstar\User Data\DevToolsActivePort`.

Do not copy a Twinkstar profile into a separate browser profile to obtain a debugging session. Twinkstar's cookie storage uses custom encryption, so copied profiles can lose their usable login state. This plugin deliberately connects to the user-managed browser instance and never restarts it automatically.

## Configuration

| Setting | Default | Purpose |
| --- | --- | --- |
| `browserProfile` | `twinkstar` | Select `twinkstar`, `chrome`, `chromium`, or `auto`. |
| `browserUserDataDir` | empty | Override the browser user-data directory, useful after profile migration. An override is used exclusively. |
| `probeCommonDebuggingPorts` | `false` | Probe ports such as 9222 only after explicit opt-in. |
| `proxyPort` | `3457` | Local loopback port for the plugin proxy. This avoids the upstream plugin's default port 3456. |
| `autoStartProxy` | `false` | Eagerly start the local proxy when the plugin loads. Browser tools always start it on demand; `browser_status` does not. |
| `allowOperateNonOwnedTabs` | `false` | Dangerous escape hatch that allows access to existing browser tabs. Leave disabled. |

## Tools

- `twinkstar-web-access_browser_status`
- `twinkstar-web-access_browser_open_tab`
- `twinkstar-web-access_browser_list_tabs`
- `twinkstar-web-access_browser_read_page`
- `twinkstar-web-access_browser_eval`
- `twinkstar-web-access_browser_click`
- `twinkstar-web-access_browser_type`
- `twinkstar-web-access_browser_scroll`
- `twinkstar-web-access_browser_screenshot`
- `twinkstar-web-access_browser_upload_files`
- `twinkstar-web-access_browser_close_tab`
- `twinkstar-web-access_browser_get_site_pattern`
- `twinkstar-web-access_browser_list_site_patterns`

The plugin creates its own background tabs and records their target IDs. Both the tool layer and the local proxy reject non-owned target IDs unless the dangerous override is explicitly enabled.

## Security And Privacy

- The local proxy listens only on `127.0.0.1` and requires a random token stored in the plugin's private data directory.
- The proxy stops when the plugin unloads.
- New tabs accept only `http`, `https`, and `about:blank` URLs. This prevents the browser tool from becoming a `file:` reader.
- Screenshots are written only under the plugin private data directory.
- Site notes retain domains, success metadata, and text length. They do not retain page body text or page titles.
- `browser_read_page` returns visible page text to the current model context. Treat account pages, private documents, and message pages as sensitive even though the plugin itself does not upload them to a separate service.
- Publishing, payment, deletion, upload, and other meaningful browser actions require explicit user intent. The plugin declares browser operations as external side effects so Hana's approval system can review them.

The plugin data directory can still contain sensitive material, including the proxy token, owned tab URLs, domain notes, and screenshots. It belongs in local plugin data only, never in this repository.

## Installation

Install the source directory through HanaAgent's plugin UI or place it under the user plugin directory as `twinkstar-web-access`. Enable full-access plugins only after reviewing the source and configuration.

For development, use HanaAgent's plugin development loop. Do not run a copied profile or an automatic browser-kill workflow as part of normal plugin startup.

## Open Source Release

Read [docs/OPEN_SOURCE_CHECKLIST.md](docs/OPEN_SOURCE_CHECKLIST.md) before publishing. The repository includes `node scripts/release-check.mjs`, which scans tracked files and Git history for common personal paths and credential patterns. It is a guardrail, not a replacement for manual review.

Enable GitHub secret scanning and push protection for the public repository. GitHub documents that leaked credentials remain reachable through Git history even after they are deleted from the latest revision.

## Upstream And License

This fork is based on [huanyu16/hanako-web-access](https://github.com/huanyu16/hanako-web-access), itself adapted from [eze-is/web-access](https://github.com/eze-is/web-access). Attribution and the MIT license are preserved in [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). This is an unofficial integration and does not include Twinkstar Browser code or resources.
