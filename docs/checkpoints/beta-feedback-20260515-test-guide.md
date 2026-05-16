# Beta 反馈勘误回合测试指南 — 0.1.0-beta.4

**面向**:开发者(Liyue-Cheng)冒烟验证 32 条工单是否落地正确
**预计耗时**:30-40 分钟(全部走完一遍)
**分支**:`fix/beta-feedback-20260515`
**对应工单库**:`docs/beta反馈工单库-20260515.md`

---

## 0. 准备

```pwsh
git checkout fix/beta-feedback-20260515
npm install          # 拉新依赖 @anthropic-ai/sdk + openai
npm run dev          # 启动 dev 模式
```

启动后应看到 Marina 窗口出现。如果有 ts / vite 报错先回头看 `npm run typecheck` 输出。

### 失败时去哪儿看

- 主进程日志:`%APPDATA%\Marina\logs\main-YYYY-MM-DD.log`
- DevTools:F12 看 renderer console / Network
- 设置:`%APPDATA%\Marina\settings.json`(看新增的 ai / appearance.language 等字段)

---

## 1. 状态指示器(批次 1 核心)

### 测试 1.1 — 新建终端不再"闪绿"(BETA-008)

1. 新建一个终端(双击侧栏路径或 +)
2. **预期**:状态点立刻是**金色 idle**,不闪绿
3. 在终端里 `dir` 或 `Get-ChildItem`
4. **预期**:命令执行瞬间 → 绿色 active;完成回到 prompt → 金色 idle
5. **失败现象**:刚建瞬间出现绿色一闪;或命令执行时颜色不变

### 测试 1.2 — statusbar 状态点可见(BETA-005)

1. 看终端下方"terminal-statusbar"(显示 displayName · pid X · cwd 的那行)
2. **预期**:idle 时是**金色**点,active 时**绿色**点,exited 时**灰色**
3. 旧版只 active 时显示绿点,idle / exited 状态点透明不可见

### 测试 1.3 — 完成/失败 icon(BETA-007)

1. 跑 `exit 0` 关闭终端 → 状态点变灰
2. **预期**:灰点上叠**绿色 ✓** lucide icon
3. 新建终端再跑 `exit 1`
4. **预期**:灰点上叠**红色 ✗**
5. 还可在任务管理器强杀某个 PowerShell pid → 状态点仅灰底无 icon(unknown 强杀)
6. Sidebar SessionItem 状态点 + statusbar 状态点都应一致

---

## 2. PATH 注册表重读(BETA-001)

> 这个最难手工测,需要安装新软件。可选,如开发期不便测可挂起。

1. 新建终端,跑 `where some-pkg-not-installed`(应失败)
2. **不关闭 Marina**,在新的 PowerShell 里 `winget install something-with-cli` 或手动 `setx PATH "%PATH%;C:\new-path"`
3. 回到 Marina,**再新建一个终端**(不重启 Marina)
4. **预期**:新终端 `where new-pkg` 能找到
5. **失败现象**:新终端找不到刚装的 CLI,必须重启 Marina

---

## 3. Sidebar(批次 1 + 批次 2)

### 测试 3.1 — 第 4 栏"系统"(BETA-011)

1. 看 Sidebar 顶部应有 4 栏:**收藏 / 临时 / 最近 / 系统**
2. "系统"栏含 3 项:**桌面** / **主目录** / **临时**
3. 双击"桌面"应新建一个终端,cwd 是 `%USERPROFILE%\Desktop`
4. 设置 → 外观 → "显示系统路径分组"取消 → Sidebar 第 4 栏消失
5. 重新勾选 → "系统路径条目"逐项切换"桌面"off → Sidebar 第 4 栏只剩 2 项

### 测试 3.2 — 三角形换 lucide(BETA-013)

1. 折叠/展开收藏栏里的某个路径
2. **预期**:折叠时**右指箭头**,展开时**下指箭头**(lucide ChevronRight / Down)
3. 旧版是文字 `▶`,9px 太小看不清

