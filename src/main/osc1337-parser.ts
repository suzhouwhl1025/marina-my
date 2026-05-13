/**
 * @file src/main/osc1337-parser.ts
 * @purpose 从 PTY 字节流中识别并提取多种 OSC 序列:
 *   - OSC 1337 (iTerm2):CurrentDir → cwd 事件
 *   - OSC 0 / 1 / 2 (XTerm 标题):set icon/window title → title 事件
 *     (Claude Code、Windows Terminal hostname 提示等都走这套)
 *   残留字节透明转发给 owner renderer。
 *
 * @关键设计:
 * - 增量解析:PTY 数据流可能在任意位置被切分,序列可能跨多次 onData 到达
 * - 解析器对每个 session 独立持有 stash buffer,合并未完结的字节
 * - **不损耗任何字节流**:已识别 OSC 序列从输出中剥离,但所有非 OSC 字节
 *   1:1 输出。这样 xterm.js 不会渲染出 OSC 序列的乱码字符,同时也不丢失
 *   实际的 ANSI 颜色 / 控制序列
 * - 当前识别 OSC 0/1/2/1337;其余 OSC (例如 OSC 8 超链接) 整段透传给 xterm
 * - 序列终止符接受 BEL (\x07) 与 ST (ESC \\,即 \x1b\x5c) 两种
 *
 * @对应文档章节: 软件定义书.md 5.1.8、ADR-003、ADR-008
 *
 * @AGENTS.md 5.3 必测: OSC 序列解析 (各种边界:跨包、夹在 ANSI 中、
 *   超长 stash、未完结永远等不到 ST、OSC 0/2 title 事件)
 */

/**
 * 解析结果。
 */
export interface OscParseResult {
  /** 透明转发的字节流 (剥离了被识别的 OSC 1337 序列) */
  passthrough: Buffer;
  /** 本次解析中识别到的 OSC 1337 事件,按出现顺序 */
  events: Osc1337Event[];
}

/**
 * 解析器识别的 OSC 事件:
 * - `cwd`:OSC 1337 CurrentDir=<path> (iTerm2 协议)
 * - `title`:OSC 0/1/2 设置窗口/图标标题 (XTerm)。Claude Code 用 OSC 0 报告
 *   "✻ Claude · ~/project (working…)" 这类状态;OSC 1=icon only,OSC 2=
 *   window title only。三者业务上等价(都是给"session 显示名"用的),
 *   parser 不区分,统一抛 title 事件
 * - `unknown`:OSC 1337 中未知 key (例如 RemoteHost)。raw 保留供调试
 */
export type Osc1337Event =
  | { kind: 'cwd'; value: string }
  | { kind: 'title'; value: string }
  | { kind: 'unknown'; raw: string };

/**
 * stash 上限。OSC 序列在任何正常情况下都远小于 16KB;超过此值我们认为
 * 是垃圾数据 (或永远收不到终止符的 broken sequence),strash flush 为
 * 普通字节透传,避免内存无限增长。
 */
const STASH_LIMIT = 16 * 1024;

/**
 * 增量 OSC 1337 解析器,每个 session 一份。
 *
 * 用法:每次 PTY onData(data) 调 parse(Buffer.from(data, 'utf8')),拿到
 * passthrough Buffer 转发给 renderer + scrollback,events 用于驱动业务逻辑
 * (currentCwd 更新等)。
 */
export class Osc1337Parser {
  /**
   * 上次未完结的字节 — 既可能是 OSC 序列前缀 (\x1b]1337... 没收到 BEL/ST),
   * 也可能是裸 ESC (\x1b 后面的字节还没来,无法判断是否为 OSC 起始)。
   */
  private stash: Buffer = Buffer.alloc(0);

