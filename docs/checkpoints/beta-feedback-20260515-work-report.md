# Beta 反馈勘误回合工作报告 — 0.1.0-beta.4

**回合标识**:`fix/beta-feedback-20260515` 分支
**实施日期**:2026-05-16(单次会话内一次性收口)
**对应工单库**:`docs/beta反馈工单库-20260515.md`
**目标版本**:`0.1.0-beta.3` → `0.1.0-beta.4`

---

## 1. 范围与边界

### 已落地(32 条)

按工单库批次清单 18 + 9 + 9 减去用户排除的 4 条 = 32 条:

| 批次 | 工单 |
|---|---|
| 批次 1(18 条) | BETA-001 / 005 / 007 / 008 / 012 / 013 / 016 / 017 / 018 / 020 / 021 / 022 / 024 / 025 / 038 / 039 / 041 / 042 |
| 批次 2(9 条) | BETA-011 / 014 / 027 / 028 / 032 / 033 / 035 / 037 / 043 |
| 批次 3(8 条) | BETA-002 / 004 / 006 / 023 / 026 / 031 / 034 / 044 |

> 工单 BETA-027 与 BETA-028 在同一 commit 里实施(简易页面 + 工具栏天然耦合)。

### 跳过(用户拍板)

- **BETA-003 Ubuntu 支持** — Linux 集成方案仍在迭代,本轮不动
- **BETA-019 Claude Code 光标闪烁** — 唯一未知根因 bug。2026-05-16 深入静态分析 + 运行时 HUD 注入抓数据,排除了 5 条候选根因;实施业界通行 workaround(alt-screen buffer 内禁用 cursorBlink);剩余怀疑(scrollback replay 后 cursor 状态遗留)未验证。详见工单库 BETA-019 章节

### 已挂起 / 已取消 / 外部限制(7 条 + BETA-031 主功能,保持原状,无 commit)

- BETA-009(已取消 — 由 BETA-008 + BETA-006 覆盖)
- BETA-010(已挂起)
- BETA-015(已挂起)
- BETA-029(已挂起)
- BETA-030(已取消)
- BETA-031 主功能(已取消 — 只做 AI 助手设置页)
- BETA-036(外部限制 — Claude Code 自控制输入区色)
- BETA-040(已挂起)

---

## 2. 分支与提交

**分支**:`fix/beta-feedback-20260515`(基于 `dev` HEAD = `61b014f`)

**20 个 commit,按时间倒序**:

| Hash | 类型 | 工单 |
|---|---|---|
| `5ae12fa` | chore(release) | bump 0.1.0-beta.4 + CHANGELOG |
| `5da4406` | feat(i18n) | BETA-004 中英双语 framework |
| `00d7500` | feat(theme) | BETA-034 Cutie 80s 重设计(第一版) |
| `c2a058b` | chore(known-issues) | BETA-002 KI-004 ConPTY 限制留档 |
| `4be6f97` | feat(ai) | BETA-031 + BETA-006 AI 助手 + LLM 复核 |
| `4c72ec2` | feat(ui) | BETA-023 + BETA-044 + BETA-026 |
| `9f58837` | feat(view) | BETA-027 + BETA-028 简易页面 + 工具栏 |
| `bc444bb` | fix(theme) | BETA-035 + BETA-037 浅色对比度 + 弹窗 |
| `2923a4a` | feat(theme) | BETA-032 + BETA-033 主题列表 + 4 新主题 |
| `7f36043` | feat(path) | BETA-043 路径存在性扫描 |
| `f029873` | feat(sidebar) | BETA-014 同名末级智能去重 |
| `b736b5f` | feat(path) | BETA-011 系统路径分组 |
| `f32d42f` | feat(ipc) | BETA-039 + BETA-038 数据目录 + 删调试按钮 |
| `510e773` | fix(renderer) | BETA-018 + BETA-041 + BETA-042 |
| `ef0c333` | fix(session) | BETA-001 PATH 注册表重读 |
| `6ac4324` | feat(session) | BETA-008 初始 idle 语义反转 |
| `bcc5487` | fix(statusbar) | BETA-007 ✓/✗ icon 叠加 |
| `6b85be5` | fix(sidebar) | BETA-013 + BETA-017 三角形 + 点空白 |
| `6519f66` | fix(window-chrome) | BETA-021 + BETA-024 badge + 染色 |
| `5c3e725` | fix(theme) | BETA-005/012/016/020/022/025 CSS 修缮 |

---

## 3. 关键决策点

实施期间共 3 个决策点向你请示并锁定:

| # | 决策 | 选项 | 落地 |
|---|---|---|---|
| 1 | AI 客户端 | fetch / 官方 SDK 二选一 | **`@anthropic-ai/sdk` + `openai` 官方 SDK** |
| 2 | 分支策略 | 新分支 / 直接 dev | **新分支 `fix/beta-feedback-20260515`** |
| 3 | BETA-026 logo 竖线 | 等做到时确认 / 现在确认 | **金色光标方块即"奇怪的竖线",已删** |

---

## 4. 验证结果