### 测试 3.3 — 同名末级智能去重(BETA-014)

1. 收藏两个路径,末级都叫 `src`(如 `E:\proj1\src` 和 `E:\proj2\src`)
2. **预期**:Sidebar 显示成 `proj1/src` 和 `proj2/src`,而非两个 `src`
3. 手动给其中一个重命名,**预期**:被命名的优先用用户名,另一个仍单独显示

### 测试 3.4 — 点空白处取消选中(BETA-017)

1. 单击 Sidebar 里某个路径,它高亮选中
2. 把鼠标移到 Sidebar 的**空白区域**(分类之间或底部),单击
3. **预期**:选中清空,该路径不再高亮
4. **失败现象**:点空白没反应,或点 Category title 被错误清空

### 测试 3.5 — 分组标题字号 / 顶部对齐(BETA-012 + BETA-016)

1. 看"收藏"、"临时"、"最近"、"系统"四个分组标题
2. **预期**:字号比之前**稍大且更清晰**(12px / `--text` 颜色);Sidebar 顶部与右侧 Tab bar 起点在**同一水平线**(都是 32px)
3. **失败现象**:分组标题灰得像水印 / Sidebar 顶部比 Tab bar 高出一截

### 测试 3.6 — 不可访问路径标 ⚠️(BETA-043)

1. 收藏一个真实存在的路径(如 `E:\test`)
2. 在 Windows 资源管理器里**重命名或删除**那个文件夹
3. 重启 Marina
4. **预期**:该路径在 Sidebar 半透明 + **黄色 ⚠️** AlertTriangle icon;鼠标悬停 tooltip 显示"⚠️ 路径不可访问"
5. 该路径不自动删除,留给你右键决定

### 测试 3.7 — 新窗口右键打开自动展开(BETA-042)

1. 在 Windows 资源管理器里右键某文件夹 → "在 Marina 终端中打开"
2. **预期**:新窗口出现,该路径在 Sidebar **自动展开** + 其下的 session **被选中**
3. **失败现象**:Sidebar 该路径未展开,需要手动点 ▶ 才看到 session

---

## 4. 主题(批次 2)

### 测试 4.1 — 主题选择 UI 改纯文本列表(BETA-032)

1. 设置 → 外观 → 主题
2. **预期**:不再是色卡格子,而是**纯文本列表**,每行"主题名 + 深色/浅色 tag"
3. 列表共 **11 项**(BETA-033 新增 4 个)

### 测试 4.2 — 4 个新主题(BETA-033)

1. 依次切换到:**One Dark Pro / Dracula / Tokyo Night / Catppuccin Mocha**
2. **预期**:每个主题切换后,UI 颜色 + xterm 颜色立即同步更新,无重启
3. 在每个主题下跑 `ls --color=auto`(或 `Get-ChildItem` 自带色),看 ANSI 16 色是否合理

### 测试 4.3 — Cutie 重设计(BETA-034,第一版)

1. 切到 **Cutie** 主题
2. **预期**:不再是单调粉色,而是**奶油薄荷 + 马卡龙糖果色**(背景偏浅薄荷绿,UI 边框靛蓝,主调红粉/苔绿/暗芥末/紫罗兰)
3. 在 Cutie 下跑命令,验证 16 色对比度足够(BETA-035 标准 ≥4.5:1)
4. **如果觉得配色不好**:提 2-3 套替换方案,改 `global.css [data-theme='cutie']` + `TerminalView XTERM_THEMES.cutie` 即可

### 测试 4.4 — Rose Pine Dawn 浅底白字消除(BETA-035)

1. 切到 **Rose Pine Dawn** 浅色主题
2. 在终端跑 Claude Code(`claude` 命令)或随便一个会用 dimmed 字体的 TUI 工具
3. **预期**:dimmed / brightBlack 文字现在是**深紫色清晰可读**,不再出现"浅底白字"
4. brightYellow / brightCyan 也应足够暗

