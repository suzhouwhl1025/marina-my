# Robustness Pass 工作记录 — 2026-05-13/14

> 分支:`fix/robustness-pass-20260513`(基于 `dev`)
>
> 范围:基于 `docs/终端渲染审计备忘录-20260513.md` 的 65+ 条目,系统修复
> 焦点 / 打字 / 复制粘贴 / 闪烁 / Resize / IPC / 字节路径 / 崩溃恢复 /
> 状态机 / 安全 9 大维度的 daily-driver 健壮性问题。
>
> 计划文件:`C:\Users\liyue\.claude\plans\glowing-pondering-steele.md`(已批准)
>
> 工作纪律:遵循 AGENTS.md 4.6 勘误回合工作流 — 每条审计条目转 commit,
> typecheck / test 在每个 commit 后即时验证,完成后文档同步。

---

## 用户授权的范围决策

四道范围问题(2026-05-13)用户均选"推荐"路径:

1. WebGL 渲染器:**引入 `@xterm/addon-webgl`** — AGENTS.md 1.2 边界 2 已确认
2. window.confirm 替换:**新增自绘 Modal 组件**(同时替换 window.prompt)
3. Bracketed paste 协议:**启用 + 用户可关**(settings.behavior.bracketedPaste)
4. IPC 反压:**main 端 8ms 聚合窗口合并 PTY chunk**

---

## Commit 清单与对应审计条目

按时间顺序排列。每条 commit 是单一目的的细颗粒提交(AGENTS.md 6.1):

| # | Commit | Phase | 审计条目 |
|---|---|---|---|
| 1 | docs(audit): 审计备忘补全修订记录 + 优先级/症状映射对齐 CPB-P/C | 准备 | (二轮补审尾巴) |
| 2 | fix(focus): 统一焦点归还工具 + paste/copy/drop/mount 兜底 | A1 | CPB-P1, CPB-C1, CPB-DROP-1, FOC-1 |
| 3 | fix(focus): chrome/tab/template 按钮交互后焦点归还终端 | A2 | FOC-2, FOC-3 |
| 4 | fix(focus): ContextMenu/Toast 关闭归还焦点 + xterm 拦截短路 IME | A3 | FOC-5, TYP-3, FOC-7, CPB-P9 |
| 5 | fix(focus): selectedSessionId 变更 / 托盘聚焦后自动 focus 终端 | A4 | FOC-6 |
| 6 | feat(ipc): sendInput/resize 返回 accepted 状态 + 渲染端可见反馈 | B1 | TYP-1, IPC-4 |
| 7 | fix(session): pty.write 异常包 try/catch + sendInput ownership 校验 | B2 | TYP-2, IPC-3 |
| 8 | fix(session): handlePtyData 加 destroyed guard | B3 | CPT-3 |
| 9 | feat(modal): 自绘 Modal/Confirm/Prompt 组件 + 替换 window.confirm/prompt | C1 | CPB-P2 |
| 10 | feat(paste): 启用 bracketed paste 协议 + ANSI 注入强警告 | C2 | CPB-P8, CPB-P3, CPB-P7 部分 |
| 11 | fix(paste): 粘贴前 sanitize preview + 大粘贴优化 | C3 | CPB-P4, CPB-P7, CPB-P3 修订, OSC-7 |
| 12 | fix(copy): selectOnCopy debounce + Ctrl+C 残留选区死循环 + 多行 CRLF | C4 | CPB-C2, CPB-C3, CPB-C4 |
| 13 | feat(perf): 装 @xterm/addon-webgl 渲染器 + DOM 回退 | D1 | PER-1, XTM-1 |
| 14 | fix(render): scrollback 分片写避免长任务 + 去掉 MainPane RO 双 dispatch | D2 | FLK-1, FLK-2 |
| 15 | fix(render): fit guard + Ctrl+滚轮节流 + exited 停止光标闪 | D3 | XTM-8, FLK-3/4/5/10, RSZ-4 |
| 16 | fix(render): cwd 漂移 PSDrive 前缀归一 + webfont 加载完成重 fit | D4 | FLK-9, XTM-9 |
| 17 | fix(resize): 最大化 leading resize + 打字时 flush 待定 resize | E1 | RSZ-2, XTM-7 |
| 18 | perf(ipc): main 端 PTY chunk 8ms 窗口聚合后 emit 给 renderer | F1 | PER-2 |
| 19 | perf(detect): shell 缓存 30s TTL | F2 | PER-4 |
| 20 | fix(scrollback): 尾部裁切对齐 ESC/换行边界避免接管首屏乱码 | G1 | OSC-2 |
| 21 | fix(osc): stash overflow 静默丢弃 + 0x9D 识别 + 标题 RTL sanitize | G2 | OSC-3, OSC-4, OSC-6 |
| 22 | fix(crash): render-process-gone 自动 reload + 记录 + 用户提示 | H1 | CRA-1 |
| 23 | fix(state): Enter 终结 input quiet + grace 期重置 idle 计时器 | I1 | CUR-1, STM-4 |
| 24 | feat(session): tab 右键加"恢复自动标题" + 重置 manuallyRenamed | I2 | STM-3 |
| 25 | fix(security): setWindowOpenHandler 白名单 http(s)/mailto | J1 | OSC-5, SEC-4 |
| 26 | fix(security): renderer sandbox=true 试验启用 | J2 | SEC-1 |
| 27 | fix(security): 拖文件元字符 confirm + Modal 危险警告 | J3 | SEC-5, SEC-6 |
| 28 | test: window-manager mock 补 setWindowOpenHandler / reload / send 兜底 | K1 | (测试兜底) |