  /**
   * 处理一段 PTY 字节流。
   *
   * 算法 (单次扫描):
   *   合并 stash + chunk → input
   *   游标从 0 开始,寻找下一个 ESC (0x1B):
   *     如果 ESC 后面一个字节是 ']' (0x5D),进入 OSC 起始
   *       继续读直到 BEL (0x07) 或 ST (ESC \\):
   *         若 OSC 内容以 "1337;" 开头 → 截出 payload 解析 key=value
   *         其他 OSC (例如 0/2/8) 整段透传 (含 ESC ] 与终止符)
   *       若读到末尾还没找到终止符 → 把从 ESC 开始的所有内容存回 stash
   *     如果 ESC 后面是其他非 OSC 字节,ESC 自己也是普通字节,继续扫描
   *   末尾的孤立 ESC (没下一个字节) 也存回 stash
   *
   * 性能:O(n),无回溯。stash 在每次调用末尾要么是空,要么含 ≤ STASH_LIMIT
   * 字节。超过上限直接 flush 为 passthrough (避免内存累积)。
   */
  parse(chunk: Buffer): OscParseResult {
    const input = this.stash.length === 0
      ? chunk
      : Buffer.concat([this.stash, chunk]);
    this.stash = Buffer.alloc(0);

    const passthroughChunks: Buffer[] = [];
    const events: Osc1337Event[] = [];

    let cursor = 0;
    while (cursor < input.length) {
      // OSC-4:识别两种 OSC 起始:
      //   - ESC ] (0x1B 0x5D) — 标准 7-bit 形式,主流 shell 都用
      //   - 0x9D — C1 单字节形式,少数 CJK 终端 / 某些跨平台二进制使用
      // 找两者中最靠前的一个作为下一个候选起始点。oscPayloadStart 是
      // payload 第一字节的下标(ESC ] → escIdx+2;0x9D → escIdx+1)。
      const oscStart = findNextOscStart(input, cursor);
      if (oscStart === null) {
        // 剩余全是普通字节
        passthroughChunks.push(input.subarray(cursor));
        cursor = input.length;
        break;
      }
      const { idx: escIdx, payloadStart: oscPayloadStart, isC1 } = oscStart;
      // OSC 起始之前的普通字节透传
      if (escIdx > cursor) {
        passthroughChunks.push(input.subarray(cursor, escIdx));
      }
      // ESC ] 形式:ESC 之后没字节了 → 孤立 ESC 存 stash 等下次
      if (!isC1 && escIdx + 1 >= input.length) {
        this.stash = input.subarray(escIdx);
        cursor = input.length;
        break;
      }
      // ESC 之后不是 ']' → ESC 当普通字节透传(C1 形式直接走 OSC,不走这里)
      if (!isC1) {
        const next = input[escIdx + 1]!;
        if (next !== 0x5d /* ']' */) {
          passthroughChunks.push(input.subarray(escIdx, escIdx + 1));
          cursor = escIdx + 1;
          continue;
        }
      }
      // OSC 起始,寻找 BEL 或 ST 终止
      const terminatorInfo = findOscTerminator(input, oscPayloadStart);
      if (!terminatorInfo) {
        // 未完结,全部存 stash 等下次
        const tail = input.subarray(escIdx);
        if (tail.length > STASH_LIMIT) {
          // OSC-3:超长不像合法 OSC — 静默丢弃(不再 push 到 passthrough,
          // 否则 xterm 会渲染出字面 `\x1b]1337;...` 乱码)。同时 console.warn
          // 记录用于排查 broken sequence 的来源。
          console.warn(
            `[Osc1337Parser] OSC stash overflow ${tail.length} bytes — dropped to avoid memory累积`,
          );
          cursor = input.length;
          break;
        }
        this.stash = tail;
        cursor = input.length;
        break;
      }
      // OSC 完整: <start> payload TERM
      const payload = input.subarray(oscPayloadStart, terminatorInfo.payloadEnd);
      const titleSeq = parseTitleOscPayload(payload);
      const isOsc1337 =
        payload.length >= 5 && payload.subarray(0, 5).equals(Buffer.from('1337;'));
      if (isOsc1337) {
        const argText = payload.subarray(5).toString('utf8');
        events.push(parseOsc1337Arg(argText));
        // OSC 1337 整段从输出中剥离,不进 passthrough
      } else if (titleSeq) {
        // OSC 0/1/2 设置标题。剥离同 OSC 1337 — xterm.js 即使收到也只是把
        // 它存到 term.options.title 没人读;主进程会把这个 title 反映到
        // session.displayName,sidebar / tab 会同步更新。
        events.push({ kind: 'title', value: titleSeq });
      } else {
        // 其他 OSC (例如 OSC 8 超链接) 透传给 xterm,整段含起始 ESC ] 与终止符
        passthroughChunks.push(input.subarray(escIdx, terminatorInfo.afterEnd));
      }
      cursor = terminatorInfo.afterEnd;
    }

    return {
      passthrough: passthroughChunks.length === 0
        ? Buffer.alloc(0)
        : passthroughChunks.length === 1
          ? passthroughChunks[0]!
          : Buffer.concat(passthroughChunks),
      events,
    };
  }

