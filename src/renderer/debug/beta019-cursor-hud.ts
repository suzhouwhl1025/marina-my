// [BETA-019 DEBUG] 临时调试模块 — 定位"Claude Code 运行一段时间后输出区出现闪烁光标"。
//
// 假设:xterm.js 内部 `coreService.isCursorHidden` 被某段 non-`?25l` escape 序列翻回
// false。最强候选是 DECSTR (`\x1b[!p`) 或 RIS (`\x1b c`) — 见
// `node_modules/@xterm/xterm/src/common/InputHandler.ts:2693` (softReset).
//
// 本模块做两件事:
//   (1) 暴露当前活动 Terminal 实例供 HUD 采样
//   (2) **在 register 时给 coreService.isCursorHidden 装 Object.defineProperty
//       setter,翻转发生瞬间抓 stack trace**,从中解析 InputHandler 的 caller
//       method,告诉用户是哪个 escape 序列触发的
//
// 翻转历史按 sessionId 保存在模块层 Map,跨组件 unmount / sessionId 切换持久,
// 只有 Marina 进程重启清空。
import type { Terminal } from '@xterm/xterm';

// ──────────────────────────────────────────────────────────────────
// Terminal registry
// ──────────────────────────────────────────────────────────────────

const registry = new Map<string, Terminal>();

export function registerTerminal(sessionId: string, term: Terminal): void {
  registry.set(sessionId, term);
  if (!history.has(sessionId)) {
    history.set(sessionId, {
      hideFlips: 0,
      lastHidden: null,
      lastFlipAt: null,
      lastFlipFromTo: '',
      mountedAt: Date.now(),
      flipLog: [],
    });
  }
  // 立即给 coreService.isCursorHidden 装拦截器。这是最早可以做的时机 —
  // 在 term.open() 之前,任何字节都还没进 InputHandler。
  patchCursorHidden(sessionId, term);
}

export function unregisterTerminal(sessionId: string): void {
  registry.delete(sessionId);
  // 故意不清 history — 用户切 session 再切回来仍能看到累积翻转
}

export function getTerminal(sessionId: string | null | undefined): Terminal | undefined {
  if (!sessionId) return undefined;
  return registry.get(sessionId);
}

// ──────────────────────────────────────────────────────────────────
// Sampling (HUD 250ms 轮询用)
// ──────────────────────────────────────────────────────────────────

export interface CursorSnapshot {
  cursorHidden: boolean | null;
  cursorInitialized: boolean | null;
  blink: boolean | null;
  style: string | null;
  cursorX: number | null;
  cursorY: number | null;
  bufferY: number | null;
}

