# CURSOR-1 · BETA-019 workaround(alt-buffer 关 cursorBlink)失败 + 破坏 Codex

**状态**:**workaround 已落地但失败,亟待回滚或重新设计**
**优先级**:P1(同时影响 Claude Code 与 Codex 两个主流 AI CLI 体验)
**首次报告**:2026-05-17
**关联工单**:`docs/beta反馈工单库-20260515.md` BETA-019(根因未定位)
**当前 workaround 出处**:`src/renderer/components/TerminalView.tsx` mount effect `term.buffer.onBufferChange` listener + FLK-10 effect not-exited 分支读 `buffer.active.type`

---

## 现象

2026-05-16 落地 BETA-019 workaround:**alt-screen buffer 内关闭 `cursorBlink`,normal buffer 内开启**。意图是让 TUI 应用(Claude Code 等)期间避免 xterm 自带光标在 TUI 自绘内容中间闪烁。

实际效果:

1. **BETA-019 原问题(Claude Code 闪烁光标)仍经常出现**。workaround 没解决 — 用户反馈"这个问题还是经常出现"。
2. **引入新问题:Codex CLI 在 alt buffer 内看不到光标闪烁**。Codex 与 Claude Code 不同:
   - Claude Code:在 alt buffer 内**自绘输入区光标**(它自己用反色 cell 或 unicode 标记画一个光标位置)
   - Codex:在 alt buffer 内**依赖终端的系统光标**(由 xterm 按 `cursorBlink: true` 闪烁来指示输入位置)
   workaround 关闭 cursorBlink 后,Codex 用户看不到光标在哪里 / 是否在输入态。

净结果:**两个最常用的 AI CLI 都出 bug,而且根因还没找到**。

## 失败的根本原因

启发式 "alt-buffer 内 = TUI 应用 = 一律不需要终端光标 blink" 是错的。TUI 应用按光标策略分两类:

| 类型 | 代表 | alt-buffer 内 cursorBlink 需求 |
|---|---|---|
| 自绘光标 TUI | Claude Code / vim(normal mode) / htop / less | **不需要**终端 blink — 自己画 |
| 依赖系统光标 TUI | Codex / nano / vim(insert mode) / 某些 REPL | **需要**终端 blink — 让用户看到输入位置 |

`buffer.type === 'alternate'` 这一个信号**不足以**区分这两类。Marina 没有可靠的运行时方法判定当前 alt-buffer 是哪一类(没有标准 escape sequence、没有 PTY-level 元数据)。

业界标杆参考误用:之前文档里写 "Windows Terminal / iTerm2 / kitty 同此策略" — 重新核对后**这个说法是错的**。这些终端默认 `cursorBlink: false`(光标静态显示),Marina 默认 `cursorBlink: true`(模仿 Windows ConHost 行为),策略不同所以行为不同。Marina 借鉴"alt-buffer 关 blink"实际是在给自己造新问题。

## 已尝试

| 时间 | 改动 | 结果 |
|---|---|---|
| 2026-05-16 BETA-019 调研第一轮 | 静态分析排除 (a) WebGL atlas / (b) Claude Code 行为 / (c) IME / (d) cursorBlink timer 累积 | 假设全否,无修复 |
| 2026-05-16 BETA-019 调研第二轮 | 运行时 HUD 注入(`Object.defineProperty` 拦截 `coreService.isCursorHidden`)| 排除 (e) DECSTR/RIS 翻转 isCursorHidden 候选;bug 时段 `flips:0` |
| 2026-05-16 实施 workaround | alt-buffer 关 cursorBlink(本报告对象)| **失败**:Claude Code 仍闪 + Codex 看不到光标 |

## 修法选项

### A. 回滚 workaround,回到 BETA-019 原状态(接受未解决)

