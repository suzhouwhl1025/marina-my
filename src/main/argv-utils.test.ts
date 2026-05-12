/**
 * @file src/main/argv-utils.test.ts
 * @purpose argv 解析器单测。
 */
import { describe, expect, it } from 'vitest';
import { parseOpenHere } from './argv-utils';

describe('parseOpenHere', () => {
  it('找到 --open-here 后取下一个 token', () => {
    expect(
      parseOpenHere(['C:\\Marina.exe', '--open-here', 'D:\\projects\\foo']),
    ).toBe('D:\\projects\\foo');
  });

  it('没有 --open-here 返回 null', () => {
    expect(parseOpenHere(['C:\\Marina.exe', '--auto-start'])).toBeNull();
  });

  it('--open-here 在末尾(没有下一个 token)返回 null', () => {
    expect(parseOpenHere(['C:\\Marina.exe', '--open-here'])).toBeNull();
  });

  it('--open-here 后紧跟另一个 flag 返回 null(防误吃)', () => {
    expect(
      parseOpenHere(['C:\\Marina.exe', '--open-here', '--auto-start']),
    ).toBeNull();
  });

  it('--open-here 后是空字符串 返回 null', () => {
    expect(parseOpenHere(['C:\\Marina.exe', '--open-here', ''])).toBeNull();
  });

  it('多次出现取第一次', () => {
    expect(
      parseOpenHere([
        'exe',
        '--open-here',
        'C:\\first',
        '--open-here',
        'C:\\second',
      ]),
    ).toBe('C:\\first');
  });

  it('路径含空格/反斜杠正常返回原文', () => {
    expect(
      parseOpenHere(['exe', '--open-here', 'C:\\Users\\My Name\\Docs']),
    ).toBe('C:\\Users\\My Name\\Docs');
  });
});