### 测试 4.5 — 浅色主题右键菜单 / Modal 边框(BETA-037)

1. 在 Rose Pine Dawn / Cutie 下,在终端里右键
2. **预期**:右键菜单**边框清晰**(--muted 灰紫色),不再融进背景
3. 触发任何 Modal(如多行粘贴 confirm)
4. **预期**:backdrop 是**浅黑 22% 透明**,不像之前 45% 那么"墨水块"

---

## 5. Tab / 标题栏(批次 1)

### 测试 5.1 — Tab 顶部圆角(BETA-020)

1. 看 Tab bar 上的标签
2. **预期**:每个 Tab **上方两角圆角**(border-radius: 4px 4px 0 0),浏览器风格

### 测试 5.2 — Tab 右侧 padding(BETA-025)

1. 创建一个 session 让它名字是斜体(如对 path 启用某些 OSC 1337 触发的斜体标题)
2. **预期**:斜体字右上角**不被切**
3. 实际操作较难,看 Tab 整体右侧留白比左侧多一点即对

### 测试 5.3 — Window badge 去矩形(BETA-021)

1. Windows 风格标题栏左侧应显示 `Marina` 文字 + `Window 1` badge
2. **预期**:`Window 1` 是**纯文字金色**,不再是胶囊矩形

### 测试 5.4 — 标题栏底部 border 删(BETA-022)

1. 看 titlebar 与下方 Sidebar / Tab bar 之间
2. **预期**:**无水平分割线**;之前是 1px overlay 色
3. **失败现象**:仍有一条灰线

### 测试 5.5 — macOS 风格染色(BETA-024)

1. 设置 → 外观 → 窗口风格 → macOS
2. 在浅色主题(Rose Pine Dawn / Cutie)下看 titlebar 中央的 `Marina — Window 1`
3. **预期**:字色**清晰可读**(--text)
4. **失败现象**:字色淡到几乎看不见(旧版用 --subtle 浅底不可见)

### 测试 5.6 — macOS 红绿灯悬浮符号(BETA-023)

1. macOS 风格下,鼠标悬停红绿灯按钮
2. **预期(默认)**:不显示符号(保持极简)
3. 设置 → 外观 → "红绿灯悬浮符号" 开启
4. **预期**:hover 时按钮内显示 **× / − / +**(macOS 一致)
5. 关闭设置,hover 又回到无符号

---

## 6. 终端 / 会话行为(批次 1)

### 测试 6.1 — 切换终端不再"从上往下刷屏"(BETA-018)

1. 开两个 session,各跑些命令产生 scrollback
2. 在 Tab bar 上切换两者
3. **预期**:切换时立即看到**最底部**内容,无"从上往下刷新"动画
4. **失败现象**:scrollback 可见从顶部开始一行一行往下追加

### 测试 6.2 — 多行粘贴判定(BETA-041)

1. 在浏览器复制单行命令(末尾可能带换行符,如从 GitHub README 拷一个 `npm install foo`)
2. 在终端粘贴
3. **预期**:**不弹**多行粘贴 confirm 弹窗
4. 复制两行带换行的真多行,粘贴
5. **预期**:正确弹 confirm 显示"2 行"

---

## 7. 终端工具栏 + 简易页面(批次 2)

### 测试 7.1 — 工具栏出现位置(BETA-028)

1. 看 Tab bar 最右端
2. **预期**:4 个 lucide icon 按钮 — **ClipboardCopy / Eraser / Search / Minimize2**
3. 鼠标悬停每个按钮看 tooltip(BETA-004 已 i18n,中文系统显示"复制全部 scrollback"等;切英文显示英文)

### 测试 7.2 — 复制全部 scrollback