- 撤掉 `TerminalView.tsx` 的 `onBufferChange` listener + FLK-10 effect 的 `buffer.active.type` 读取
- BETA-019 原 bug(Claude Code 闪光标)回来,但 Codex 恢复正常
- 优点:把"破坏一个修不了的+破坏另一个"换回"只破坏一个"
- 缺点:Claude Code 用户体验仍差

### B. 更精细策略:alt-buffer 内**保持 cursorBlink=true**,但只在 `isCursorHidden=false` **且** 当前 cursor 位置不与字符 cell 内容碰撞时显示

- 需要 hook xterm 渲染管线(WebglRenderer 或 RectangleRenderer)
- 复杂、侵入,且 cell 碰撞检测的语义模糊(Claude Code 的 spinner cell 跟"应该显示光标"的位置如何区分?)
- 不推荐

### C. 找 root cause(BETA-019 未结案的下次接手方向)

工单 BETA-019 里列了"剩余怀疑":**scrollback replay 后 cursor 状态被卡死**。验证方法:

- 在 `TerminalView.tsx:953` 的 `replayed = true` 之前 console.log 输出 `coreService.isCursorHidden` 最终值
- 或:replay 结束后强制 `term.write('\x1b[?25l')` 给 alt buffer

如果这条假设证实,真正的修复就是在 replay 结尾正确恢复 cursor 隐藏状态,**不需要全局关 cursorBlink**,Codex 也不受影响。

### D. 区分 Claude Code 与 Codex(不推荐)

理论上可以读 PTY 启动的进程名,如果是 `claude-code` 关 blink,如果是 `codex` 开。但:

- 需要 main 端 IPC 反向同步进程信息到 renderer
- 进程链可能复杂(`pwsh → claude-code` 或 `bash → npx claude-code`)
- 用户随时可能在同一 session 内切换跑不同 AI CLI
- 不可维护

## 推荐决策

**短期 → A(回滚)**:Codex 是日常使用工具,不能为了一个未根治的 workaround 把它弄坏。回滚后回到 BETA-019 单一缺陷状态,Codex 立即恢复。

**中期 → C(追根因)**:按 BETA-019 工单"剩余怀疑"章节列的验证方法,优先验证 scrollback replay 假设。这条若证实,修法对所有 TUI 一致正确,不需要区分应用类型。

## 关联约束

- **永远不要再凭"alt-buffer 内 = TUI = 不要终端光标"启发式做决策**。证据已证伪。
- 工单 BETA-019 维持"未结案"状态。

## 下次接手 checklist

1. 先回滚 workaround(本报告 A 方案):
   - `TerminalView.tsx` 删除 `onBufferChange` listener 块及其 cleanup `bufferChangeDisposable.dispose()`
   - FLK-10 effect 恢复原版:not-exited → 直接 `cursorBlink = true; cursorStyle = 'bar'`
2. 在 BETA-019 工单 / 本报告里追加回滚事实
3. 启动追根因(C 方案):scrollback replay 完成时刻 console.log + 强制 `?25l` 试探
4. 若 C 方案证实,实施定向修复并关闭本报告 + BETA-019 工单

---

## 2026-05-17 续:架构级根治方案(取代上方所有"修法选项"与 checklist)

**前述 A-D 四个选项与 checklist 全部作废**。下面的方案是治根级别的,实施后 BETA-019 / CURSOR-1 / 切 tab "从上往下刷屏"(BETA-018 未尽事项)三条线一并消除,所有相关 workaround 全删。

### 真正的根因

**前述 BETA-019 工单"剩余怀疑"猜的是 scrollback replay 后 cursor 状态被卡死,方向不对。真因更基础**:

主进程 `session-manager.ts` 用一个裸字节 `Buffer`(`managed.scrollback`,2MB 上限,session-manager.ts:73 `SCROLLBACK_LIMIT`)存 PTY 输出,**作为"重挂时恢复显示"的唯一数据源**。一旦 scrollback 长度超 2MB,从头部 `\n` 边界裁切(`findSafeTruncationBoundary`,session-manager.ts:1685)。

