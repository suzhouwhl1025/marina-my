# IME-1 · 中文 IME 偶发"按标点冲刷一大段历史输入"

**状态**:已定位 xterm.js 内部漏洞,workaround 方案已设计,未实施
**优先级**:P1(影响中文用户日常输入体感,但偶发性;切英文输入法即恢复)
**首次报告**:2026-05-16,用户日常使用 Marina 时偶发,凭对话框输入残影确认
**复现率**:偶发,不是每次都触发;仅在中文输入法开启时;切英文输入法立即消失

---

## 现象

中文输入法(已确认在 Windows 微软拼音上复现)开启时,按 `，` `。` `、`(或"一些其他按键")偶发触发:终端突然冲刷出一段重复的历史输入文字,看起来像"粘贴"了之前的内容,但又不一定走粘贴逻辑。

用户视角:"按动的时候会意外粘贴一段文字,当然也不一定是粘贴逻辑,反正就是会冲刷出一堆字"。复现样本(用户在对话框直接打字,IME 状态下连按标点):每按一个标点,前面的整段文字几乎完整重复一遍,后面再追加这一次按下的标点 → 内容指数级增长。

切到英文输入法 → 现象消失。

## 调研结论:根因在 `@xterm/xterm@5.5.0` 自带的 CompositionHelper

我们这一侧 (`src/renderer/components/TerminalView.tsx`) 干净:

- L755 `attachCustomKeyEventHandler` 内 `if (ev.isComposing || ev.keyCode === 229) return true` — IME composition 期间所有按键透传 xterm,我们的 Ctrl+F / Ctrl+Shift+V 拦截路径**不会**打断 IME 状态机。
- L1065 `term.onData(data)` → `encodeStringToBase64(data)` → IPC `session:send-input`。**无任何二次累加 / 缓存 / replay**。
- 整个组件**没有**手写的 `composition*` / `paste` / `input` 事件监听去碰 helper-textarea。

→ 我们没引入这个 bug,但也没 workaround 它。

漏洞链(`node_modules/@xterm/xterm/src/browser/`):

### 漏洞 1 — helper-textarea 几乎从不清空

`Terminal.ts:1063-1068`:

```ts
// If ctrl+c or enter is being sent, clear out the textarea.
if (result.key === C0.ETX || result.key === C0.CR) {
  this.textarea!.value = '';
}
```

**整个 xterm 只在按 Enter (CR) 或 Ctrl+C (ETX) 时清 textarea**。普通字符、IME 提交、退格、方向键、其他控制键路径下 `textarea.value` 都一直累加,直到用户按一次 Enter 才清掉。

中文 IME 用户长时间不按 Enter(在 Claude Code / aider 等 TUI 内的多行编辑场景)时,helper-textarea 可以累到几百几千字符。

### 漏洞 2 — `compositionend` 用 `substring(start)` 取从开头到 textarea 末尾

`CompositionHelper.ts:127-176`(简化):

```ts
private _finalizeComposition(waitForPropagation: boolean): void {
  this._isComposing = false;
  if (!waitForPropagation) {
    const input = this._textarea.value.substring(
      this._compositionPosition.start,
      this._compositionPosition.end
    );
    this._coreService.triggerDataEvent(input, true);
  } else {
    // ↓ 中文输入几乎全走这个分支
    const currentCompositionPosition = { ...this._compositionPosition };
    this._isSendingComposition = true;
    setTimeout(() => {
      if (this._isSendingComposition) {
        this._isSendingComposition = false;
        currentCompositionPosition.start += this._dataAlreadySent.length;
        let input;
        if (this._isComposing) {
          input = this._textarea.value.substring(start, end);   // 有界
        } else {
          input = this._textarea.value.substring(start);        // ⚠️ 无上界
        }
        this._coreService.triggerDataEvent(input, true);        // → 我们的 onData
      }
    }, 0);
  }
}
```

`_compositionPosition.start` 在 `compositionstart()` 那一刻记录 `textarea.value.length`,**整个生命周期只在新一轮 compositionstart 触发时才重置**。

### 触发条件(解释了"偶发性")

当 `start` 与 textarea 实际状态对不齐时,`substring(start)` 会把历史累加都取出来发一遍:

