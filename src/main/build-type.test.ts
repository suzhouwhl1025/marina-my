/**
 * @file src/main/build-type.test.ts
 * @purpose getBuildType() 三态分支。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mockIsPackaged;
    },
  },
}));

let mockIsPackaged = false;
let origPortable: string | undefined;

import { __resetBuildTypeCacheForTest, getBuildType } from './build-type';

describe('getBuildType', () => {
  afterEach(() => {
    __resetBuildTypeCacheForTest();
    if (origPortable === undefined) {
      delete process.env['PORTABLE_EXECUTABLE_DIR'];
    } else {
      process.env['PORTABLE_EXECUTABLE_DIR'] = origPortable;
    }
    origPortable = undefined;
  });

  it('!isPackaged → dev', () => {
    mockIsPackaged = false;
    expect(getBuildType()).toBe('dev');
  });

  it('isPackaged + PORTABLE_EXECUTABLE_DIR → portable', () => {
    mockIsPackaged = true;
    origPortable = process.env['PORTABLE_EXECUTABLE_DIR'];
    process.env['PORTABLE_EXECUTABLE_DIR'] = 'C:\\Users\\me\\Downloads';
    expect(getBuildType()).toBe('portable');
  });

  it('isPackaged + no PORTABLE_EXECUTABLE_DIR → installed', () => {
    mockIsPackaged = true;
    origPortable = process.env['PORTABLE_EXECUTABLE_DIR'];
    delete process.env['PORTABLE_EXECUTABLE_DIR'];
    expect(getBuildType()).toBe('installed');
  });

  it('结果被缓存', () => {
    mockIsPackaged = false;
    const first = getBuildType();
    mockIsPackaged = true;
    expect(getBuildType()).toBe(first);
  });
});