关键性质:裁切**完全不识别 DEC 私有模式 setter**。Claude Code / Codex / vim 这类应用启动时发的 `\x1b[?1049h`(进 alt-buffer)只发一次,之后无限 alt-screen 重绘。跑久后 scrollback 涨过 2MB,**开头的 `?1049h` 被裁掉**。后续:

- 切 tab → TerminalView 重挂(`MainPane.tsx:173` `key={displayable.id}`)→ 新 xterm 默认在 normal buffer + `cursorBlink: true`
- `getScrollback` 返回的字节流**已经没有 `?1049h`**
- 重放过程中 xterm 收到大量 alt-screen 绘画指令(CUP / SGR / 字符),全画到 **normal buffer**
- `term.buffer.active.type` 始终是 `'normal'`,`onBufferChange` listener **永不触发**
- BETA-019 workaround 读 `buffer.active.type === 'normal'` → 判断"应该开 blink",自我确认了 bug
- 用户看到:alt-screen-绘到-normal-buffer + 闪烁系统光标 = BETA-019 / CURSOR-1

同一根因也解释:
- 第二轮排查 patch `coreService.isCursorHidden` setter 看不到异常翻转 —— 根因在 `buffer.active.type` 错位、不在 `isCursorHidden`
- 故障的时机性(scrollback 渐增) + session 相关性(只发生在 alt-buffer-heavy session) + "切回来时从顶部刷下来"(FLK-1 分片更可见)三个表象的共同来源

### 方案核心思路

**字节流不应是恢复源,状态机才是**。

`managed.headlessTerm`(`@xterm/headless` 实例,session-manager.ts:629)**已经存在**、**已经被同一份字节流喂饱**(line 1060)、**已经维护着完整终端状态机**(buffer + modes + cursor + SGR + scroll region),但当前只用于 BETA-006 v2 idle 复核。

xterm 官方 `@xterm/addon-serialize` 设计目的就是把这个状态机吐成可重建的 ANSI 流。源码(`addons/addon-serialize/src/SerializeAddon.ts`)覆盖:

| 状态维度 | SerializeAddon 输出 |
|---|---|
| Normal buffer cells + SGR diff + 软/硬换行 | 按 cell 走最小化 SGR 序列 |
| **Alt buffer 状态** | active 时前缀 `\x1b[?1049h\x1b[H` + alt 内容 |
| **`?25l` 光标可见性** | `modes.showCursor === false` → 注入 |
| `?1h` 应用键盘 / `?66h` 数字键盘 / `?2004h` 括号粘贴 | 命中即注入 |
| `?6h` 原点 / `?45h` 反向折行 / `?1004h` focus 事件 / `?7l` 关折行 | 命中即注入 |
| 鼠标 tracking 4 档(`?9` / `?1000` / `?1002` / `?1003`) | 各自正确字节 |
| **DECSTBM 滚动区** | `\x1b[<top>;<bot>r` |
| 当前 SGR 属性 | 末尾 diff,让光标继承样式正确 |
| 光标位置 | 末尾相对移动到 `(cursorX, cursorY)` |
| Insert mode `4h` | 命中即注入 |

源码里 `For xterm headless: fallback to ansi colors` 那段证明官方明确支持 headless。内部访问 `_core._inputHandler._curAttrData` / `_core.buffer.scrollTop/scrollBottom` 在 `@xterm/headless@5.5.0` 和 `@xterm/xterm@5.5.0` 共用同一 core,兼容。

### 实施步骤

**步骤 1:加依赖**

```
npm install @xterm/addon-serialize@~0.13.0  # 对齐 xterm 5.5.x
```

**步骤 2:main 端切换 `getScrollback` 数据源**(`src/main/session-manager.ts`)