  /**
   * 测试用:直接清空 stash (模拟 session destroy)。
   */
  reset(): void {
    this.stash = Buffer.alloc(0);
  }

  /**
   * 测试用:暴露 stash 长度,验证不无限增长。
   */
  get stashedBytes(): number {
    return this.stash.length;
  }
}

/**
 * OSC-4:在 buf[start..] 范围找下一个 OSC 起始点。
 *
 * 同时识别:
 *   - ESC ] (0x1B 0x5D) — 7-bit 标准形式
 *   - 0x9D — C1 单字节形式(等价于 ESC ])
 *
 * 取两者中最靠前的命中点。返回 payload 起点(给 findOscTerminator 用)。
 */
function findNextOscStart(
  buf: Buffer,
  start: number,
): { idx: number; payloadStart: number; isC1: boolean } | null {
  const idx7 = buf.indexOf(0x1b, start);
  const idx8 = buf.indexOf(0x9d, start);
  if (idx7 < 0 && idx8 < 0) return null;
  if (idx7 < 0) return { idx: idx8, payloadStart: idx8 + 1, isC1: true };
  if (idx8 < 0) return { idx: idx7, payloadStart: idx7 + 2, isC1: false };
  if (idx7 < idx8) return { idx: idx7, payloadStart: idx7 + 2, isC1: false };
  return { idx: idx8, payloadStart: idx8 + 1, isC1: true };
}

/**
 * 在 buf[start..] 范围找 OSC 终止符。
 *
 * @returns
 *   - { payloadEnd, afterEnd } 命中:payloadEnd 是 payload 结束位置 (终止符前),
 *     afterEnd 是终止符之后的位置 (下次扫描起点)
 *   - null 未命中 (字节流末尾仍未见终止符)
 *
 * 终止符:
 *   - BEL: 单字节 0x07
 *   - ST: 双字节 ESC \\ (0x1b 0x5c)
 */
function findOscTerminator(
  buf: Buffer,
  start: number,
): { payloadEnd: number; afterEnd: number } | null {
  for (let i = start; i < buf.length; i++) {
    const b = buf[i]!;
    if (b === 0x07) {
      return { payloadEnd: i, afterEnd: i + 1 };
    }
    if (b === 0x1b && i + 1 < buf.length && buf[i + 1] === 0x5c) {
      return { payloadEnd: i, afterEnd: i + 2 };
    }
  }
  return null;
}

/**
 * 如果 payload 是 OSC 0/1/2 (设置标题) 的内容,返回标题字符串;否则返回 null。
 *
 * 形式:`Ps;Pt` 其中 Ps∈{0,1,2},Pt 是标题文本。
 * 注意 OSC 0/1/2 不要跟 OSC 10/11/12 (颜色) 混了 — 这些以 1/2 开头,但
 * 第二字节是另一个数字,而不是 ';'。所以严格要求第二字节就是 ';'。
 */
function parseTitleOscPayload(payload: Buffer): string | null {
  if (payload.length < 2) return null;
  const ps = payload[0]!;
  if (ps !== 0x30 /* '0' */ && ps !== 0x31 /* '1' */ && ps !== 0x32 /* '2' */) {
    return null;
  }
  if (payload[1] !== 0x3b /* ';' */) return null;
  return payload.subarray(2).toString('utf8');
}

/**
 * 解析 OSC 1337 的 key=value 部分 (已剥掉 "1337;" 前缀)。
 *
 * iTerm2 协议有许多变体,本应用只关心:
 *   CurrentDir=<path>     — 报告当前 cwd (软件定义书 5.1.8 主路径)
 *   RemoteHost=<...>      — 远程主机 (V1 不用,识别即可)
 * 其他全部归类为 unknown,留 raw 给调试。
 */
function parseOsc1337Arg(arg: string): Osc1337Event {
  const eqIdx = arg.indexOf('=');
  if (eqIdx < 0) return { kind: 'unknown', raw: arg };
  const key = arg.substring(0, eqIdx);
  const value = arg.substring(eqIdx + 1);
  if (key === 'CurrentDir') return { kind: 'cwd', value };
  return { kind: 'unknown', raw: arg };
}
