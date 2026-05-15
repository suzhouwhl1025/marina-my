# Marina Changelog

格式参考 [Keep a Changelog](https://keepachangelog.com/),版本号遵循 [SemVer](https://semver.org/)。

## [0.1.0-beta.4] — 2026-05-16

Beta 反馈勘误回合一次性收口 32 条工单。详见 `docs/beta反馈工单库-20260515.md`。
跳过的工单:**BETA-003**(Ubuntu 支持,Linux 集成方案仍在修改)与
**BETA-019**(Claude Code 光标闪烁,唯一未知根因,等用户复现信息)。

### 新增

- **AI 助手**:设置页新分类(Brain icon),支持 Anthropic / OpenAI 两个 provider,
  含 apiKey 输入(显示/隐藏切换)、model 输入、测试连接按钮、状态复核开关。
  (BETA-031)
- **LLM 状态复核**:`active→idle` 跃迁前可让 LLM 看一眼 scrollback 复核,
  避免 Vite 等长输出工具被误判 idle。失败时回退原阈值不阻塞。需要 BETA-031
  设置开启。(BETA-006)
- **简易页面 + 终端工具栏**:Tab bar 右端新增 4 个 lucide 按钮 ——
  复制全部 scrollback / 清屏(同时清 main ring buffer)/ 搜索 /
  简易模式切换。Explorer 右键 / 命令行 `--mode=simple` 可直接进入简易模式。
  (BETA-027 / BETA-028)
- **系统路径分组**:Sidebar 新增第 4 栏"系统",含桌面 / 主目录 / 临时目录。
  整体 + 逐项开关在外观设置里。(BETA-011)
- **4 个新主题**:One Dark Pro / Dracula / Tokyo Night / Catppuccin Mocha。
  主题总数 7→11。(BETA-033)
- **同名末级智能去重**:同 category 内多个路径末段同名时自动补父目录,
  `proj1/src` 与 `proj2/src` 区分;手动命名的不参与。(BETA-014)
- **路径存在性检查**:启动期扫描所有 bookmarks / temporary / recent /
  systemPaths,不可访问的路径标 ⚠️ 不可访问 + 半透明显示。(BETA-043)
- **中英双语 i18n**:`src/shared/i18n.ts` 自写轻量框架,~80 个 key 覆盖
  Sidebar / Settings / TerminalToolbar 等关键 UI;设置页可切换"跟随系统
  / 中文 / English"。(BETA-004)
- **完成/失败 icon 区分**:exited session 状态点叠 ✓(exitCode=0)/ ✗
  (非零)/ 仅灰底(强杀)。(BETA-007)
- **macOS 红绿灯悬浮符号开关**:外观设置可选 hover 时是否显示 ×/−/+,
  默认关。(BETA-023)
- **Win11 右键菜单**:install/uninstall 成功后 toast 提示"请重启计算机"
  以确保 MSIX 加载生效。(BETA-044)

### 改动

- **创建终端初始状态从 active 改为 idle**:语义反转,`active` = 用户命令
  正在执行,`idle` = 等待命令(含 banner 期 + prompt 等待)。消除"新建即
  闪绿"。推翻 CP-4 勘误 #5。(BETA-008,ADR-014)
- **spawn 前从注册表合并最新 PATH**:Windows 安装新软件后,新 PTY 立刻
  能看到新的 python.exe / node.exe,无需重启 Marina。(BETA-001)
- **多行粘贴判定逻辑修复**:原 normalize 只剥一个尾换行,`"ls\n\n"` 被算
  2 行误触发 confirm,改为剥所有尾空行。(BETA-041)
- **切换终端不再"从上往下刷屏"**:scrollback 重放完立即 `scrollToBottom()`。
  (BETA-018)
- **新窗口右键打开终端时自动展开 path**:Explorer "在 Marina 终端中
  打开" 新窗口里直接看到 session,不再要手动展开。(BETA-042)
- **主题选择 UI 改纯文本列表**:删 5 色块色卡,改纯文本 + 深色/浅色 tag。
  (BETA-032)
- **Cutie 主题重设计**:从单调奶油粉换 80s 复古糖果风(iBook G3 / 马卡龙
  色系);所有 ANSI 16 色对浅底对比度 ≥ 4.5:1。配色细节欢迎用户反馈。
  (BETA-034)
- **浅色主题 ANSI bright 集对比度修复**:Rose Pine Dawn 的 brightBlack /
  brightYellow / brightCyan 全部调到 ≥ 4.5:1,解决 Claude Code 在浅色主题
  下出现"浅底白字"问题。(BETA-035)
- **浅色主题右键菜单 / Modal 边框 + 背景透明度调整**:边框换 --muted,
  modal backdrop 改 22%(原 45% 在浅底突兀)。(BETA-037)
- **数据目录显示真实路径**:设置页用 `app.getPath('userData')` 替换硬编码
  `%APPDATA%\Marina`,portable / dev / 自定义 userData 场景准确。(BETA-039)
- **Sidebar 分组标题字号 / 颜色加重**:font-size 11→12,color --subtle
  → --text。(BETA-012)
- **Sidebar 三角形换 lucide ChevronRight/Down**:文字 ▶ 视觉上不够清晰。
  (BETA-013)
- **Sidebar 顶部与右侧 Tab bar 对齐**:32px spacer。(BETA-016)
- **Sidebar 点空白处取消选中**:`e.target === e.currentTarget` 判断。
  不依赖快捷键(哲学约束)。(BETA-017)
- **Tab 卡片加顶部圆角 + padding-right**:浏览器风格圆角;斜体字右上角不
  再被切。(BETA-020 / BETA-025)
- **Window 标题栏改动**:删底部 border 分割线;`Window N` badge 去矩形
  仅留纯文字。(BETA-021 / BETA-022)
- **macOS 风格标题染色修复**:浅色主题下 `--subtle` 对背景不可见,改 `--text`。
  (BETA-024)
- **删 logo 中的金色光标方块**:视觉上与 `>_` 提示符语义重复。(BETA-026)

### 删除

- **设置页"复制 PS 命令"调试按钮**:Win11 右键菜单卡片内不再展示
  install/uninstall 命令副本。(BETA-038)

### 已知限制

- **KI-004**:Windows ConPTY 强约束 — Marina 主进程崩溃则所有 PTY 必死。
  接受为 V1 限制,用户应定期 export 设置;长任务挂 tmux / screen / nohup
  以独立于 Marina 主进程。(BETA-002)

### 工程

- 新依赖:`@anthropic-ai/sdk` + `openai`(AI 助手用,用户已确认)
- 测试:320 全过(+10 来自 `path-display.test.ts`)
- 分支:`fix/beta-feedback-20260515`,基于 `dev`(beta.3)

### 跳过

- **BETA-003 Ubuntu 支持**:Linux 集成方案仍在迭代,本轮不动
- **BETA-019 Claude Code 光标闪烁**:唯一未知根因 bug,等用户复现信息

---

## [0.1.0-beta.3] — 2026-05-15

Beta 试用阶段,详见 git log。