1. 跑几个命令,scrollback 有几屏内容
2. 点工具栏 **ClipboardCopy** 按钮
3. **预期**:toast 提示"已复制 N 行 scrollback";打开记事本 Ctrl+V 应看到完整内容
4. 空 scrollback 时点 → toast"当前 scrollback 为空"

### 测试 7.3 — 清屏

1. 跑命令产生 scrollback
2. 点工具栏 **Eraser**
3. **预期**:终端立即清空;再次切回该 tab 也不会回灌历史(main 端 ring buffer 也清了)
4. **失败现象**:点了 Eraser 看似清了,但切换 tab 回来内容又出现

### 测试 7.4 — 搜索(BETA-028)

1. 点工具栏 **Search** 或按 Ctrl+F
2. **预期**:终端右上角弹出搜索栏,可输入关键词,匹配高亮
3. 工具栏按钮和 Ctrl+F 行为应**完全一致**

### 测试 7.5 — 简易页面切换(BETA-027)

1. 点工具栏 **Minimize2**(切换简易模式)
2. **预期**:Sidebar **消失**,Tab bar **消失**,只剩 titlebar + 终端区
3. 工具栏移到**右上角浮动**(白色背景小卡片)
4. 浮动工具栏第 4 个按钮变 **Maximize2**(退出简易)
5. 点 Maximize2 → 回到完整页面
6. **预期**:无 session 时简易模式仅显示 EmptyPathState,工具栏仍可点切换按钮回去

### 测试 7.6 — 命令行启动简易模式

1. 退出 Marina
2. 跑 `Marina.exe --mode=simple`(或 dev 模式 `npm run dev -- --mode=simple` 不一定可用)
3. **预期**:Marina 启动时**直接进简易页面**,无需手动切换

---

## 8. 设置页

### 测试 8.1 — 数据目录显示真实路径(BETA-039)

1. 设置 → 数据
2. **预期**:"数据目录"显示**真实绝对路径**(如 `C:\Users\liyue\AppData\Roaming\Marina`),不再是字面 `%APPDATA%\Marina`

### 测试 8.2 — 调试按钮已删(BETA-038)

1. 设置 → 系统集成 → 任意 Explorer Integration 卡片
2. **预期**:**没有**"复制安装命令"/"复制卸载命令" 两个调试按钮
3. 卡片功能(启用/禁用开关 + 证书 / 包信息显示)正常

### 测试 8.3 — Win11 重启 toast(BETA-044)

1. 设置 → 系统集成 → Win11 新菜单 → 启用或禁用
2. **预期**:操作成功后弹 info toast:"右键菜单已更新,确保设置生效请重启计算机"
3. **失败现象**:操作完成无任何反馈

### 测试 8.4 — 语言切换(BETA-004)

1. 设置 → 外观 → 语言 / Language
2. 切到 **English**
3. **预期**:UI 立即切换:Sidebar 四栏标题(Bookmarks / Temporary / Recent / System)、Settings 八个分类(Appearance / Shell & Startup / ...)、TerminalToolbar tooltip
4. 切回**中文**或**跟随系统**
5. **失败现象**:某些 UI 仍是中文,这部分文案还未迁移 t() — 已在工作报告"留尾"一节标记

---

## 9. AI 助手(批次 3)

> 仅 Anthropic 有 API key 的用户可完整测;无 key 至少验证 UI 出现 + 错误提示。

### 测试 9.1 — AI 助手设置页(BETA-031)

1. 设置 → AI 助手(Brain icon,在系统集成下方)
2. **预期**:有"服务商"下拉(未启用 / Anthropic / OpenAI)
3. 选 Anthropic
4. **预期**:展开"API key"输入框(默认 password 遮罩)、"模型"输入框、"测试连接"按钮、"状态复核"开关(灰色 disabled,key 空时不可勾)

### 测试 9.2 — 测试连接

