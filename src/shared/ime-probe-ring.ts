/**
 * @file src/shared/ime-probe-ring.ts
 * @purpose IME-1 探针的内存 ring buffer + LEAK 判定纯函数。
 *
 *   配合 src/renderer/components/TerminalView.tsx 里的 IME 探针使用:
 *   - 每条 [IME-EV] 不再打 console (噪音过大),改 push 进 ring
 *   - onData 触发疑似 LEAK 时,drain ring 把"LEAK + 前置 EV 序列"
 *     一次性 IPC 发到 main 端 logger.ime(...) 落盘
 *
 *   为什么纯函数 + duck-typed: AGENTS.md 5.1 红线 — renderer 不写测试,
 *   核心逻辑必须沉到 shared 才能加护栏单测。同 ime-textarea-workaround.ts 模式。
 *
 * @关键设计:
 * - 固定容量 ring,满了覆盖最老的(IME-LEAK 偶发,前后 1-2 秒上下文足够定位)
 * - drain() 同时返回快照并清空 — 一次 LEAK 一次 dump,避免下次 LEAK 把上次
 *   的旧 EV 也带出来,导致 main 端日志难以区分"事件归属"
 * - isLikelyHistoryFlush 升级 LEAK 判定:原阈值 `data.length > 20` 把
 *   "用户一口气打了 24 字的正常 IME 提交"也误报为 leak。新判定要求 textarea
 *   严格长于 data + 富余,排除"textarea 内容就是 data 本身"的长输入场景。
 *   依据见 docs/issues/ime-1-chinese-ime-stale-textarea-flush.md "证据归档"
 *   段:真 leak 的特征是 taLen 远大于 len、tail 出现在 taTail 末尾作为子串。
 */

/**
 * 一条 IME 监控事件,对应 helper-textarea 上的 composition / keydown 触发。
 */
export interface ImeProbeEntry {
  /** performance.now() 的字符串形式 (探针打点时序) */
  t: string;
  /** 事件标签 — composition* / kd229 / leak */
  ev: 'start' | 'update' | 'end' | 'kd229' | 'leak';
  /** composition 事件的 data 字段;kd229 可能没有 */
  data?: string;
  /** kd229 的按键名 (e.g. 'Process', ',', '.') */
  key?: string;
  /** 触发时 helper-textarea.value.length */
  taLen: number;
  /** 触发时 helper-textarea.value.slice(-40) */
  taTail: string;
  /** ev=leak 专属:onData 收到的字符串总长 */
  leakLen?: number;
  /** ev=leak 专属:data 头 60 字 */
  leakHead?: string;
  /** ev=leak 专属:data 尾 30 字 */
  leakTail?: string;
}

/**
 * Ring buffer 句柄。push 满了覆盖最老;drain 返回快照并清空。
 */
export interface ImeProbeRing {
  push(entry: ImeProbeEntry): void;
  /** 返回当前所有条目(时序顺序),并清空 ring */
  drain(): ImeProbeEntry[];
  /** 测试辅助:当前条目数 */
  size(): number;
}

export function createImeProbeRing(capacity = 50): ImeProbeRing {
  if (capacity <= 0) {
    throw new Error('createImeProbeRing: capacity must be > 0');
  }
  const buf: (ImeProbeEntry | undefined)[] = new Array(capacity);
  let head = 0; // 下一个写入位置
  let count = 0;

  return {
    push(entry: ImeProbeEntry): void {
      buf[head] = entry;
      head = (head + 1) % capacity;
      if (count < capacity) count += 1;
    },
    drain(): ImeProbeEntry[] {
      const out: ImeProbeEntry[] = [];
      // 从最老的开始读 — 最老的位置 = head - count (mod capacity)
      const start = (head - count + capacity) % capacity;
      for (let i = 0; i < count; i++) {
        const e = buf[(start + i) % capacity];
        if (e !== undefined) out.push(e);
      }
      // 清空 — 把已 drain 的引用释放,避免长 taTail 字符串挂在 ring 里
      for (let i = 0; i < capacity; i++) buf[i] = undefined;
      head = 0;
      count = 0;
      return out;
    },
    size(): number {
      return count;
    },
  };
}

/**
 * 判定 onData 收到的 data 是否疑似 "textarea 累积历史被冲刷出去" (真 leak)。
 *
 * 必要条件:
 * 1. `data.length > minLen` — 排除单字 / 短词 IME 提交
 * 2. `taLen >= data.length + minSurplus` — textarea 比 data 长出"富余"才说明
 *    textarea 里还有 data 取不到的"前面那一段历史"。`taLen === data.length`
 *    表示 textarea 内容就是 data,正常长输入,不是 leak。
 *
 * 注意这里只用 data.length + taLen 两个字段(探针都能稳定拿到),
 * 不依赖 head/tail/taTail 的具体内容判定子串包含 — 字符串比较在 IME 长输入
 * 边界条件多(全角半角、组合字符、UTF-16 代理对截断),容易引入新的误报源。
 * 富余阈值 8 足够把"正常长输入"和"textarea 累积"两种现象拉开 ROC。
 */
export function isLikelyHistoryFlush(
  dataLength: number,
  taLen: number,
  options: { minLen?: number; minSurplus?: number } = {},
): boolean {
  const minLen = options.minLen ?? 20;
  const minSurplus = options.minSurplus ?? 8;
  if (dataLength <= minLen) return false;
  if (taLen < dataLength + minSurplus) return false;
  return true;
}