export function sampleCursor(term: Terminal | undefined): CursorSnapshot {
  if (!term) {
    return {
      cursorHidden: null,
      cursorInitialized: null,
      blink: null,
      style: null,
      cursorX: null,
      cursorY: null,
      bufferY: null,
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const core = (term as any)._core;
  const coreService = core?.coreService;
  const buf = term.buffer?.active;
  return {
    cursorHidden: coreService?.isCursorHidden ?? null,
    cursorInitialized: coreService?.isCursorInitialized ?? null,
    blink: (term.options.cursorBlink as boolean | undefined) ?? null,
    style: (term.options.cursorStyle as string | undefined) ?? null,
    cursorX: buf?.cursorX ?? null,
    cursorY: buf?.cursorY ?? null,
    bufferY: buf?.baseY ?? null,
  };
}

// ──────────────────────────────────────────────────────────────────
// Flip history
// ──────────────────────────────────────────────────────────────────

export interface FlipEntry {
  at: number;          // ms since mountedAt
  atEpoch: number;     // ms epoch
  fromTo: string;      // "F→T" / "T→F"
  reason: string;      // 解析自 stack 的 InputHandler 方法名或解释
  stackHead: string;   // stack 前 3 行(去掉 patch 自己),用户排查时用
}

export interface FlipHistory {
  hideFlips: number;
  lastHidden: boolean | null;
  lastFlipAt: number | null;
  lastFlipFromTo: string;
  mountedAt: number;
  flipLog: FlipEntry[];
}

const history = new Map<string, FlipHistory>();
const MAX_FLIP_LOG = 50;

export function getHistory(sessionId: string | null | undefined): FlipHistory | null {
  if (!sessionId) return null;
  return history.get(sessionId) ?? null;
}

// ──────────────────────────────────────────────────────────────────
// isCursorHidden setter 拦截 — 核心抓取机制
// ──────────────────────────────────────────────────────────────────

// 标记 coreService 已被 patch,避免同一实例重复包
const PATCHED_FLAG = '__beta019_patched';

function patchCursorHidden(sessionId: string, term: Terminal): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coreService = (term as any)._core?.coreService;
  if (!coreService) {
    // eslint-disable-next-line no-console
    console.warn('[BETA-019] coreService 不可用,无法 patch isCursorHidden');
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((coreService as any)[PATCHED_FLAG]) return;

  let inner: boolean = coreService.isCursorHidden;
  Object.defineProperty(coreService, 'isCursorHidden', {
    configurable: true,
    enumerable: true,
    get(): boolean {
      return inner;
    },
    set(v: boolean) {
      if (v !== inner) {
        const stack = new Error().stack ?? '';
        const reason = parseReason(stack);
        const stackHead = formatStackHead(stack);
        recordFlip(sessionId, inner, v, reason, stackHead);
      }
      inner = v;
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (coreService as any)[PATCHED_FLAG] = true;
  // eslint-disable-next-line no-console
  console.log(
    `[BETA-019] patched isCursorHidden on session=${sessionId.slice(0, 8)} (initial=${inner})`,
  );
}

function recordFlip(
  sessionId: string,
  from: boolean,
  to: boolean,
  reason: string,
  stackHead: string,
): void {
  const entry = history.get(sessionId);
  if (!entry) return;
  const fromTo = `${from ? 'T' : 'F'}→${to ? 'T' : 'F'}`;
  const atEpoch = Date.now();
  const at = atEpoch - entry.mountedAt;
  entry.hideFlips++;
  entry.lastFlipAt = at;
  entry.lastFlipFromTo = fromTo;
  const flipEntry: FlipEntry = { at, atEpoch, fromTo, reason, stackHead };
  entry.flipLog.push(flipEntry);
  if (entry.flipLog.length > MAX_FLIP_LOG) entry.flipLog.shift();
  // 写一行到 console 方便快速复制
  // eslint-disable-next-line no-console
  console.log(
    `[BETA-019] session=${sessionId.slice(0, 8)} flip #${entry.hideFlips} ${fromTo} @${(at / 1000).toFixed(2)}s reason=${reason}`,
  );
}

// ──────────────────────────────────────────────────────────────────
// Stack trace 解析 — 把 caller method 名转成人类可读 reason
// ──────────────────────────────────────────────────────────────────

// xterm 5.x 的 InputHandler 关键路径(行号见 InputHandler.ts):
//   setModePrivate (内部 case 25) → DECSET ?25h "show cursor"
//   resetModePrivate (内部 case 25) → DECRST ?25l "hide cursor"
//   softReset → DECSTR "\x1b[!p"
//   fullReset → RIS "\x1b c" (通过 _onRequestReset.fire)
//   reset → 综合 reset 流程
//
// 编译产物可能被 minify 把 method 名改成 e/t/n,但 stack frame 通常保留
// "原始字符串名" 在错误中(取决于打包工具配置)。这里尽量列全可能匹配。
const KNOWN_METHODS: Array<[RegExp, string]> = [
  [/setModePrivate\b/i, 'DECSET (?25h show cursor)'],
  [/resetModePrivate\b/i, 'DECRST (?25l hide cursor)'],
  [/\bsoftReset\b/, 'DECSTR \\x1b[!p (soft reset) — 主要嫌疑'],
  [/\bfullReset\b/, 'RIS \\x1b c (full reset) — 主要嫌疑'],
  [/\.reset\b/, '通用 reset (待人工辨别)'],
  [/InputHandler\.parse/, 'InputHandler.parse 内 (escape 已识别但 method 未匹配)'],
];

function parseReason(stack: string): string {
  for (const [re, label] of KNOWN_METHODS) {
    if (re.test(stack)) return label;
  }
  // 兜底:从 stack 第二行(跳过 Error 行 + 我们自己的 setter)抽 caller
  const lines = stack.split('\n').slice(2, 5);
  for (const line of lines) {
    const m = line.match(/at\s+([^\s(]+)/);
    if (m && m[1] && !m[1].startsWith('Object.set')) return `caller=${m[1]}`;
  }
  return '?';
}

function formatStackHead(stack: string): string {
  // 删 Error 行 + 我们的 setter 行,保留 caller 上下文 3 行
  return stack
    .split('\n')
    .slice(2, 5)
    .map((l) => l.trim())
    .join(' | ');
}