1. 填一个**错误**的 API key,点测试连接
2. **预期**:error toast 显示 Anthropic 返回的错误(如 401 authentication failed)
3. 填**正确** key 再测
4. **预期**:success toast "Anthropic claude-xxx 响应 OK"
5. **失败现象**:点了按钮无反应 / 主进程崩溃(检查 `main.log`)

### 测试 9.3 — 状态复核(BETA-006)

1. AI 助手设置页中填好 key,模型可留空(默认 claude-haiku),勾选"状态复核"
2. 新建终端跑 `vite --version` 类长命令(无 Vite 也可跑 `npx --yes some-tool` 模拟长输出)
3. 完成后看状态点是否短暂保持绿色比通常长(LLM 在判断)
4. 跑 `vite dev`(若安装)— 进入 watch 状态后输出停止
5. **预期**:状态点不会很快变 idle(LLM 复核判定 keep-active)
6. **失败现象**:LLM 调用失败时,行为仍**正常回退**到原阈值判定(不阻塞)— 看 main.log 应有 `BETA-006 LLM recheck failed, fallback` warn

### 测试 9.4 — 关闭 AI 复核 → 行为回滚

1. 取消"状态复核"勾选
2. 跑 vite dev,2 秒后状态点应**正常变 idle**(回到原阈值行为)

---

## 10. Logo(BETA-026)

1. 看 Marina **任务栏 / 托盘 / 标题栏** 的图标
2. **预期**:`>_` 提示符前景,**金色光标方块已删除**
3. (dev 模式可能仍是旧 icon,因为打包时才重新生成 .ico;最准确是看 `build/icon.svg` 渲染)

---

## 11. 后端兜底(BETA-002)

> 这条无可见 UI,主要看文档与日志兜底。

1. 看 `docs/known-issues.md` 末尾
2. **预期**:新增 **KI-004 — Windows ConPTY 主死则 PTY 必死**
3. 主进程崩溃测试:在 DevTools console 跑 `throw new Error('test')` 之类的(只触发 renderer,主进程不受影响),验证 UI 不挂
4. 主进程崩溃模拟较难,跳过

---

## 12. 工程检查(可选)

### 测试 12.1 — typecheck + test + lint

```pwsh
npm run typecheck   # 应零错误
npm test            # 应 320 / 320 通过
npm run lint        # 0 error,1 pre-existing warning (TerminalView L419)
```

### 测试 12.2 — package.json 版本号

打开 `package.json`,**预期** `"version": "0.1.0-beta.4"`。

### 测试 12.3 — git log 完整性

```pwsh
git log --oneline dev..fix/beta-feedback-20260515 | wc -l   # 应该是 20
```

20 个 commit,subject 都以 `feat()` / `fix()` / `chore()` 开头并嵌 BETA-NNN 工单号。

---

## 13. 通过 / 失败标记

走完后填这份表(把对应行 `[ ]` 改 `[x]`):

- [ ] 1. 状态指示器(BETA-005/007/008)
- [ ] 2. PATH 注册表重读(BETA-001,可跳)
- [ ] 3. Sidebar(BETA-011/012/013/014/016/017/042/043)
- [ ] 4. 主题(BETA-032/033/034/035/037)
- [ ] 5. Tab / 标题栏(BETA-020/021/022/024/025/023)
- [ ] 6. 终端 / 会话(BETA-018/041)
- [ ] 7. 终端工具栏 + 简易页面(BETA-027/028)
- [ ] 8. 设置页(BETA-038/039/044/004 切换)
- [ ] 9. AI 助手(BETA-031/006,如有 key)
- [ ] 10. Logo(BETA-026,看 SVG)
- [ ] 11. 后端兜底(BETA-002,看 KI-004 文档)
- [ ] 12. 工程检查(typecheck/test/lint/版本号/git log)

发现问题就在工单库对应工单加"勘误"或者直接说 `BETA-NNN xxx 不工作`,我进入下一轮 errata 修复。

---

**测试指南结束。**
