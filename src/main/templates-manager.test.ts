/**
 * @file src/main/templates-manager.test.ts
 * @purpose TemplatesManager 单元测试。覆盖 initialize 加载 + mergeBuiltins
 *   补齐 + 默认 ID 校验、resolve 兜底、setDefault、emitUpdated。
 *
 * @关键设计:
 * - JsonStore 用 mock 而非真实 fs,避免测试时落盘
 * - mergeBuiltins 在 session-manager.test.ts 已有覆盖,这里只测 manager 集成
 *
 * @对应文档章节: AGENTS.md 5.3 必测 (持久化往返、损坏恢复、mergeBuiltins)。
 */
import { describe, expect, it, vi } from 'vitest';
import { BUILTIN_TEMPLATES, TemplatesManager, TemplatesManagerError } from './templates-manager';
import type { JsonStore } from './persistence';
import type { Template, TemplatesFile } from '@shared/types';

interface MockStore extends JsonStore<TemplatesFile> {
  __setLoadResult(value: TemplatesFile, source: 'main' | 'bak' | 'default'): void;
  __getSet(): TemplatesFile | null;
}

function makeMockStore(): MockStore {
  let loadValue: TemplatesFile = {
    version: 1,
    defaultTemplateId: 'shell',
    templates: [],
  };
  let loadSource: 'main' | 'bak' | 'default' = 'default';
  let lastSet: TemplatesFile | null = null;

  const stub = {
    async load(_defaults: TemplatesFile) {
      return { value: loadValue, source: loadSource };
    },
    set(value: TemplatesFile) {
      lastSet = value;
    },
    async flush() {
      // noop
    },
    __setLoadResult(value: TemplatesFile, source: 'main' | 'bak' | 'default') {
      loadValue = value;
      loadSource = source;
    },
    __getSet() {
      return lastSet;
    },
  };
  return stub as unknown as MockStore;
}

describe('TemplatesManager — initialize', () => {
  it('空 store 加载 → 4 个内置模板齐全,defaultId=shell', async () => {
    const store = makeMockStore();
    const mgr = new TemplatesManager(store);
    const src = await mgr.initialize();
    expect(src).toBe('default');
    expect(mgr.list()).toHaveLength(4);
    expect(mgr.list().map((t) => t.id)).toEqual([
      'shell',
      'claude-code',
      'codex',
      'opencode',
    ]);
    expect(mgr.getDefaultTemplateId()).toBe('shell');
  });

  it('用户改了内置模板 name → 加载后保留用户版本', async () => {
    const store = makeMockStore();
    const userShell: Template = {
      ...BUILTIN_TEMPLATES[0]!,
      name: 'My Shell',
    };
    store.__setLoadResult(
      {
        version: 1,
        defaultTemplateId: 'shell',
        templates: [userShell, ...BUILTIN_TEMPLATES.slice(1)],
      },
      'main',
    );
    const mgr = new TemplatesManager(store);
    await mgr.initialize();
    const shell = mgr.get('shell');
    expect(shell?.name).toBe('My Shell');
  });

  it('mergeBuiltins 检测到 mutated → 回写持久化', async () => {
    const store = makeMockStore();
    // 故意只给一个内置模板,触发 mergeBuiltins 补齐其他三个
    store.__setLoadResult(
      {
        version: 1,
        defaultTemplateId: 'shell',
        templates: [BUILTIN_TEMPLATES[0]!],
      },
      'main',
    );
    const mgr = new TemplatesManager(store);
    await mgr.initialize();
    const written = store.__getSet();
    expect(written).not.toBeNull();
    expect(written!.templates).toHaveLength(4);
  });

  it('persistence 损坏 → 走默认值', async () => {
    const store = makeMockStore();
    store.__setLoadResult(
      { version: 1, defaultTemplateId: 'nonexistent', templates: [] },
      'bak',
    );
    const mgr = new TemplatesManager(store);
    const src = await mgr.initialize();
    expect(src).toBe('bak');
    // defaultId 应该回退到 shell
    expect(mgr.getDefaultTemplateId()).toBe('shell');
    // 4 个内置补齐
    expect(mgr.list()).toHaveLength(4);
  });
});

describe('TemplatesManager — resolve', () => {
  it('已知 id → 返回该模板', async () => {
    const mgr = new TemplatesManager(makeMockStore());
    await mgr.initialize();
    const t = mgr.resolve('claude-code');
    expect(t.id).toBe('claude-code');
    expect(t.command).toBe('claude');
  });

  it('未知 id → 兜底到默认 (shell)', async () => {
    const mgr = new TemplatesManager(makeMockStore());
    await mgr.initialize();
    expect(mgr.resolve('nope').id).toBe('shell');
    expect(mgr.resolve(undefined).id).toBe('shell');
    expect(mgr.resolve(null).id).toBe('shell');
  });
});

describe('TemplatesManager — setDefault', () => {
  it('已知 id → 更新默认 + emit + persist', async () => {
    const mgr = new TemplatesManager(makeMockStore());
    await mgr.initialize();
    const listener = vi.fn();
    mgr.on('templatesUpdated', listener);
    mgr.setDefault('claude-code');
    expect(mgr.getDefaultTemplateId()).toBe('claude-code');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('未知 id → throw TemplateNotFound', async () => {
    const mgr = new TemplatesManager(makeMockStore());
    await mgr.initialize();
    expect(() => mgr.setDefault('nope')).toThrowError(TemplatesManagerError);
    expect(() => mgr.setDefault('nope')).toThrowError(/TemplateNotFound/);
  });

  it('设为相同 id → 不 emit', async () => {
    const mgr = new TemplatesManager(makeMockStore());
    await mgr.initialize();
    const listener = vi.fn();
    mgr.on('templatesUpdated', listener);
    mgr.setDefault('shell'); // 已经是 shell
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('TemplatesManager — list / get', () => {
  it('list 返回深拷贝,修改不影响内部', async () => {
    const mgr = new TemplatesManager(makeMockStore());
    await mgr.initialize();
    const list = mgr.list();
    list[0]!.name = 'mutated';
    expect(mgr.list()[0]!.name).not.toBe('mutated');
  });

  it('get 不存在的 id → null', async () => {
    const mgr = new TemplatesManager(makeMockStore());
    await mgr.initialize();
    expect(mgr.get('nope')).toBeNull();
  });
});