1. **两次 `_finalizeComposition` 嵌套** — 前一个 setTimeout(0) 还没跑,新 compositionstart 已经把 `_compositionPosition.start` 改成新值。前一次 setTimeout 跑起来时读到的是新的 `_dataAlreadySent`,offset 算错。
2. **`_handleAnyTextareaChanges` 与 `_finalizeComposition` 的 setTimeout 交错** — keydown 229 + `!isComposing` 的路径(微软拼音把 `，` `。` `、` 当 punctuation auto-convert 直送 textarea,**不一定走 compositionstart**)走 `_handleAnyTextareaChanges`,它内部用 `diff = newValue.replace(oldValue, '')` —— **这是字符串 replace 不是 diff**,当 textarea 历史里恰好出现重复子串时 diff 算错。
3. **`_dataAlreadySent` 在 compositionstart 重置为 `''`**,但 setTimeout 闭包内 `currentCompositionPosition.start += this._dataAlreadySent.length` 读的是当前最新的 `_dataAlreadySent`,跨 composition 时序错乱时会算成 0 → start 不动 → substring 多取。

相关上游 issue 提示:
- `xtermjs/xterm.js#3191` "input characters can be duplicated" → 对应代码里 `_dataAlreadySent` 的补丁,但本 case 露出的是该补丁覆盖不到的另一条路径。
- `xtermjs/xterm.js#3679` `_inputEvent` 与 keydown 交互的 race。

5.5.0 / 当前 master 这两块代码均未本质改动,升 xterm 不是省事路线。

## Workaround 方案(已设计,未实施)

### 第一步:埋探针确认

在 `TerminalView.tsx:1065` 的 `term.onData` 内加一次性日志:

```ts
const dataHandler = term.onData((data) => {
  if (data.length > 20) {  // 单次 IME 提交极少 > 20 字
    const ta = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null;
    console.warn('[IME-LEAK]', {
      len: data.length,
      head: data.slice(0, 60),
      tail: data.slice(-30),
      taLen: ta?.value.length,
      taTail: ta?.value.slice(-60),
    });
  }
  // 原有逻辑...
});
```

复现后看日志:`taLen` 涨到几百几千 + `data` 恰好是 textarea 尾段的子串 → 确认假说。

### 第二步:挂一个 `compositionend` 兜底清空

在 `term.open(container)` 之后立刻:

```ts
const helperTa = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null;
if (helperTa) {
  helperTa.addEventListener('compositionend', () => {
    // 等 xterm 自己的 setTimeout(0) 跑完再清,不抢它的 substring 读取窗口
    setTimeout(() => { helperTa.value = ''; }, 16);
  });
}
```

代价/语义:
- textarea 持续保持空 → 下次 compositionstart 时 `_compositionPosition.start = 0`、`substring(0)` 取到的就是真·本次 composition 内容,无法"溢出到历史"。
- 时序必须晚于 xterm 自己的 setTimeout(0)。用 16ms(一帧)是经验保守值;0ms 会抢在 xterm 的 substring 读取之前清空,**会把当次输入也吞掉**。如果证据显示 xterm 还有更长的延迟路径,放宽到 32ms。
- xterm 的 `_handleAnyTextareaChanges` 也用 `oldValue / newValue` 算 diff,我们在 compositionend 之后清空,不会影响它在 compositionstart 之前的 oldValue 快照。

### 不推荐路径

- **升 `@xterm/xterm`** — master 这两块代码未本质改动,且会同时引入 webgl addon / 其他破坏性变更,不如本地 workaround。
- **fork xterm 修 CompositionHelper** — 维护成本高,且我们对 `_isComposing` / `_isSendingComposition` 状态机的所有 race 边缘 case 没把握能改对。

## 不在本工单范围

- 中文 IME 候选框定位漂移(那是 `updateCompositionElements` 内的 left/top 计算,与本 bug 是不同的代码路径)。
- 切换主题 / 字号时 IME 候选框样式不同步(同上)。

## 待办

- [ ] 第一步埋日志、本地 / 用户机复现拿证据
- [ ] 第二步实施 workaround,加 changelog 一条
- [ ] 跑回归:确认 Enter / Ctrl+C 清 textarea 路径仍工作,中文长段输入不丢字
- [ ] 跟一下 xterm.js 上游 issue,如果将来上游修了,把本 workaround 删掉