```ts
import { SerializeAddon } from '@xterm/addon-serialize';

// createSession 内,headless 创建后立即:
const serializeAddon = new SerializeAddon();
managed.headlessTerm.loadAddon(serializeAddon);
managed.serializeAddon = serializeAddon;

// headless 配置同步到 renderer 一致(当前 1000 行,改 5000 与 xterm 默认对齐)
new HeadlessTerminal({ cols, rows, scrollback: 5000, allowProposedApi: true });

// getScrollback 改写:
getScrollback(sessionId: string): { data: string; lastSeq: number } {
  const managed = this.sessions.get(sessionId);
  if (!managed || !managed.serializeAddon) return { data: '', lastSeq: -1 };
  const ansi = managed.serializeAddon.serialize({ scrollback: 5000 });
  return {
    data: Buffer.from(ansi, 'utf8').toString('base64'),
    lastSeq: managed.scrollbackLastSeq,
  };
}
```

**这一步先单独 commit,不删任何东西**。验证 e2e:Claude Code / Codex / vim / less / htop / nano / `clear` 循环等 alt-buffer 场景跑久后切 tab,cursor 状态应当与切走时完全一致。CURSOR-1 应当立即消失。

**步骤 3:删除 renderer 端所有 BETA-019 / CURSOR-1 workaround**(`src/renderer/components/TerminalView.tsx`)

- 删 `term.buffer.onBufferChange` listener 整块(line 881-896 + cleanup `bufferChangeDisposable.dispose()` line 1229)
- FLK-10 effect 还原(line 1264-1274):
  ```ts
  if (session.state === 'exited') {
    term.options.cursorBlink = false;
    term.options.cursorStyle = 'underline';
  } else {
    term.options.cursorStyle = 'bar';
    term.options.cursorBlink = true;
  }
  ```
- 删所有 "alt-buffer 关 cursorBlink" / "Windows Terminal / iTerm2 / kitty 同此策略" 相关注释
- "exited 标识位"借用 `cursorStyle === 'underline'` 判 exited 的绕路逻辑撤掉(原本是给 onBufferChange listener 用的),用独立 ref 或不判都行

**步骤 4:删除裸字节 scrollback 存储**(`src/main/session-manager.ts`)

- `ManagedSession.scrollback: Buffer` 字段删
- `scrollbackLastSeq` 保留(seq dedup 仍需要)
- `appendScrollback` 整段删(line 1147-1172)
- `findSafeTruncationBoundary` 整段删(line 1685-1698)+ 测试 `session-manager.test.ts:1064` 那条 OSC-2 case 删
- `SCROLLBACK_LIMIT` 常量删
- `handlePtyData` / `queueEmit` / `flushPendingEmit` 内所有 `appendScrollback` / `managed.scrollback = ...` 路径全删,**只保留 `headlessTerm.write` 和 `emit sessionOutput`**
- `exportScrollback`(BETA-028 "复制全部")重写为遍历 `headlessTerm.buffer.active` 按行拼纯文本(serializeAddon 的 HTML serialize 也可,但纯文本更小)
- `clearScrollback`(BETA-028)改为 `headlessTerm.reset()`(注意 reset 也会清模式,需要测,可能要换成 `term.clear()`)

**步骤 5:协议字段语义升级**(`src/shared/protocol.ts`)

`GetScrollbackResponse.data` 注释从 "raw PTY bytes (base64)" 改为 "serialized terminal state (ANSI escape stream, base64)"。**字段名 / 形状不变,IPC 无破坏**,纯文档升级。

**步骤 6:工单收尾**

- BETA-019 工单标记"已根治,根因为 scrollback 字节流截断丢 DEC 模式 setter,改为 SerializeAddon 状态机重建"
- 本报告(CURSOR-1)标记"已根治,workaround 在步骤 3 删除"
- "下次接手 checklist" 段标记作废,以本节为准

### PER-2 不变量的兼容性

PER-2(session-manager.ts:1041-1051)当前不变量:`scrollbackLastSeq == 已 emit 的最后 seq` ∧ `scrollback buffer 内容 == 已 emit 的字节累计`。删除裸 buffer 后,新不变量:

