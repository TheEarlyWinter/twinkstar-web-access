# 开源发布检查清单

首次公开推送和每次发布前，都应完成以下检查。

## 本地审查

1. 检查 `git config user.name`、`git config user.email` 与 `git remote -v`。Git 提交会公开作者身份；若在意个人邮箱隐私，请使用明确的公开昵称和 GitHub noreply 邮箱。将新仓库设为 `origin`，把原项目保留为独立 `upstream`。
2. 在仓库根目录运行 `node scripts/release-check.mjs`。
3. 检查 `git status --ignored`，确认没有暂存运行数据、截图、日志、profile 或测试捕获。不要把整个工作目录直接压缩发布，`.git` 目录可能包含本地 reflog 元数据。
4. 使用 `git diff --cached --check` 和 `git diff --cached` 审阅全部暂存内容。
5. 检查所有可达历史，而非只看当前工作树：

   ```powershell
   git log --all -p | Select-String -Pattern 'Users\\|BEGIN .*PRIVATE KEY|ghp_|github_pat_|sk-'
   ```

6. 检查 issue 模板、文档图片、提交信息、发布说明和 CI 日志。公开仓库暴露的内容不止已跟踪源文件。

## 仓库设置

公开 GitHub 仓库建议启用：

- Secret Scanning
- Push Protection
- Dependabot Alerts
- 条件允许时启用 Code Scanning

GitHub 的文档说明：Secret Scanning 会检查 Git 历史；从最新提交删除凭据，无法消除已经进入历史的暴露风险。尽可能在首次公开推送前开启 Push Protection。

## 本项目绝不能公开的内容

- 真实浏览器 profile 或复制出的 profile 目录
- 本地浏览器的 `DevToolsActivePort`
- 代理令牌、已创建标签页记录、截图、日志或诊断输出
- 账户页面、浏览器 target ID、Cookie 值、上传路径或下载文件
- 本地用户名、家目录或私有网络地址

## 误推敏感数据后的处理

1. 立即撤销或轮换泄露的凭据。
2. 视情况限制访问或临时下线仓库。
3. 使用适当的历史重写流程从 Git 历史删除数据。
4. 假定 clone、fork、缓存、CI 日志和密钥扫描服务已经见过泄露内容。
5. 记录修复过程时，避免在 issue 或提交信息中再次贴出凭据。

这份清单只能提供实际可执行的护栏，无法证明一个仓库绝对不含任何私人信息。
