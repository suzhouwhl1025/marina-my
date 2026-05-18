/**
 * @file src/shared/ime-probe-ring.test.ts
 * @purpose 护栏单测 — 确保 ring buffer 行为符合"前置 EV 序列 + LEAK 一次性 dump"
 *   的使用契约,以及 isLikelyHistoryFlush 不会再误报"正常长 IME 提交"。
 *
 * 不测探针在浏览器的真实触发(DOM + composition 事件链路在 Node 环境无意义),
 * 只测纯函数本身的边界。
 */
import { describe, expect, it } from 'vitest';
import {
  createImeProbeRing,
  isLikelyHistoryFlush,
  type ImeProbeEntry,
} from './ime-probe-ring';

function evEntry(ev: ImeProbeEntry['ev'], tag: string): ImeProbeEntry {
  return { t: tag, ev, taLen: 0, taTail: '' };
}

describe('createImeProbeRing', () => {
  it('push 不足容量时,drain 按时序返回全部条目', () => {
    const r = createImeProbeRing(5);
    r.push(evEntry('start', 'a'));
    r.push(evEntry('update', 'b'));
    r.push(evEntry('end', 'c'));

    expect(r.size()).toBe(3);
    const dumped = r.drain();
    expect(dumped.map((e) => e.t)).toEqual(['a', 'b', 'c']);
  });

  it('push 超过容量时,覆盖最老的,drain 返回最近 capacity 条', () => {
    const r = createImeProbeRing(3);
    for (let i = 0; i < 7; i++) {
      r.push(evEntry('kd229', String(i)));
    }
    // 最近 3 条应是 '4','5','6' — '0'/'1'/'2'/'3' 被覆盖
    expect(r.drain().map((e) => e.t)).toEqual(['4', '5', '6']);
  });

  it('drain 后 ring 清空,后续 push 是新会话', () => {
    const r = createImeProbeRing(5);
    r.push(evEntry('start', 'a'));
    r.drain();
    expect(r.size()).toBe(0);

    r.push(evEntry('start', 'b'));
    expect(r.drain().map((e) => e.t)).toEqual(['b']);
  });

  it('drain 释放内部引用 — 长 taTail 字符串不会挂在 ring 上', () => {
    const r = createImeProbeRing(2);
    const big = 'x'.repeat(10000);
    r.push({ t: '1', ev: 'end', taLen: 10000, taTail: big });
    const snap = r.drain();
    expect(snap[0]?.taTail).toBe(big);
    // drain 之后再 push,不应该看到 'big' 的痕迹
    r.push(evEntry('start', '2'));
    const next = r.drain();
    expect(next.length).toBe(1);
    expect(next[0]?.t).toBe('2');
  });

  it('容量为 1 也工作', () => {
    const r = createImeProbeRing(1);
    r.push(evEntry('start', 'a'));
    r.push(evEntry('start', 'b'));
    expect(r.drain().map((e) => e.t)).toEqual(['b']);
  });

  it('capacity <= 0 抛错', () => {
    expect(() => createImeProbeRing(0)).toThrow();
    expect(() => createImeProbeRing(-1)).toThrow();
  });
});

describe('isLikelyHistoryFlush', () => {
  it('短 data 不报 (单字 IME 提交)', () => {
    expect(isLikelyHistoryFlush(1, 1)).toBe(false);
    expect(isLikelyHistoryFlush(5, 5)).toBe(false);
    expect(isLikelyHistoryFlush(20, 20)).toBe(false); // 阈值边界
  });

  it('正常长 IME 提交不报 (data 长但 textarea 内容就是 data 本身)', () => {
    // 用户一口气打了 24 字按 Enter,onData 拿到 24 字,textarea 也是 24 字
    expect(isLikelyHistoryFlush(24, 24)).toBe(false);
    // 即使 50 字,只要 textarea 就这么长,也不是 leak
    expect(isLikelyHistoryFlush(50, 50)).toBe(false);
    // taLen 略大于 data 但不到富余阈值 — 还是当正常 (差几个字可能是字符串末尾边界)
    expect(isLikelyHistoryFlush(24, 28)).toBe(false);
  });

  it('真 leak 模式:taLen 远大于 data (textarea 累积了历史)', () => {
    // textarea 累到 200 字,onData 拿到 100 字 — 前面 100 字是没被取出的历史
    expect(isLikelyHistoryFlush(100, 200)).toBe(true);
    // 边界:刚好富余 +8
    expect(isLikelyHistoryFlush(24, 32)).toBe(true);
    // 边界差 1 — 不报
    expect(isLikelyHistoryFlush(24, 31)).toBe(false);
  });

  it('自定义阈值生效', () => {
    expect(isLikelyHistoryFlush(10, 10, { minLen: 5 })).toBe(false); // taLen 不够富余
    expect(isLikelyHistoryFlush(10, 20, { minLen: 5 })).toBe(true);
    expect(isLikelyHistoryFlush(24, 30, { minSurplus: 4 })).toBe(true);
    expect(isLikelyHistoryFlush(24, 27, { minSurplus: 4 })).toBe(false);
  });
});
