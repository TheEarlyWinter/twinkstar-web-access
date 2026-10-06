---
name: twinkstar-browser-router
license: MIT
github: https://github.com/TheEarlyWinter/twinkstar-web-access
summary: Route existing-session and interactive browser tasks to Twinkstar & Chromium Web Access.
description: |
  Use this routing skill whenever a user mentions Google Chrome, Twinkstar Browser, Chromium, an existing logged-in browser session, dynamic webpages, in-site search, forms, or browser interaction. Requests such as “use Chrome”, “use Twinkstar Browser”, “use my existing login”, “谷歌浏览器”, “Chrome”, “星愿浏览器”, “已有登录态”, “动态网页”, “站内搜索”, or “用浏览器处理” should route through the twinkstar-web-access plugin tools whenever an existing session or interactive page is relevant. Do not use it for ordinary public static-page search or simple web fetch tasks.
default-enabled: true
---

# 星愿与 Chromium 浏览器路由

此 skill 是星愿与 Chromium 原生浏览器（如 Google Chrome）任务的显式入口。网页实际操作只使用已安装的 `twinkstar-web-access` 插件工具；更详细的操作与安全说明遵循同插件的 `twinkstar-web-access` skill。

## 路由流程

1. 先调用 `twinkstar-web-access_browser_status` 检查可用的浏览器端点。
2. 状态正常后，调用 `twinkstar-web-access_browser_open_tab` 新建任务专属后台标签页。
3. 优先用 `twinkstar-web-access_browser_read_page` 读取内容；只有确实需要 DOM 检查或用户明确要求动作时，使用其余 `twinkstar-web-access_browser_*` 工具。
4. 任务完成后，用 `twinkstar-web-access_browser_close_tab` 关闭插件创建的标签页。

## 安全边界

- 只使用 `twinkstar-web-access_browser_*` 工具处理这类任务。
- 不使用 `browser-cdp`、`agent-browser`、`setup-cdp-chrome.js`、复制 profile 或杀浏览器进程的旧流程。
- 状态检查失败时，报告问题并让用户检查远程调试设置；不重启浏览器、不猜测端口、不绕过已有会话边界。
- 默认只操作插件创建的标签页。操作已有标签页前，用户必须明确提出并理解隐私边界。
- 发布内容、提交表单、发送消息、付款、删除或上传文件前，先确认用户意图。

公开静态网页、新闻、文档或简单事实查询优先使用普通网页搜索和读取工具，不需要经过此路由 skill。