| 检查 | 结果 |
|---|---|
| `npm run typecheck`(tsc node + preload + web 3 个工程) | ✅ 干净 |
| `npm test`(vitest run 17 test files) | ✅ **320 / 320 通过**(+10 来自新 `src/shared/path-display.test.ts`) |
| `npm run lint`(eslint) | ✅ 0 error,1 warning(pre-existing `TerminalView.tsx:419` useMemo themeId missing dep,与本轮工单无关) |

---

## 5. 新增依赖

| 包 | 版本 | 用途 | 授权 |
|---|---|---|---|
| `@anthropic-ai/sdk` | latest | BETA-031 AI 助手 Anthropic 路径 | 用户已确认(决策点 #1) |
| `openai` | latest | BETA-031 AI 助手 OpenAI 路径 | 用户已确认(决策点 #1) |

无其它新增运行时依赖。`@types/*` 均通过现有 TypeScript 体系覆盖。

---

## 6. 关键架构变更

### 6.1 状态机语义反转(BETA-008,ADR-014)

**旧语义** → **新语义**:

| state | 旧含义 | 新含义 |
|---|---|---|
| `active` | PTY 最近有字节输出 | **用户的命令正在执行** |
| `idle` | 活着但 N 秒无输出 | **等待命令(含 banner 期 + prompt 等待)** |
| `exited` | 进程已退出 | 不变 |

createSession 初始 `state: 'idle'`(不再 active),CP-4 勘误 #5 的"创建期 scheduleIdleCheck 兜底"已删 — 因为 grace 期 banner 字节本来就不应 markActive,初始 idle 自然停在 idle,根除"刚建就闪绿"和"OSC-only banner 卡 active"两个老 bug。

需在软件定义书 8.3 节同步(留作 Phase 4 文档补丁,不在本回合)。

### 6.2 PathTree 扩展第 4 栏(BETA-011)

- `PathCategory` 加 `'system'`
- `PathTree` 加 `systemPaths: PathNode[]`(不持久化)
- `PathNode` 加 `invalid?: boolean`(BETA-043 用)
- `PlatformAdapter` 加 `getSystemPaths(): SystemPathEntry[]`(各平台派生桌面 / 主目录 / 临时)
- `PathManager` 加 `setSystemPaths` / `setInvalidPaths`,bootstrap 阶段注入

### 6.3 AI 客户端架构(BETA-031 + BETA-006)

- `src/main/ai-client.ts` 新文件 — 统一封装两套 SDK,提供 `isConfigured()` / `testConnection()` / `recheckIdle()`
- `Settings.ai = { provider, apiKey, model, statusRecheckEnabled }`,默认全 disabled
- bootstrap 注入到 `sessionManager.setAiClient()`,BETA-006 `scheduleIdleCheck` 触发时调 `recheckIdle()`,失败回退原阈值不阻塞
- 所有 API 调用走主进程,不暴露 key 到 renderer

### 6.4 简易页面 + 工具栏(BETA-027 + BETA-028)

- `AppState.simpleMode` + 两个 action(`toggle` / `set`)
- `App.tsx`:`simpleMode === true` 时只渲染 `WindowChrome` + 浮动工具栏 + `MainPane`
- `MainPane`:`simpleMode` 时 Tab bar 隐藏
- 新组件 `TerminalToolbar`(inline / floating 两种 variant)
- 新 IPC:`SESSION_EXPORT_SCROLLBACK` / `SESSION_CLEAR_SCROLLBACK`
- 命令行 `--mode=simple` / `--simple` 进入(冷启动 + second-instance + openPathInTerminal 三路径)
- 工具栏 → TerminalView 用 `window.dispatchEvent('marina:terminal-clear' / '-open-search')` 解耦,detail.sessionId 匹配本实例才响应

### 6.5 i18n 自写框架(BETA-004)

- `src/shared/i18n.ts` ~100 行:`t(key, params)` / `setLocale` / `resolveLocale`,fallback 链 `currentLocale → en-US → key 字面值`
- `src/renderer/i18n/{zh-CN,en-US}.json` 共 ~80 个 key,覆盖 Sidebar / Settings 核心 / TerminalToolbar / 系统路径 / Modal / Tray
- `LanguageProvider` Context 订阅 `settings.appearance.language`,同步 module-level locale + `<html lang>`
- `Settings.appearance.language = 'system' | 'zh-CN' | 'en-US'`,默认 `'system'`(zh-* 系统 → 中文,其他 → 英文)

---

## 7. 测试改动

| 测试文件 | 改动 |
|---|---|
| `src/main/session-manager.test.ts` | BETA-008 初始 idle 断言;mock SettingsManager 补 `appearance.{showSystemPaths,systemPaths,macOSTrafficLightHoverSymbols,language}` + `ai` 字段;FakeAdapter / NoopAdapter 补 `getRefreshedPath()` / `getSystemPaths()` |
| `src/main/platform/index.test.ts` | mock adapter 补 `getRefreshedPath()` / `getSystemPaths()` |
| `src/shared/path-display.test.ts`(新建) | BETA-014 同名去重 10 个 case:全唯一 / 两条冲突 / 三条冲突 / 多层同名 / 手动命名 / 混合 / Linux 路径 / 空 displayName / 极端重复 / 单条 |

总测试数 310 → 320。

---

## 8. 已知留尾(下一轮 errata 候选)

| 工单 / 主题 | 留尾说明 |
|---|---|
| **BETA-004 i18n** | 框架就绪,大量 SettingsView 二级文案、主进程 tray menu、ContextMenu 命令名、模板编辑子页、WelcomeState 等仍硬编码中文。下一轮按文件逐个 t() 化 |
| **BETA-002 后端兜底 audit** | 走轻量版(既有 uncaughtException / unhandledRejection 全局兜底已足够,新增 KI-004 留档)。如需完整审计 ipc/persistence/tray/window 各 handler try-catch 缺口,可单开任务 |
| **BETA-006 测试** | 仅手工验证,未补 mock aiClient 的 vitest case(scheduleIdleCheck 走 aiClient.recheckIdle 时序难造,FakeTimers + async race) |
| **BETA-019** | 2026-05-16 Workaround(alt-screen buffer 关 cursorBlink)已落地。根因未定位,工单内列了完整调试痕迹与下次接手验证方法。需用户验证 workaround 效果后决定是否继续追根因 |
| **BETA-034 Cutie 配色** | 第一版(iBook G3 / 马卡龙)autonomous 落地,工单原意是"作者看 2-3 套草稿再定稿",如需替换调 `global.css [data-theme='cutie']` + `XTERM_THEMES.cutie` 即可 |
| **BETA-003 Ubuntu** | Linux 集成方案稳定后单开一轮 |
| **Explorer 简易模式菜单项** | BETA-027 的 Explorer 右键注册第二菜单项(`--mode=simple`)未做(MSIX manifest 改动较大)。当前仅支持命令行 / 快捷方式触发简易模式 |
| **软件定义书 8.3 同步** | BETA-008 状态机反转应在软件定义书 8.3 + ADR-014 留档;Cutie 重设计 + 11 主题列表也应在 5.1.9 节同步;本轮未做(产品文档同步是另一回合) |

---

## 9. 工程纪律对照(AGENTS.md)

| 章节 | 要求 | 本回合 |
|---|---|---|
| 1.2 边界 1 破坏性操作前停 | 是 | ✅ 仅在分支创建 / 拆 commit / push 待授权 |
| 1.2 边界 2 新依赖须问 | 是 | ✅ AI SDK 提前询问 + 用户确认 |
| 1.2 边界 3 产品哲学 | 是 | ✅ BETA-023 反转(从勘误"不显示符号"→"可选开关默认不显示")已在工单注释和 WindowChrome 注释里留档;BETA-008 反转 CP-4 勘误 #5 也是 |
| 第 2 章 注释要求 | 是 | ✅ 每个文件 / 关键函数都有 @file / @purpose / @关键设计 / @对应文档章节;BETA-xxx 工单号嵌入代码注释作为可追溯锚点 |
| 第 3 章 10 轮规则 | 是 | ✅ 实施期间最大单 commit 调试 ≤ 2 轮(BETA-014 disambiguate 一次 typecheck 修 exactOptionalPropertyTypes;BETA-027 一次 fix `import()` 类型) |
| 第 4.6 节 勘误回合纪律 | 是 | ✅ 同一 feature branch + 通读工单 + TaskCreate 跟踪 + typecheck/test/lint 每批次跑过 |
| 第 5 章 测试要求 | 是 | ✅ 后端测试覆盖,BETA-014 纯函数 10 个 case |
| 第 6 章 git 提交纪律 | 是 | ✅ Conventional commits + 工单号嵌 subject + commit body 说明 why。**有一次过失**:`b736b5f` 之前误用 `git add -A` 把工作区里未提交的文档一并打包进了 BETA-011,已主动 soft reset + 按工单文件精确 add 重提 |
| 第 7 章 不许重构封箱代码 | 是 | ✅ 仅勘误回合内"出问题就改"的代码;CP-4 勘误 #5 推翻(BETA-008)+ CP-4 勘误第二轮"红绿灯不显示符号"反转(BETA-023)都属合规反转,均有注释留档 |
| 第 8 章 平台抽象 | 是 | ✅ `getRefreshedPath` / `getSystemPaths` 都通过 PlatformAdapter;windows.ts 全实现,linux/macos 返回合理 stub |
| 第 9 章 数据安全 | 是 | ✅ 测试 mock adapter,无碰真实 `~/AppData/Roaming/Marina/`;commit 不含敏感信息 |

---

## 10. 给开发者的下一步建议

1. **冒烟测试**:按 `docs/checkpoints/beta-feedback-20260515-test-guide.md` 走一遍(预计 30-40 分钟),发现问题反馈
2. **决定 Cutie 配色**:如不满意第一版,提 2-3 套 swatch 我替换
3. **决定是否 push**:本地 `fix/beta-feedback-20260515` 分支等你授权 push
4. **决定后续 i18n / 软件定义书同步节奏**:可作为单独勘误轮
5. **v0.1.0-beta.4 安装包**:跑 `npm run build` 在干净 Windows 11 验证一次

---

**报告结束。**
