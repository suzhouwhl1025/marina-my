/**
 * @file src/renderer/components/SettingsView.tsx
 * @purpose CP-4 设置页面 — view 形态 (替换整个 body),左侧 7 分类导航 +
 *   右侧详情面板,所有设置项即改即生效 (无保存按钮,软件定义书 6.6.1)。
 *
 * @关键设计:
 * - 不是 modal,不是新窗口,而是替换 app body 的 view (用户决策对齐)
 * - 任一窗口里的设置 UI 完全相同;改一处 → main 广播 → 所有窗口同步
 * - 校验失败由 main 端 SettingsManager 抛 InvalidSettings,renderer 显示
 *   错误 toast 但不阻止用户继续输入 (input 内部状态 = main 实际值)
 * - 7 分类按软件定义书 6.6.2 分组:外观 / Shell 与启动 / 行为 / 数据 /
 *   系统集成 / 高级 / 关于
 *
 * @CP-4 chunk 1 范围:
 * - 整个 view 骨架 + 7 分类导航 + × 关闭按钮
 * - 外观分类的"主题"设置项接通 (作为管道验证)
 * - 其它分类只放 placeholder,chunk 2 起逐步接线
 *
 * @对应文档章节: 软件定义书.md 6.6 节 (设置页面)
 */
import { useCallback, useState, type ReactNode } from 'react';
import { COMMAND_CHANNELS } from '@shared/protocol';
import type { ThemeId } from '@shared/types';
import { useAppDispatch, useAppState } from '../store';

type CategoryId =
  | 'appearance'
  | 'shell'
  | 'behavior'
  | 'data'
  | 'system-integration'
  | 'advanced'
  | 'about';

interface CategoryDef {
  id: CategoryId;
  icon: string;
  title: string;
}

const CATEGORIES: CategoryDef[] = [
  { id: 'appearance', icon: '🎨', title: '外观' },
  { id: 'shell', icon: '🖥️', title: 'Shell 与启动' },
  { id: 'behavior', icon: '🚪', title: '行为' },
  { id: 'data', icon: '💾', title: '数据' },
  { id: 'system-integration', icon: '🔗', title: '系统集成' },
  { id: 'advanced', icon: '🔧', title: '高级' },
  { id: 'about', icon: 'ℹ️', title: '关于' },
];

export function SettingsView(): JSX.Element {
  const dispatch = useAppDispatch();
  const [active, setActive] = useState<CategoryId>('appearance');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    dispatch({ type: 'view/exit-settings' });
  }, [dispatch]);

  return (
    <div className="settings-view">
      <header className="settings-header">
        <button
          type="button"
          className="settings-close"
          onClick={handleClose}
          title="关闭设置"
          aria-label="关闭设置"
        >
          ×
        </button>
        <h1 className="settings-title">设置</h1>
        {errorMsg && (
          <span className="settings-error" role="alert">
            ⚠ {errorMsg}
          </span>
        )}
      </header>
      <div className="settings-body">
        <nav className="settings-nav" aria-label="设置分类">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`settings-nav-item${active === c.id ? ' active' : ''}`}
              onClick={() => setActive(c.id)}
            >
              <span className="settings-nav-icon" aria-hidden="true">
                {c.icon}
              </span>
              <span className="settings-nav-label">{c.title}</span>
            </button>
          ))}
        </nav>
        <main className="settings-detail">
          <CategoryPanel categoryId={active} setError={setErrorMsg} />
        </main>
      </div>
    </div>
  );
}

interface CategoryPanelProps {
  categoryId: CategoryId;
  setError: (msg: string | null) => void;
}

function CategoryPanel({ categoryId, setError }: CategoryPanelProps): JSX.Element {
  switch (categoryId) {
    case 'appearance':
      return <AppearancePanel setError={setError} />;
    case 'shell':
      return <PlaceholderPanel title="Shell 与启动" hint="chunk 2 接线" />;
    case 'behavior':
      return <PlaceholderPanel title="行为" hint="chunk 2 接线" />;
    case 'data':
      return <PlaceholderPanel title="数据" hint="chunk 4 接入导入/导出" />;
    case 'system-integration':
      return <PlaceholderPanel title="系统集成" hint="V1.2 启用" />;
    case 'advanced':
      return <PlaceholderPanel title="高级" hint="chunk 2 接线" />;
    case 'about':
      return <PlaceholderPanel title="关于" hint="chunk 5 接入构建信息" />;
    default:
      return <></>;
  }
}

function PlaceholderPanel({
  title,
  hint,
}: {
  title: string;
  hint: string;
}): JSX.Element {
  return (
    <section className="settings-panel">
      <h2 className="settings-panel-title">{title}</h2>
      <p className="settings-placeholder">⏳ {hint}</p>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// 外观分类 (chunk 1 仅"主题",chunk 2 补字体/字号/行高/UI 缩放等)
// ──────────────────────────────────────────────────────────────────

const THEMES: Array<{ id: ThemeId; label: string; tone: string }> = [
  { id: 'rose-pine', label: 'Rose Pine', tone: '深色 · 默认' },
  { id: 'rose-pine-dawn', label: 'Rose Pine Dawn', tone: '浅色' },
  { id: 'rose-pine-moon', label: 'Rose Pine Moon', tone: '深色变体' },
  { id: 'cutie', label: 'Cutie', tone: '粉紫' },
  { id: 'business', label: 'Business', tone: '商务蓝灰' },
  { id: 'ubuntu', label: 'Ubuntu', tone: '经典棕紫' },
  { id: 'windows-terminal', label: 'Windows Terminal', tone: 'Campbell 配色' },
];

function AppearancePanel({
  setError,
}: {
  setError: (msg: string | null) => void;
}): JSX.Element {
  const state = useAppState();
  const theme = state.settings.appearance?.theme ?? 'rose-pine';

  const updateTheme = (next: ThemeId): void => {
    setError(null);
    window.api
      .invoke(COMMAND_CHANNELS.SETTINGS_UPDATE, {
        partial: { appearance: { theme: next } },
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`主题切换失败:${msg}`);
      });
  };

  return (
    <section className="settings-panel">
      <h2 className="settings-panel-title">外观</h2>

      <SettingRow
        label="主题"
        hint="所有窗口立即同步;xterm 颜色与 UI 同步切换"
      >
        <div className="settings-theme-grid">
          {THEMES.map((t) => (
            <label
              key={t.id}
              className={`settings-theme-card${theme === t.id ? ' selected' : ''}`}
              data-theme={t.id}
            >
              <input
                type="radio"
                name="theme"
                value={t.id}
                checked={theme === t.id}
                onChange={() => updateTheme(t.id)}
              />
              <span className="settings-theme-swatch" aria-hidden="true">
                <span className="swatch-base" />
                <span className="swatch-iris" />
                <span className="swatch-pine" />
                <span className="swatch-gold" />
                <span className="swatch-love" />
              </span>
              <span className="settings-theme-name">{t.label}</span>
              <span className="settings-theme-tone">{t.tone}</span>
            </label>
          ))}
        </div>
      </SettingRow>

      <SettingRow
        label="字体 / 字号 / UI 缩放"
        hint="chunk 2 接线"
      >
        <span className="settings-placeholder">⏳ 即将提供</span>
      </SettingRow>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// 通用行 (label + hint + control)
// ──────────────────────────────────────────────────────────────────

export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="settings-row">
      <div className="settings-row-meta">
        <div className="settings-row-label">{label}</div>
        {hint && <div className="settings-row-hint">{hint}</div>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}