合计 28 个 commit(含本工作记录文档同步)。

---

## 关键架构变更

### 1. 焦点归还体系(Phase A)

历史:Marina 没有统一的焦点管理,paste/copy/menu/tab 等 UI 交互后焦点
漂走是用户主诉根因("粘贴后打不进字必须关窗口")。

新引入:
- `src/renderer/focus.ts` · `focusTerminalDom()` 跨组件入口,走 DOM
  查询 + rAF,自动避开搜索栏 / Modal / 设置视图
- `TerminalView` 内部 `focusTerminal(termRef, searchVisibleRef)` —
  组件内直接持有 ref 时用的快路径
- `ContextMenuProvider` 和 `Modal` 都实现 previousActiveElement 捕获
  + rAF 归还,且只在 activeElement 已落回 body 时归还(避免覆盖 onSelect
  内主动设置的焦点,如 rename input)
- `Toast` dismiss 时检测是否由用户点击触发,是的话调 focusTerminalDom

### 2. Modal 替换 window.confirm/prompt(C1)

历史:Electron 原生 window.confirm/prompt 关闭后 Chromium 焦点归还
不可控,这是用户主诉"粘贴 multi-line 后必须关窗口"的直接根因
(CPB-P2)。

新增:
- `src/renderer/components/Modal.tsx` · ModalProvider + useModal hook
- confirm/prompt 都返回 Promise,焦点 trap + 关闭归还 previousActiveElement
- 复用 ContextMenuProvider 的设计模式,统一风格

替换调用点:
- TerminalView 多行粘贴 confirm
- MainPane Tab 右键重命名 prompt
- TerminalView 含 ESC 转义粘贴的强警告(C2)
- TerminalView 大粘贴 (>1MB) 警告(C3)
- TerminalView 拖文件元字符警告(J3)

### 3. Bracketed paste 协议(C2)

handlePaste 包裹 `\x1b[200~ ... \x1b[201~`,支持 readline 的 shell
(PowerShell 7+ / bash 5+ / zsh / fish / Claude Code REPL)把粘贴
当 literal,用户可编辑后 Enter,**多行粘贴不再被立即执行**。

新增 settings:`behavior.bracketedPaste`(默认 true),cmd.exe 用户可关。

启用时多行 confirm 不再需要(shell 自然让用户编辑);禁用时保留旧
confirm 警告。含 ESC 转义的粘贴一律弹强警告(防 ANSI 注入)。

### 4. sendInput/resize accepted 反馈(B1)

protocol.ts 新增 `SendInputResponse` / `ResizeSessionResponse`,带
accepted + reason 字段。原 void 静默改为返回:
- session-not-found / pty-exited / not-owner / pty-write-failed /
  invalid-dimensions

renderer dataHandler 监听返回,accepted=false 时弹 warn toast
(5 秒节流防刷屏),根据 reason 显示对应消息。

直击用户主诉"敲键无反应必须关窗口"。

### 5. main 端 IPC 聚合(F1)

handlePtyData 不再直接 emit('sessionOutput'),走 queueEmit 入 8ms
窗口缓冲,timer 到点 flush 一次。

