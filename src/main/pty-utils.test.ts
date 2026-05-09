/**
 * @file src/main/pty-utils.test.ts
 * @purpose 验证 PTY 相关纯函数 (validateDimensions / buildSpawnEnv)。
 *
 * @对应文档章节: AGENTS.md 5.6 (测试要"会出错"),覆盖错误输入与边界。
 */
import { describe, expect, it } from 'vitest';
import { buildSpawnEnv, validateDimensions } from './pty-utils';

describe('validateDimensions', () => {
  it('合法值原样返回', () => {
    expect(validateDimensions(80, 24)).toEqual({ cols: 80, rows: 24 });
    expect(validateDimensions(120, 40)).toEqual({ cols: 120, rows: 40 });
  });

  it('小于 min 被夹到 min', () => {
    expect(validateDimensions(0, 0)).toEqual({ cols: 1, rows: 1 });
    expect(validateDimensions(-5, -10)).toEqual({ cols: 1, rows: 1 });
  });

  it('大于 max 被夹到 max', () => {
    expect(validateDimensions(5000, 5000)).toEqual({ cols: 1000, rows: 1000 });
  });

  it('NaN / Infinity / 非整数 → fallback (80x24)', () => {
    expect(validateDimensions(Number.NaN, 24)).toEqual({ cols: 80, rows: 24 });
    expect(validateDimensions(80, Number.POSITIVE_INFINITY)).toEqual({
      cols: 80,
      rows: 24,
    });
    expect(validateDimensions(80.5, 24.7)).toEqual({ cols: 80, rows: 24 });
  });

  it('cols 与 rows 是独立校验,一个非法不影响另一个', () => {
    expect(validateDimensions(Number.NaN, 100)).toEqual({ cols: 80, rows: 100 });
    expect(validateDimensions(120, Number.NaN)).toEqual({ cols: 120, rows: 24 });
  });

  it('自定义 min/max 可覆盖默认', () => {
    expect(
      validateDimensions(50, 10, { minCols: 100, maxCols: 200, minRows: 20, maxRows: 50 }),
    ).toEqual({ cols: 100, rows: 20 });
  });
});

describe('buildSpawnEnv', () => {
  it('过滤掉 undefined 值,只保留 string', () => {
    const env = buildSpawnEnv({
      PATH: '/usr/bin',
      HOME: '/home/me',
      EMPTY: undefined,
    });
    expect(env).toEqual({ PATH: '/usr/bin', HOME: '/home/me' });
    expect(Object.hasOwn(env, 'EMPTY')).toBe(false);
  });

  it('skipKeys 中的 key 被剔除', () => {
    const env = buildSpawnEnv(
      {
        PATH: '/usr/bin',
        ELECTRON_RUN_AS_NODE: '1',
        ELECTRON_RENDERER_URL: 'http://x',
      },
      ['ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL'],
    );
    expect(env).toEqual({ PATH: '/usr/bin' });
  });

  it('skipKeys 缺省时不剔除任何东西', () => {
    const env = buildSpawnEnv({ A: '1', B: '2' });
    expect(env).toEqual({ A: '1', B: '2' });
  });

  it('返回值是新对象,不会污染传入的源', () => {
    const source = { A: '1' };
    const env = buildSpawnEnv(source);
    env.B = '2';
    expect(source).toEqual({ A: '1' });
  });

  it('skipKeys 不存在时不报错 (传入空 Set 等价)', () => {
    expect(() => buildSpawnEnv({ A: '1' }, [])).not.toThrow();
    expect(() => buildSpawnEnv({ A: '1' }, new Set())).not.toThrow();
  });
});
