# CP-3 用户测试指南

> 目标:验证 CP-3 完成标志(AGENTS.md 4.2,ADR-008 修订后)的所有项。
>
> 估时:约 25-35 分钟(看 cwd 跟踪触发是否顺畅)。
>
> ⚠ 重要:CP-3 引入了**与 CP-2 不同的行为语义**(ADR-008 path/cwd 解耦 + 砍墓地)。在测试前请阅读"语义变更总览"。

---

## 准备

1. 确保 Node.js 20+(`node --version`)。
2. 项目根目录跑:
   ```powershell
   git checkout checkpoint-3
   npm install
   ```
3. 完全关掉之前运行的 EasyTerm(右键托盘 → "完全退出 EasyTerm"或任务管理器结束 EasyTerm.exe)。
4. **强烈建议**先备份并清空 `%APPDATA%\EasyTerm\` 旧数据(CP-2 的 settings.json 不再有 `sessionTombstoneMinutes` 字段,deep-merge 会自动补上 v1.2 字段;但为了避免任何 schema 不匹配的疑似 bug,清盘最干净):
   ```powershell
   Move-Item "$env:APPDATA\EasyTerm" "$env:APPDATA\EasyTerm.bak.cp3"
   ```

---

## 语义变更总览(必读)

CP-3 行为变化(与 CP-2 / 早期 V1 设计不同):

| 行为 | CP-2 | CP-3 (ADR-008) |
|---|---|---|
| session 内 `cd D:\elsewhere` 后,session 在侧栏的归属 | (未实现) | **不变**;tab 上出现 ⚠️ 提示真实 cwd |
| PTY 退出后 session 标签 | 立即消失 | **变灰显示 ⚫**,scrollback 保留,**永不自动消失**,需用户右键关闭 |
| "重启已退出 session" 功能 | (CP-2 没做) | **永不提供**;想再跑就在同一 path 新建一个 |
| 启动模板 | 仅 'shell' 一种 | shell / claude-code / codex / opencode 四种 |
| OSC 1337 cwd 跟踪 | 关 | 开;PowerShell 与 cmd 都注入 hook |
| PowerShell 启动 banner | 重开窗口时重复 8 次 (errata #2) | 仅 1 行(`-NoLogo` 应当根除) |

---

## 测试 1:基础启动 + 横幅修复(预计 1 分钟)

1. 跑 `npm run dev`。
2. 等到 EasyTerm 窗口出现,自动选中第一个收藏路径(若没有收藏就显示欢迎页)。
3. 添加一个收藏路径(收藏区 + 按钮 → 选任意目录),双击它。
4. 终端区出现 PowerShell。
5. **预期**:终端区**最多 1 行** "Windows PowerShell" 横幅(因 `-NoLogo` 通常一行也没有,只显示提示符)。
6. **失败现象**:看到多行 "Windows PowerShell\n版权所有..."(CP-2 errata #2 残留)。
7. 关掉这个窗口,从托盘菜单"打开新窗口",再去同一路径双击 → 仍然不应该出现 banner 重复。

---

## 测试 2:状态点(active / idle / exited)(预计 2 分钟)

1. 在某收藏路径双击启动 PowerShell。
2. **预期**:tab 上有一个**绿色小点**(active),侧栏 SessionItem 也是绿色。
3. 等 ~3 秒不动键盘(默认 idle 阈值 2 秒),状态点应变成**黄色**(idle)。
4. 在终端里敲一个回车 → 立刻变回**绿色**(active)。
5. 在终端里输入 `exit` 回车 → PTY 死掉,但 **tab 不消失**,变成**灰色 ⚫**;tab 标题旁有 `⚫` 小图标;鼠标悬停 tab 看 tooltip 显示 "已退出 (exitCode=0)"。
6. 终端区状态条也显示 `· 已退出 (exitCode=0)`,scrollback 仍可见(向上滚看历史)。
7. 在那个灰显的 tab 上右键 → "关闭" → tab 消失,session 真销毁。

---

## 测试 3:path/cwd 解耦(ADR-008 核心)(预计 3 分钟)

> **这条是 CP-3 与 CP-2 行为最大的差别,务必仔细看。**

1. 添加一个收藏路径,例如 `C:\Users\<你>\projects\auth`(如不存在就用其他你机器上有的目录)。
2. 双击它,启动 PowerShell。
3. 在终端里输入 `cd D:\` 回车(或任何与起点不同的目录,可以是 `cd ..`)。
4. **预期**(关键):
   - tab 标题旁出现 **⚠️** 黄色图标
   - 鼠标悬停 tab → tooltip 显示 `当前目录 → D:\` 与 `(原: C:\Users\...\projects\auth)`
   - 终端区状态条左下显示路径变成 `⚠ D:\`
   - **侧栏左边 session 仍归属 `~/projects/auth`(不会跑到 D:\ 下)**
   - 侧栏的 SessionItem 上也有一个小 ⚠
5. 输入 `cd C:\Users\<你>\projects\auth`(回到原位置)→ ⚠️ 应该消失。
6. **失败现象**:tab 跳到了别的 path(CP-2 早期设计的行为),或者 ⚠️ 永远不出现,或者 cwd 显示永远是初始值。

---

## 测试 4:cwd 跟踪 cmd.exe(预计 2 分钟)

1. 在 EasyTerm 设置页面(暂未启用,跳过)或者通过手改 `%APPDATA%\EasyTerm\settings.json`(关 EasyTerm 后改 `shell.defaultShellId` 为 `cmd`,再重启)。

   **简化**:CP-3 没有设置 UI,所以这条难以直接测;略过即可。下面用替代方法:

   替代:打开一个新 PowerShell session,输入 `cmd.exe` 进 cmd → 在 cmd 里 `cd D:\` → 看 tab ⚠️ 是否更新。
2. **预期**:cmd 内 cd 后,tab ⚠️ 仍然出现,真实 cwd 显示更新。
3. **失败现象**:cmd 内 cd 完全没反应,tab 永远显示原 cwd。

(注:cmd hook 通过 PROMPT 环境变量,只在每次 prompt 出现时报告 cwd。所以 cd 后必须等到 cmd 重新出 `> ` 提示符才更新。)

---

## 测试 5:启动模板(4 个内置)(预计 3 分钟)

1. 进入收藏路径,但不双击;点一下选中,右侧主区显示 EmptyPathState(大加号 + 模板按钮列表)。
2. **预期**:看到 4 个模板按钮,从左到右大致是:
   - 🐚 Shell
   - 🤖 Claude Code
   - ⚡ Codex
   - 📦 OpenCode
3. 点 **🐚 Shell** → 打开 PowerShell session(行为同测试 1)。关掉它(右键关闭)。
4. 点 **🤖 Claude Code** → 应该启动 PowerShell + 自动 exec `claude`。
5. **预期**:
   - 如果你装了 claude(Anthropic 的 CLI):它应该启动并显示其欢迎信息
   - 如果你没装:终端区会显示 PowerShell 报错 `claude : 无法将 "claude" 项识别为 cmdlet、函数、脚本文件或可运行程序的名称...`,**这是预期的**(命令不存在的"自然报错",不弹对话框)。session 仍然存在,你可以继续在 PowerShell 里操作。
6. 同样测试 ⚡ Codex 和 📦 OpenCode(命令未装时也是同样的"自然报错")。

---

## 测试 6:收藏路径默认模板(预计 2 分钟)

1. 在收藏路径上**右键单击**(注意是右键 path 行,不是 session 行)。
2. **预期**:弹一个 prompt 对话框,列出 4 个模板,问"输入序号 1-4"。
3. 输入 `2` 回车(选 Claude Code),关闭弹窗。
4. **预期**:无明显 UI 变化(后端默认模板已记到 bookmarks.json)。
5. 现在双击该路径。
6. **预期**:启动的是 **Claude Code**(而不是默认 shell)。
7. 关掉 session,再次右键路径 → 输入 `1` 选回 Shell,双击验证回到 Shell。
8. 关闭 EasyTerm,完全退出。重启 EasyTerm,验证默认模板**持久化了**(再双击仍是上次设的模板)。

---

## 测试 7:exited session 的 scrollback 保留(预计 2 分钟)

1. 启动一个 PowerShell session。
2. 输入若干命令,例如 `dir`、`ls`、`Get-Date`,产生足够 scrollback。
3. 输入 `exit` 让 PTY 退出。
4. **预期**:tab 变灰显 ⚫,但内容**不消失**,你能上下滚动 scrollback 查看 `dir` 的全部输出。
5. 关闭这个窗口(右上角 ×)。
6. 从托盘菜单"打开新窗口",**预期**:新窗口里那个 exited session 仍然存在,变灰;点击它显示 scrollback 历史(无主 session 接管)。
7. 右键关闭它,session 才真消失。

---

## 测试 8:跨窗口接管 exited session(预计 2 分钟)

1. 启动两个窗口(托盘菜单"打开新窗口")。
2. 在窗口 A 启动一个 session,跑 `dir`(产生 scrollback)。
3. 在窗口 A 让该 session `exit`(进入 exited 状态)。
4. 切到窗口 B,看侧栏:**预期**那个 exited session 在窗口 B 里也可见(灰显 + ⚫)。
5. 在窗口 B 点击该 session → **预期**接管成功,B 看到完整 scrollback 历史。
6. 在窗口 B 右键关闭该 session → 销毁。

---

## 测试 9:多 session 同 path 切换不丢历史(预计 2 分钟)

1. 在某收藏路径开 session A,在终端跑 `dir`。
2. 点 tab 区右上 + 按钮(或者再次双击该 path)新建 session B。
3. 在 B 里跑 `Get-Date`。
4. 切回 A 的 tab → **预期**看到完整 `dir` 输出。
5. 切回 B 的 tab → 看到 `Get-Date` 输出。
6. (本测试是 CP-2 错误 #1 "tab 跳" 的回归测试 — 切 tab 时其位置不应改变。)

---

## 测试 10:多窗口 session 不重叠(预计 1 分钟)

1. 开窗口 A 与 B,在 A 启动一个 session(变蓝/选中)。
2. 在 B,**预期**那个 session 在 B 的 tab 区显示为**最右边的灰显 tab**(其他窗口持有);点击它会聚焦到窗口 A,而不是抢占。
3. 在 A 关闭那个 session 的 tab(右键关闭)。
4. **预期**:B 那边的灰显 tab 也立即消失。

---

## 测试 11:CP-2 已通过项的回归(预计 5 分钟)

快速过一遍 CP-2 完成标志,确保没有 regression:

- [ ] 三栏侧栏(收藏 / 临时 / 最近)显示正常
- [ ] 收藏路径 + 按钮选文件夹工作
- [ ] 关闭再开应用收藏还在
- [ ] Explorer 拖文件夹到侧栏加入收藏
- [ ] 临时分类(在某非收藏路径双击 / 右键加入收藏 — CP-3 暂没右键加入收藏功能,只能通过手改路径方式制造)
- [ ] 多窗口共享侧栏数据
- [ ] 主题切换按钮(header 上)循环 5 个主题(主题颜色实际不变是 CP-4 的事,这里只验证按钮 cycle 不报错)
- [ ] 跨窗口接管 owner

---

## 测试 12:回归 — 持久化文件兼容(预计 1 分钟)

1. 关 EasyTerm。打开 `%APPDATA%\EasyTerm\settings.json`,看顶层结构。
2. **预期**:
   - 没有 `advanced.sessionTombstoneMinutes` 字段(或如果有从 CP-2 留下的,deep-merge 应该忽略)
   - `advanced.activeIdleThresholdSeconds` 仍存在(默认 2)
3. 看 `templates.json`(CP-3 新增):
   - 应该是 4 个内置模板齐全
   - `defaultTemplateId: "shell"`(除非你测试 6 改过)

---

## 全部通过后

回复 agent:**"CP-3 通过,可以开始 CP-4"**

或具体反馈失败项,例如:
- "测试 3 第 4 步:cd 后 tab 没出现 ⚠️"
- "测试 5 第 5 步:claude-code 模板按钮点击后弹白屏"

---

## 失败时的诊断思路

| 现象 | 可能原因 | 看哪 |
|---|---|---|
| Banner 重复 | hook 注入路径多次 dot-source | dev console 看 PowerShell 启动参数;`buildShellLaunchParams` 返回应只含**一次** `. 'hook.ps1'` |
| ⚠️ 永远不出现 | OSC 1337 hook 没注入成功 / parser bug | 主进程 stderr 看 sessionStateChanged 事件;在终端里手敲 `Write-Host "`e]1337;CurrentDir=test`a"` 看是否解析(应该会让 ⚠️ 出现指向 test) |
| 模板按钮点击无反应 | IPC 未广播 templates 或 store 为空 | DevTools console 看 `state.templates` 是否有 4 项 |
| 已退出 session 立即消失 | SessionManager 错误地走了 destroyPath | 看主进程 stderr,`sessionDestroyed` 事件不应在 PTY exit 时发(只应在 user-closed / app-quit) |
| 默认模板不持久化 | templates.json 写盘失败 / bookmarks.json 没记 defaultTemplateId | 关 EasyTerm 后看两个文件内容 |

诊断时优先看主进程 console(VS Code Run + Debug 或 `npm run dev` 终端)。所有日志带 `[SessionManager]` / `[PathManager]` 等模块前缀,grep 即可定位。