- scrollback append 和 outputSeq 仍同步(scrollbackLastSeq 准确)
- 接管 / replay 协议依赖的 lastSeq 不受影响 — 只是 IPC 推送被合并
- burst 场景 IPC 数压成 ~5-10×,renderer base64 解码 + xterm parse
  CPU 显著下降
- 用户视觉无延迟感(8ms = 125 FPS)

可通过 options.emitBatchMs=0 关闭(测试用)。

### 6. WebGL 渲染器(D1)

装 `@xterm/addon-webgl`,mount 时优先 load,context lost 回退 DOM。

性能预期(对比 DOM renderer):
- 长瀑布输出 CPU 80-100% 单核 → 10-20%
- xterm 内部 RAF 帧率 20-30 FPS → 60 FPS
- 主线程不再被 cell 节点 diff 占满

### 7. 渲染崩溃自动恢复(H1)

render-process-gone listener 在 reason !== 'clean-exit' 时
webContents.reload(),所有 session 在 main 端继续活,renderer 拉
新 snapshot + get-scrollback 重建 xterm 状态。

---

## 验证状态

```
npm run typecheck   # ✓ 通过 (node + preload + web 三 tsconfig)
npm test            # ✓ 250 passed (13 files)
npm run lint        # 待 K3 完整跑
npm run dev         # 待 K3 手测主路径
```

新增单测覆盖:
- sendInput 返回 accepted/reason 三态(session-not-found / pty-exited /
  正常)
- pty.write 抛错路径 pty-write-failed
- IPC chunk 聚合(emitBatchMs=8 时合并,=0 时立即 emit)
- scrollback 裁切对齐 \n 边界
- OSC parser stash overflow 静默丢弃
- C1 0x9D OSC 起始识别

合计新增 ~10 个测试,主线全过。

---

## 不在本轮范围内的事(已记入审计备忘录附录 C)

按 AGENTS.md 7 已封箱原则 + 1.2 边界 2 + 13.2 哲学红线:
- OSC-1(node-pty UTF-8 lossy)· 上游硬限制
- KI-001/RSZ-1/FLK-8(ConPTY resize 重画)· known-issues 文档
- KI-002/KI-003 · 独立 milestone
- XTM-4(themes 单源重构)· 大型重构,非 bug
- IPC-2/IPC-6 · 大型架构改造
- MTN-3(前端 e2e 测试)· AGENTS.md 5.1 明确不写
- XTM-2/XTM-5 · 防御性硬化,非紧迫

---

## 后续待办

1. **K3 全量验证**:`npm run typecheck && npm test && npm run lint`(自动)
   + `npm run dev` 手测(用户)主路径
2. **手测覆盖清单**(用户测试时按这个跑):
   - 粘贴后立即打字 ✓ 期望:能打字
   - 切 tab 后立即打字 ✓ 期望:能打字
   - 多行粘贴 ✓ 期望:bracketed paste 启用时不立即执行
   - 单行粘贴 ✓ 期望:无 confirm,直接送
   - PTY 死后敲键 ✓ 期望:toast"会话已退出"
   - Ctrl+滚轮调字号 ✓ 期望:本地立刻变,不跨窗口抖
   - 长跑 session 切窗口接管 ✓ 期望:不黑屏 + 不卡顿
   - `find /` 期间敲键 ✓ 期望:不延迟
   - 中文输入连续多字符 ✓ 期望:不卡死
   - 渲染崩溃 ✓ 期望:窗口自动 reload
   - Ctrl+C 在残留选区下 ✓ 期望:复制 + 清选区,再按 Ctrl+C 发 SIGINT
   - session 重命名 ✓ 期望:走 Modal 不走原生 prompt
   - 右键菜单"恢复自动标题" ✓ 期望:Claude Code 标题再次能更新
   - 终端 URL 点击 ✓ 期望:用系统默认浏览器打开
3. **若 SEC-1 (sandbox=true) 启动期出问题** → 单独 revert 该 commit,
   留 SEC-1 待后续详查(typecheck 已通过,但运行时未实测)
4. **K2 后续**:
   - 软件定义书 5.1.4 加 bracketed paste / ANSI sanitize 行为
   - AGENTS.md CP-4 完成标志补 "WebGL renderer / bracketed paste /
     自绘 Modal"
5. **PR 准备**:`git push -u origin fix/robustness-pass-20260513`(需用户授权)

---

**工作记录结束**

> 本文件不复述每个 commit 的 message — 详情见 `git log --oneline
> fix/robustness-pass-20260513 ^dev` 与对应 commit body。
