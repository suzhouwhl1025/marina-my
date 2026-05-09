/**
 * @file src/main/session-manager.test.ts
 * @purpose SessionManager 单元测试。覆盖 createSession / closeSession /
 *   owner 切换 / 窗口关闭 owner 变 null / PTY 输入输出 / PTY 退出销毁。
 *
 * @关键设计:
 * - 用注入的 fake spawn 函数返回 FakePty (EventEmitter 模拟 onData/onExit/
 *   write/resize/kill),完全绕开 node-pty 原生模块
 * - WindowManager 与 PathManager 用 lightweight stub
 * - 验证事件 emit 与状态转移,不验证 PTY 真实行为
 *
 * @对应文档章节: AGENTS.md 5.3 (SessionManager 必测、Session 状态机必测)
 */
import { describe, expect, it, vi } from 'vitest';
import {
  SessionManager,
  SessionManagerError,
  type PtySpawnFn,
} from './session-manager';
import type { WindowManager } from './window-manager';
import type { PathManager } from './path-manager';

// ──────────────────────────────────────────────────────────────────
// FakePty + fakeSpawn
// ──────────────────────────────────────────────────────────────────

class FakePty {
  static instances: FakePty[] = [];
  public dataListeners: ((s: string) => void)[] = [];
  public exitListeners: ((e: { exitCode: number; signal?: number }) => void)[] = [];
  public written: string[] = [];
  public resized: { cols: number; rows: number }[] = [];
  public killed = false;
  public pid = Math.floor(Math.random() * 100000);

  constructor(
    public file: string,
    public args: string[] | string,
    public options: { cols: number; rows: number; cwd: string; env: Record<string, string>; name: string },
  ) {
    FakePty.instances.push(this);
  }

  onData(listener: (s: string) => void): { dispose(): void } {
    this.dataListeners.push(listener);
    return { dispose: () => {} };
  }
  onExit(listener: (e: { exitCode: number; signal?: number }) => void): {
    dispose(): void;
  } {
    this.exitListeners.push(listener);
    return { dispose: () => {} };
  }
  write(data: string): void {
    this.written.push(data);
  }
  resize(cols: number, rows: number): void {
    this.resized.push({ cols, rows });
  }
  kill(): void {
    this.killed = true;
  }

  // 测试触发器
  emitData(s: string): void {
    for (const l of this.dataListeners) l(s);
  }
  emitExit(exitCode: number, signal?: number): void {
    for (const l of this.exitListeners) {
      l(signal !== undefined ? { exitCode, signal } : { exitCode });
    }
  }

  static reset(): void {
    FakePty.instances = [];
  }
}

const fakeSpawn: PtySpawnFn = (file, args, options) => {
  return new FakePty(file, args, options) as unknown as ReturnType<PtySpawnFn>;
};

// ──────────────────────────────────────────────────────────────────
// Stub WindowManager / PathManager
// ──────────────────────────────────────────────────────────────────

function makeStubWindowManager(): WindowManager {
  return {
    getById: () => null,
    list: () => [],
    count: () => 0,
  } as unknown as WindowManager;
}

function makeStubPathManager(): PathManager & {
  attached: { sessionId: string; path: string }[];
  detached: string[];
} {
  const attached: { sessionId: string; path: string }[] = [];
  const detached: string[] = [];
  const stub = {
    attachSession(sessionId: string, path: string): void {
      attached.push({ sessionId, path });
    },
    detachSession(sessionId: string): void {
      detached.push(sessionId);
    },
    attached,
    detached,
  };
  return stub as unknown as PathManager & typeof stub;
}

// ──────────────────────────────────────────────────────────────────
// 测试
// ──────────────────────────────────────────────────────────────────

