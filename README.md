# 星愿浏览器访问插件

让 HanaAgent 通过 Chrome DevTools Protocol（CDP）安全接入用户自己正在使用的星愿浏览器，并复用已有登录态完成动态网页任务。

本项目基于 [hanako-web-access](https://github.com/huanyu16/hanako-web-access) 的个人 fork 改造。它以星愿浏览器为默认目标，并强化了本地代理、标签页边界和隐私数据处理。

## 它能做什么

星愿浏览器访问插件会连接已经由用户开启远程调试的浏览器实例。它可以创建后台标签页、读取可见文本、执行受限页面 JavaScript、点击、输入、滚动、选择上传文件、截图，并关闭任务创建的标签页。

它适合以下场景：

- 需要登录态的网站
- JavaScript 渲染较重的页面
- 站内搜索、页面交互、文件上传等任务
- 普通无头浏览器无法复用的日常浏览器会话

静态公开网页、官网文档和简单事实查询，仍应优先使用 Hana 的网页搜索与网页读取工具。

## 前置条件

- HanaAgent `0.89.0` 或更高版本
- Hana 运行时中的 Node.js `22` 或更高版本
- 已开启远程调试的星愿浏览器，或其他 Chromium 浏览器

星愿浏览器采用 Chromium 内核，其 DevTools Protocol 端点可以直接与本插件兼容。

## 开启星愿远程调试

1. 打开星愿浏览器。
2. 在地址栏访问 `chrome://inspect/#remote-debugging`。
3. 开启远程调试；出现浏览器授权提示时选择允许。
4. 在 HanaAgent 中调用 `twinkstar-web-access_browser_status`，确认插件已发现星愿浏览器后再打开任务标签页。

Windows 默认发现路径为：

```text
%LOCALAPPDATA%\Twinkstar\User Data\DevToolsActivePort
```

请勿复制星愿浏览器 profile 后再启动调试实例。星愿的 Cookie 使用自定义加密，复制 profile 可能导致登录态无法使用。本插件只连接用户自行管理的浏览器实例，不会自动重启、关闭或复制星愿浏览器 profile。

## 配置项

| 配置键 | 默认值 | 作用 |
| --- | --- | --- |
| `browserProfile` | `twinkstar` | 选择 `twinkstar`、`chrome`、`chromium` 或 `auto`。 |
| `browserUserDataDir` | 空 | 覆盖浏览器用户数据目录，适用于迁移 profile 后的场景。设置后只使用该目录。 |
| `probeCommonDebuggingPorts` | `false` | 显式开启后，发现失败时才探测 9222 等常见调试端口。 |
| `proxyPort` | `3457` | 插件本地回环代理端口，用于避开上游插件默认使用的 3456。 |
| `autoStartProxy` | `false` | 插件加载时是否预先启动代理。浏览器工具会按需启动代理，`browser_status` 不会启动。 |
| `allowOperateNonOwnedTabs` | `false` | 危险开关：允许操作已有浏览器标签页。日常使用请保持关闭。 |

## 可用工具

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

插件会创建自己的后台标签页并记录 target ID。默认情况下，工具层和本地代理都会拒绝操作非插件创建的标签页。

## 安全与隐私

- 本地代理只监听 `127.0.0.1`，并要求保存在插件私有数据目录中的随机令牌。
- 插件卸载时会请求停止代理。
- 新标签页只接受 `http`、`https` 和 `about:blank`，避免浏览器工具成为 `file:` 本地文件读取器。
- 截图只会写入插件私有数据目录。
- 站点笔记只保存域名、成功状态和文本长度，不保存页面标题或正文。
- `browser_read_page` 返回的可见页面文本会进入当前模型上下文。账户页、私有文档和聊天页面都应按敏感数据处理。
- 发布、支付、删除、上传和其他有实质影响的网页操作，必须有用户明确意图。插件将这些动作声明为外部副作用，供 Hana 的审批机制审查。

插件数据目录仍可能包含代理令牌、已创建标签页 URL、站点笔记和截图。这些内容只能留在本地插件数据中，绝不能提交到仓库。

## 安装

可通过 HanaAgent 插件界面安装源码目录，或将目录放入用户插件目录并命名为 `twinkstar-web-access`。启用 full-access 插件前，请先审阅源码和配置。

开发阶段请使用 Hana 的插件开发槽。正常启动流程中不要复制浏览器 profile，也不要实现自动杀掉浏览器进程的工作流。

## 开源发布

公开推送前请阅读 [docs/OPEN_SOURCE_CHECKLIST.md](docs/OPEN_SOURCE_CHECKLIST.md)。仓库提供了 `node scripts/release-check.mjs`，它会扫描当前源码与 Git 历史中的常见个人路径和凭据模式；它是安全护栏，不能替代人工审查。

建议为公开仓库开启 GitHub Secret Scanning 和 Push Protection。删除最新提交中的凭据并不能抹去历史中已经暴露的数据。

## 上游与许可证

本项目基于 [huanyu16/hanako-web-access](https://github.com/huanyu16/hanako-web-access)，后者又参考并适配了 [eze-is/web-access](https://github.com/eze-is/web-access)。版权归属和 MIT 许可证保留在 [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 中。

这是非官方、无关联的星愿浏览器集成项目，不包含星愿浏览器的代码、二进制文件或资源。