- `scrollbackLastSeq == 已 emit 的最后 seq` ✓(不变)
- `headlessTerm 状态 == 已 emit 的字节累计应有的状态` —— 由 `headlessTerm.write` 与 `emit` 同源调用保证(都在 `flushPendingEmit` 内,line 1060 与 1144 紧挨)

需要确认的一点:`headlessTerm.write` 是异步 parse 的(line 1056-1059 注释提过)。`getScrollback` 调到时,如果 pending 字节刚 `write` 但还没 parse 完,serialize 出来的状态会差几 ms。renderer 侧 seq dedup 仍正确(后续 emit 的 seq > lastSeq 就直接写),但**差的那几 ms 字节会被双写**(serialize 输出 + live emit)。

修复:`getScrollback` 内先 `await new Promise(r => managed.headlessTerm.write('', r))` 强制 drain parser 再 serialize,然后再读 `scrollbackLastSeq`。这样 serialize 内容和 lastSeq 在同一同步点切片,renderer 那边 `seq > lastReplayedSeq` 的判断仍准确,不会双写。

### 风险盘点(从最大到最小)

1. **SerializeAddon 用了内部 API `_core._inputHandler._curAttrData` / `_core.buffer.scrollTop/scrollBottom`**。xterm 升级时有破坏风险。缓解:锁版本到 5.5.x,升级时同步升 addon-serialize 并跑 e2e。
2. **headless `scrollback: 5000` 行的 JS heap**。内部用紧凑 Uint32 数组表示,每行约 KB 级,5000 行 × ~1KB ≈ 5MB/session。与当前 2MB Buffer 同量级,可接受;多窗口高 session 数环境下监测。
3. **DCS / Sixel / iTerm2 inline images**:SerializeAddon 不重生成。Marina 当前不支持图片协议,不影响;未来加 Sixel 时单独议。
4. **OSC 8 超链接**:IBufferCell 不暴露 link metadata。Marina 当前 WebLinksAddon 是 renderer 正则识别,不依赖 OSC 8,不影响。
5. **重度富彩输出的 serialize 字节体积**:极端情况几百 KB,但比 2MB 裸字节 + 半截 ANSI 小一个数量级,FLK-1 分片继续吃。配合上一轮讨论的"`visibility: hidden` 等 drain"可顺手解掉 BETA-018 未尽的"小段刷屏可见"。
6. **`headlessTerm.reset()` 行为**:RIS 会清所有模式 / 缓冲。如果 BETA-028 `clearScrollback` 需要保留模式,需用 `term.clear()`(仅清 viewport)或自己遍历清行。实施时验证。

### 这是治根的依据

| 维度 | 旧 workaround | 本方案 |
|---|---|---|
| 状态恢复机制 | 重放裸字节,依赖字节流完整性 | 重建状态机,依赖 headless 状态正确性 |
| 截断丢失 `?1049h` | 致命 | 不可能(serialize 直接读当前 buffer 类型) |
| 截断丢失 `?25l` / `?7l` 等模式 | 致命 | 不可能(`modes` 接口直读) |
| 启发式判断 alt 应不应闪 | 必需,易错 | 无需任何启发式,光标策略 = PTY 表达的状态 |
| Claude Code 自绘 vs Codex 系统光标 | 必须区分应用 | 不需要区分,应用要隐光标就 `?25l`,Marina 转发即可 |
| CURSOR-1 workaround | 失败 | 删除 |
| BETA-019 状态 | 未结案 | 根治 |
| BETA-018 "从顶部刷下来" | 滚到底兜底 | scrollback 体积大幅减小,且 SerializeAddon 输出多在 viewport 内,可配合 visibility 隐藏彻底无刷屏可见 |

实施时按步骤 2 → 3 → 4 顺序,每步独立 commit,任何一步 e2e 失败可单步回滚。