describe('SessionManager — createSession', () => {
  it('创建后返回 SessionInfo, 调用 PathManager.attachSession, emit sessionCreated', () => {
    FakePty.reset();
    const win = makeStubWindowManager();
    const path = makeStubPathManager();
    const mgr = new SessionManager(win, path, fakeSpawn);
    const createdListener = vi.fn();
    mgr.on('sessionCreated', createdListener);

    const info = mgr.createSession({
      pathId: '/proj/a',
      templateId: 'shell',
      ownerWindowId: 'w-1',
      cols: 80,
      rows: 24,
    });

    expect(info.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(info.pathId).toBe('/proj/a');
    expect(info.ownerWindowId).toBe('w-1');
    expect(info.state).toBe('active');
    expect(info.cols).toBe(80);
    expect((path as unknown as { attached: unknown[] }).attached).toEqual([
      { sessionId: info.id, path: '/proj/a' },
    ]);
    expect(createdListener).toHaveBeenCalledTimes(1);
    expect(FakePty.instances).toHaveLength(1);
  });

  it('cols/rows 越界时被夹到合法范围', () => {
    FakePty.reset();
    const mgr = new SessionManager(
      makeStubWindowManager(),
      makeStubPathManager(),
      fakeSpawn,
    );
    const info = mgr.createSession({
      pathId: '/proj/a',
      templateId: 'shell',
      ownerWindowId: 'w-1',
      cols: -5,
      rows: 99999,
    });
    expect(info.cols).toBe(1);
    expect(info.rows).toBe(1000);
  });

  it('templateId 不是 "shell" 时 throw TemplateNotFound', () => {
    const mgr = new SessionManager(
      makeStubWindowManager(),
      makeStubPathManager(),
      fakeSpawn,
    );
    expect(() =>
      mgr.createSession({
        pathId: '/proj/a',
        templateId: 'claude-code',
        ownerWindowId: 'w-1',
        cols: 80,
        rows: 24,
      }),
    ).toThrowError(/TemplateNotFound/);
  });

  it('spawn 失败时 throw PtySpawnFailed 带详细诊断', () => {
    const failingSpawn: PtySpawnFn = () => {
      throw new Error('ENOENT: no such file or directory');
    };
    const mgr = new SessionManager(
      makeStubWindowManager(),
      makeStubPathManager(),
      failingSpawn,
    );
    expect(() =>
      mgr.createSession({
        pathId: '/proj/a',
        templateId: 'shell',
        ownerWindowId: 'w-1',
        cols: 80,
        rows: 24,
      }),
    ).toThrowError(/PtySpawnFailed.*shell.*ENOENT/);
  });
});

describe('SessionManager — closeSession', () => {
  it('kill PTY, 从 sessions 移除, 调 PathManager.detachSession, emit sessionDestroyed', () => {
    FakePty.reset();
    const path = makeStubPathManager();
    const mgr = new SessionManager(makeStubWindowManager(), path, fakeSpawn);
    const destroyedListener = vi.fn();
    mgr.on('sessionDestroyed', destroyedListener);

    const info = mgr.createSession({
      pathId: '/proj/a',
      templateId: 'shell',
      ownerWindowId: 'w-1',
      cols: 80,
      rows: 24,
    });
    expect(mgr.count()).toBe(1);

    mgr.closeSession(info.id);
    expect(mgr.count()).toBe(0);
    expect(FakePty.instances[0]!.killed).toBe(true);
    expect((path as unknown as { detached: string[] }).detached).toContain(info.id);
    expect(destroyedListener).toHaveBeenCalledWith({
      sessionId: info.id,
      reason: 'user-closed',
    });
  });

  it('不存在的 sessionId 静默 (幂等)', () => {
    const mgr = new SessionManager(
      makeStubWindowManager(),
      makeStubPathManager(),
      fakeSpawn,
    );
    expect(() => mgr.closeSession('nonexistent')).not.toThrow();
  });
});

describe('SessionManager — owner 切换', () => {
  it('claimOwner 改变 owner 并 emit sessionOwnerChanged', () => {
    FakePty.reset();
    const mgr = new SessionManager(
      makeStubWindowManager(),
      makeStubPathManager(),
      fakeSpawn,
    );
    const ownerListener = vi.fn();
    mgr.on('sessionOwnerChanged', ownerListener);

    const info = mgr.createSession({
      pathId: '/x',
      templateId: 'shell',
      ownerWindowId: 'w-1',
      cols: 80,
      rows: 24,
    });
    mgr.claimOwner(info.id, 'w-2');
    expect(mgr.get(info.id)!.ownerWindowId).toBe('w-2');
    expect(ownerListener).toHaveBeenCalledWith({
      sessionId: info.id,
      oldOwnerWindowId: 'w-1',
      newOwnerWindowId: 'w-2',
    });
  });

  it('claimOwner 已是 owner → no-op', () => {
    FakePty.reset();
    const mgr = new SessionManager(
      makeStubWindowManager(),
      makeStubPathManager(),
      fakeSpawn,
    );
    const info = mgr.createSession({
      pathId: '/x',
      templateId: 'shell',
      ownerWindowId: 'w-1',
      cols: 80,
      rows: 24,
    });
    const listener = vi.fn();
    mgr.on('sessionOwnerChanged', listener);
    mgr.claimOwner(info.id, 'w-1');
    expect(listener).not.toHaveBeenCalled();
  });

  it('releaseOwner 把 owner 设 null', () => {
    FakePty.reset();
    const mgr = new SessionManager(
      makeStubWindowManager(),
      makeStubPathManager(),
      fakeSpawn,
    );
    const info = mgr.createSession({
      pathId: '/x',
      templateId: 'shell',
      ownerWindowId: 'w-1',
      cols: 80,
      rows: 24,
    });
    mgr.releaseOwner(info.id, 'w-1');
    expect(mgr.get(info.id)!.ownerWindowId).toBeNull();
  });

  it('releaseOwner 由非 owner 调 → NotOwner', () => {
    FakePty.reset();
    const mgr = new SessionManager(
      makeStubWindowManager(),
      makeStubPathManager(),
      fakeSpawn,
    );
    const info = mgr.createSession({
      pathId: '/x',
      templateId: 'shell',
      ownerWindowId: 'w-1',
      cols: 80,
      rows: 24,
    });
    expect(() => mgr.releaseOwner(info.id, 'w-2')).toThrowError(/NotOwner/);
  });

  it('claimOwner 不存在的 session → SessionNotFound', () => {
    const mgr = new SessionManager(
      makeStubWindowManager(),
      makeStubPathManager(),
      fakeSpawn,
    );
    expect(() => mgr.claimOwner('xxx', 'w-1')).toThrowError(/SessionNotFound/);
  });

  it('handleWindowClosed: 该窗口持有的所有 session owner 变 null, PTY 不死', () => {
    FakePty.reset();
    const mgr = new SessionManager(
      makeStubWindowManager(),
      makeStubPathManager(),
      fakeSpawn,
    );
    const a = mgr.createSession({
      pathId: '/x',
      templateId: 'shell',
      ownerWindowId: 'w-1',
      cols: 80,
      rows: 24,
    });
    const b = mgr.createSession({
      pathId: '/y',
      templateId: 'shell',
      ownerWindowId: 'w-1',
      cols: 80,
      rows: 24,
    });
    const c = mgr.createSession({
      pathId: '/z',
      templateId: 'shell',
      ownerWindowId: 'w-2',
      cols: 80,
      rows: 24,
    });

    mgr.handleWindowClosed('w-1');

    expect(mgr.get(a.id)!.ownerWindowId).toBeNull();
    expect(mgr.get(b.id)!.ownerWindowId).toBeNull();
    expect(mgr.get(c.id)!.ownerWindowId).toBe('w-2'); // 不受影响
    expect(mgr.count()).toBe(3); // 都还在 (PTY 不死)
    for (const pty of FakePty.instances) {
      expect(pty.killed).toBe(false);
    }
  });
});

describe('SessionManager — PTY 输入 / 输出 / 退出', () => {
  it('sendInput 把 base64 解码后写入 PTY', () => {
    FakePty.reset();
    const mgr = new SessionManager(
      makeStubWindowManager(),
      makeStubPathManager(),
      fakeSpawn,
    );
    const info = mgr.createSession({
      pathId: '/x',
      templateId: 'shell',
      ownerWindowId: 'w-1',
      cols: 80,
      rows: 24,
    });
    const base64 = Buffer.from('hello\r').toString('base64');
    mgr.sendInput(info.id, base64);
    expect(FakePty.instances[0]!.written).toEqual(['hello\r']);
  });

  it('sendInput 不存在的 session 静默', () => {
    const mgr = new SessionManager(
      makeStubWindowManager(),
      makeStubPathManager(),
      fakeSpawn,
    );
    expect(() => mgr.sendInput('xxx', 'aGk=')).not.toThrow();
  });

  it('PTY 输出 emit sessionOutput (单调 seq + base64 编码)', () => {
    FakePty.reset();
    const mgr = new SessionManager(
      makeStubWindowManager(),
      makeStubPathManager(),
      fakeSpawn,
    );
    const outputListener = vi.fn();
    mgr.on('sessionOutput', outputListener);
    const info = mgr.createSession({
      pathId: '/x',
      templateId: 'shell',
      ownerWindowId: 'w-1',
      cols: 80,
      rows: 24,
    });
    FakePty.instances[0]!.emitData('PS> ');
    FakePty.instances[0]!.emitData('hi\n');

    expect(outputListener).toHaveBeenCalledTimes(2);
    const first = outputListener.mock.calls[0]![0] as {
      sessionId: string;
      data: string;
      seq: number;
    };
    expect(first.sessionId).toBe(info.id);
    expect(first.seq).toBe(0);
    expect(Buffer.from(first.data, 'base64').toString('utf8')).toBe('PS> ');
    expect((outputListener.mock.calls[1]![0] as { seq: number }).seq).toBe(1);
  });

  it('resize 把 cols/rows 转给 PTY 并更新 SessionInfo', () => {
    FakePty.reset();
    const mgr = new SessionManager(
      makeStubWindowManager(),
      makeStubPathManager(),
      fakeSpawn,
    );
    const info = mgr.createSession({
      pathId: '/x',
      templateId: 'shell',
      ownerWindowId: 'w-1',
      cols: 80,
      rows: 24,
    });
    mgr.resize(info.id, 120, 40);
    expect(FakePty.instances[0]!.resized).toEqual([{ cols: 120, rows: 40 }]);
    expect(mgr.get(info.id)!.cols).toBe(120);
    expect(mgr.get(info.id)!.rows).toBe(40);
  });

  it('PTY 退出 → emit sessionExited 且自动 destroy', () => {
    FakePty.reset();
    const path = makeStubPathManager();
    const mgr = new SessionManager(makeStubWindowManager(), path, fakeSpawn);
    const exitedListener = vi.fn();
    const destroyedListener = vi.fn();
    mgr.on('sessionExited', exitedListener);
    mgr.on('sessionDestroyed', destroyedListener);

    const info = mgr.createSession({
      pathId: '/x',
      templateId: 'shell',
      ownerWindowId: 'w-1',
      cols: 80,
      rows: 24,
    });
    FakePty.instances[0]!.emitExit(0);

    expect(exitedListener).toHaveBeenCalledWith({ sessionId: info.id, exitCode: 0 });
    expect(destroyedListener).toHaveBeenCalledWith({
      sessionId: info.id,
      reason: 'pty-exited',
    });
    expect(mgr.count()).toBe(0);
    expect((path as unknown as { detached: string[] }).detached).toContain(info.id);
  });

  it('PTY 退出带 signal 时 payload 含 signal 字段', () => {
    FakePty.reset();
    const mgr = new SessionManager(
      makeStubWindowManager(),
      makeStubPathManager(),
      fakeSpawn,
    );
    const exitedListener = vi.fn();
    mgr.on('sessionExited', exitedListener);

    mgr.createSession({
      pathId: '/x',
      templateId: 'shell',
      ownerWindowId: 'w-1',
      cols: 80,
      rows: 24,
    });
    FakePty.instances[0]!.emitExit(-1, 15); // SIGTERM

    expect(exitedListener.mock.calls[0]![0]).toMatchObject({ exitCode: -1, signal: 15 });
  });
});

describe('SessionManager — 多 session 与列表', () => {
  it('list 返回所有 session 副本', () => {
    FakePty.reset();
    const mgr = new SessionManager(
      makeStubWindowManager(),
      makeStubPathManager(),
      fakeSpawn,
    );
    mgr.createSession({
      pathId: '/x',
      templateId: 'shell',
      ownerWindowId: 'w-1',
      cols: 80,
      rows: 24,
    });
    mgr.createSession({
      pathId: '/y',
      templateId: 'shell',
      ownerWindowId: 'w-2',
      cols: 80,
      rows: 24,
    });
    const list = mgr.list();
    expect(list).toHaveLength(2);
    // 副本: 修改不影响内部
    list[0]!.ownerWindowId = 'mutated';
    expect(mgr.list()[0]!.ownerWindowId).not.toBe('mutated');
  });

  it('shutdown 关闭所有 session', () => {
    FakePty.reset();
    const mgr = new SessionManager(
      makeStubWindowManager(),
      makeStubPathManager(),
      fakeSpawn,
    );
    mgr.createSession({
      pathId: '/x',
      templateId: 'shell',
      ownerWindowId: 'w-1',
      cols: 80,
      rows: 24,
    });
    mgr.createSession({
      pathId: '/y',
      templateId: 'shell',
      ownerWindowId: 'w-1',
      cols: 80,
      rows: 24,
    });
    mgr.shutdown();
    expect(mgr.count()).toBe(0);
    for (const pty of FakePty.instances) expect(pty.killed).toBe(true);
  });
});

describe('SessionManagerError', () => {
  it('暴露 code 与 details', () => {
    const err = new SessionManagerError('PtySpawnFailed', 'foo', { shellPath: '/bin/sh' });
    expect(err.code).toBe('PtySpawnFailed');
    expect(err.details).toEqual({ shellPath: '/bin/sh' });
  });
});
