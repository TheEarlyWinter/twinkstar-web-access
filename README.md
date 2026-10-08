<div align="center">

# 🌐 Twinkstar & Chromium Web Access (Hana V2 App)

<p align="center">
  <b>HanaAgent / OpenHanako 星愿浏览器 (Twinkstar) 与 Chromium 原生浏览器 CDP 安全接入 App</b>
</p>

[![HanaAgent App](https://img.shields.io/badge/HanaAgent-App%20v2-E879F9?style=flat-square&logo=probot&logoColor=white)](https://github.com/liliMozi/openhanako)
[![JavaScript](https://img.shields.io/badge/Language-JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![CDP](https://img.shields.io/badge/Protocol-Chrome%20DevTools%20Protocol-4285F4?style=flat-square)]()

</div>

---

## 📖 简介

让 HanaAgent 通过 Chrome DevTools Protocol（CDP）安全接入用户日常正在使用的浏览器（星愿浏览器、Google Chrome 等），直接复用已有登录态、书签与扩展插件完成动态网页交互。

本项目适配 **Hana V2 官方应用规范 (`manifestVersion: 2`)**，使用 `@hana/app-sdk` 进行声明式工具注册与生命周期管理，V2 运行路径不再使用 V1 的脱离宿主代理启动方式。

## ⚠️ V2 迁移与安装须知

详细迁移规范与权限架构请参阅 **[V2 迁移文档 (docs/V2-MIGRATION.md)](docs/V2-MIGRATION.md)**。

1. **工具命名保持一致**：V2 显式注册并完整保留全部 13 个 `twinkstar-web-access_browser_*` 工具名称。因此，**在安装 V2 前，请务必先在 Hana 扩展管理中停用或卸载 legacy 1.1.1 插件**，避免工具名冲突或 3457 本地代理端口占用。
2. **审查与冲突处理**：如果遇到同 ID 来源冲突，由 Hana 正式安装器与审查卡进行确认与处理，请勿手动修改 `.hanako` 底层目录。
3. **数据独立性**：V2 应用数据保存在独立的数据目录（`app-data/twinkstar-web-access`），不自动沿用旧插件的 `owned-tabs.json` 或 `proxy-token`，旧插件数据安全保留不删除。
4. **安全与进程树回收**：本地 CDP 代理改由 `sdk.runtime.start`（Node native 模式 + external 网络）受管拉起，退出、禁用或撤权时由宿主完整清理进程树。敏感凭据通过 `0600` 私有配置文件传递并在启动后立即 `unlink`，不暴露在命令行参数或环境变量中。
5. **截图与大响应隔离**：截图通过 `sdk.sessions.stageFile({ callToken, ... })` 绑定当前工具调用并交付为官方 SessionFile，返回轻量元数据，避免直接向宿主返回巨大 Base64 突破 4MiB 传输限制。
6. **文件上传安全授权**：文件上传严格经过 `sdk.resources.stat` 与 `sdk.resources.materialize` 验证，不凭 CDP 文件绝对路径绕过资源权限。

## 🧪 浏览器测试状态与实机边界说明

| 浏览器 / 平台 | 测试状态 | 运行环境与说明 |
| --- | --- | --- |
| **V2 App（Linux）** | 已验证装载与隔离测试 | 官方静态校验、隔离 AppHost 启动、单元测试及本地 HTTP/WebSocket CDP 协议夹具。未接入真实用户浏览器。 |
| **Google Chrome / 星愿（Linux、Windows）** | V2 真实浏览器未测试 | 原版 1.1.1 的实机记录不等于 V2 受管运行时验证；Windows 还需要 native helper、身份初始化及目录授权。 |
| **macOS / Edge / Brave / Vivaldi** | 未实机测试 | 不宣称这些系统或衍生浏览器已通过 V2 验证。 |

## 前置条件

- HanaAgent `1.0.0-beta` 或更高版本（支持 App manifestVersion 2）
- 使用 Hana 随附的受管 Node 运行时；官方 V2 AppHost 启动验证需要 Node.js `26` 或更高版本
- 已开启远程调试的星愿浏览器，或其他 Chromium 浏览器

## 配置项 (Settings)

| 配置键 | 默认值 | 作用 |
| --- | --- | --- |
| `browserProfile` | `twinkstar` | 选择 `twinkstar`、`chrome`、`chromium` 或 `auto`。 |
| `browserUserDataDir` | 空 | 覆盖浏览器用户数据目录。 |
| `probeCommonDebuggingPorts` | `true` | 默认开启。在常规发现失败时自动探测 9222、9229、9333 等端口。 |
| `proxyPort` | `3457` | 插件本地回环代理端口。 |
| `autoStartProxy` | `false` | **V2 标记为弃用**。V2 统一采用按需懒加载（always lazy），工具首次调用时受管启动。 |
| `allowOperateNonOwnedTabs` | `true` | 允许操作已有非插件创建的标签页（默认放开，可显式设为 false 开启保护）。 |

## 13 个可用工具清单

全部工具显式注册，保留完整的 `twinkstar-web-access_browser_*` 命名：

1. `twinkstar-web-access_browser_status`：探查浏览器 CDP 端口（支持受管短 probe，不启动持久代理，不开 tab）。
2. `twinkstar-web-access_browser_open_tab`：在后台打开新标签页，并标记为 owned tab。
3. `twinkstar-web-access_browser_close_tab`：关闭由本应用创建的 owned tab。
4. `twinkstar-web-access_browser_list_tabs`：列出本应用所有的 owned tab 目标。
5. `twinkstar-web-access_browser_read_page`：提取标签页的可见文本与页面元数据。
6. `twinkstar-web-access_browser_click`：在目标标签页中点击指定的 CSS 选择器。
7. `twinkstar-web-access_browser_type`：向目标输入框输入文本（支持模拟回车提交）。
8. `twinkstar-web-access_browser_scroll`：滚动页面至指定 Y 偏移或底部。
9. `twinkstar-web-access_browser_screenshot`：对 owned tab 截屏并自动交付登记为会话 SessionFile。
10. `twinkstar-web-access_browser_eval`：在目标页面中执行受限 JavaScript 表达式。
11. `twinkstar-web-access_browser_upload_files`：通过经授权的本地文件选择器上传文件。
12. `twinkstar-web-access_browser_get_site_pattern`：读取本地存储的站点交互模式与备注。
13. `twinkstar-web-access_browser_list_site_patterns`：列出已保存交互模式的域名索引。

## 技能声明 (Skills)

包内保留并随 App 一并分发技能贡献：
- `skills/twinkstar-browser-router`：路由技能
- `skills/web-access`：浏览器接入技能

## 构建与分发

源码目录先运行 `npm install`、`npm test`，然后运行 `node scripts/build-v2-package.mjs --out <新输出父目录>`，生成包含 SDK 运行依赖、排除 Git 元数据及私有运行数据的 App 树。对该树使用 Hana 官方 `validate-app.mjs`（含 `--smoke`）及 `extension-pack.mjs --kind app`，并再次验证最终 ZIP。安装包已包含 SDK，用户安装时不运行 npm。

通用 AppHost smoke 只证明装载，不自动授予原生执行权限，也不等于代理在真实浏览器中已验证。升级的正式操作与权限边界见 [V2-MIGRATION.md](docs/V2-MIGRATION.md)。

## 许可证

[MIT License](LICENSE)
