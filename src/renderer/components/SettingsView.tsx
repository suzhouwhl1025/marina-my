/**
 * @file src/renderer/components/SettingsView.tsx
 * @purpose CP-4 设置页面 — view 形态 (替换整个 body),左侧 7 分类导航 +
 *   右侧详情面板,所有设置项即改即生效 (无保存按钮,软件定义书 6.6.1)。
 *
 * @关键设计:
 * - 不是 modal,不是新窗口,而是替换 app body 的 view (用户决策对齐)
 * - 任一窗口里的设置 UI 完全相同;改一处 → main 广播 → 所有窗口同步
 * - 校验失败由 main 端 SettingsManager 抛 InvalidSettings,renderer 显示
 *   错误条但不阻止用户继续输入 (input 内部状态 = main 实际值)
 * - 7 分类按软件定义书 6.6.2 分组:外观 / Shell 与启动 / 行为 / 数据 /
 *   系统集成 / 高级 / 关于
 *
 * @CP-4 chunk 范围:
 * - chunk 1: 骨架 + 主题
 * - chunk 2 (本): 外观/Shell/行为/高级 全部接通;数据/系统集成 留 placeholder;
 *   关于留 placeholder (chunk 5 接构建信息 + 链接)
 * - chunk 4: 数据导入/导出 (data 分类) + 启动模板管理子页 (shell 分类内)
 * - chunk 5: 关于 + 构建信息
 *
 * @对应文档章节: 软件定义书.md 6.6 节 (设置页面)
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { COMMAND_CHANNELS, type ListShellsResponse } from '@shared/protocol';
import type {
  NewTerminalShellPolicy,
  StartupBehavior,
  TerminalRightClick,
  ThemeId,
} from '@shared/types';
import type { DeepPartial } from '@shared/types-helpers';
import type { Settings } from '@shared/types';
import { useAppDispatch, useAppState } from '../store';
import {
  TERMINAL_FONT_WHITELIST,
  UI_FONT_WHITELIST,
  probeFonts,
} from './font-detection';

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

// 把 settings update 走 IPC 的副作用集中,所有控件都用这个
async function updateSettings(
  partial: DeepPartial<Settings>,
  setError: (msg: string | null) => void,
): Promise<void> {
  setError(null);
  try {
    await window.api.invoke(COMMAND_CHANNELS.SETTINGS_UPDATE, { partial });
  } catch (err: unknown) {
    setError(err instanceof Error ? err.message : String(err));
  }
}

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
      return <ShellPanel setError={setError} />;
    case 'behavior':
      return <BehaviorPanel setError={setError} />;
    case 'data':
      return <DataPanel setError={setError} />;
    case 'system-integration':
      return <SystemIntegrationPanel />;
    case 'advanced':
      return <AdvancedPanel setError={setError} />;
    case 'about':
      return <AboutPanel />;
    default:
      return <></>;
  }
}

// ──────────────────────────────────────────────────────────────────
// 外观分类
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
  const a = state.settings.appearance;
  const theme = a?.theme ?? 'rose-pine';
  const followSystemTheme = a?.followSystemTheme ?? false;
  const terminalFontFamily = a?.terminalFontFamily ?? '';
  const terminalFontSize = a?.terminalFontSize ?? 13;
  const terminalLineHeight = a?.terminalLineHeight ?? 1.2;
  const uiFontFamily = a?.uiFontFamily ?? '';
  const uiZoom = a?.uiZoom ?? 1;

  const terminalFonts = useMemo(() => probeFonts(TERMINAL_FONT_WHITELIST), []);
  const uiFonts = useMemo(() => probeFonts(UI_FONT_WHITELIST), []);

  return (
    <section className="settings-panel">
      <h2 className="settings-panel-title">外观</h2>

      <SettingRow
        label="主题"
        hint={
          followSystemTheme
            ? '已开启"跟随系统主题",手动切换会被系统覆盖'
            : '所有窗口立即同步;xterm 颜色与 UI 同步切换'
        }
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
                onChange={() =>
                  void updateSettings({ appearance: { theme: t.id } }, setError)
                }
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
        label="跟随系统主题"
        hint="开启后系统切换深 / 浅色时自动切对应主题(深色用 Rose Pine,浅色用 Rose Pine Dawn)"
      >
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={followSystemTheme}
            onChange={(e) =>
              void updateSettings(
                { appearance: { followSystemTheme: e.target.checked } },
                setError,
              )
            }
          />
          <span>跟随系统</span>
        </label>
      </SettingRow>

      <SettingRow label="终端字体" hint="探测的等宽字体白名单 + 自定义">
        <FontPicker
          value={terminalFontFamily}
          fonts={terminalFonts}
          onChange={(value) =>
            void updateSettings(
              { appearance: { terminalFontFamily: value } },
              setError,
            )
          }
        />
      </SettingRow>

      <SettingRow label="终端字号" hint="范围 8 - 24">
        <NumberInput
          value={terminalFontSize}
          min={8}
          max={24}
          step={1}
          onChange={(v) =>
            void updateSettings({ appearance: { terminalFontSize: v } }, setError)
          }
        />
      </SettingRow>

      <SettingRow label="终端行高" hint="范围 1.0 - 2.0">
        <NumberInput
          value={terminalLineHeight}
          min={1}
          max={2}
          step={0.05}
          onChange={(v) =>
            void updateSettings({ appearance: { terminalLineHeight: v } }, setError)
          }
        />
      </SettingRow>

      <SettingRow label="UI 字体" hint="侧栏 / 按钮 / 标签等 UI 区域">
        <FontPicker
          value={uiFontFamily}
          fonts={uiFonts}
          onChange={(value) =>
            void updateSettings({ appearance: { uiFontFamily: value } }, setError)
          }
        />
      </SettingRow>

      <SettingRow label="UI 缩放" hint="范围 75% - 150%,影响整个 UI 字号">
        <NumberInput
          value={uiZoom}
          min={0.75}
          max={1.5}
          step={0.05}
          formatPercent
          onChange={(v) =>
            void updateSettings({ appearance: { uiZoom: v } }, setError)
          }
        />
      </SettingRow>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// Shell 与启动分类
// ──────────────────────────────────────────────────────────────────

function ShellPanel({
  setError,
}: {
  setError: (msg: string | null) => void;
}): JSX.Element {
  const state = useAppState();
  const sh = state.settings.shell;
  const defaultShellId = sh?.defaultShellId ?? '';
  const policy = sh?.newTerminalShellPolicy ?? 'default';

  const [shells, setShells] = useState<
    Array<{ id: string; displayName: string; executablePath: string }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    window.api
      .invoke<unknown, ListShellsResponse>(
        COMMAND_CHANNELS.SETTINGS_LIST_SHELLS,
        {},
      )
      .then((res) => {
        if (!cancelled) setShells(res.shells);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`枚举可用 shell 失败:${msg}`);
      });
    return () => {
      cancelled = true;
    };
  }, [setError]);

  return (
    <section className="settings-panel">
      <h2 className="settings-panel-title">Shell 与启动</h2>

      <SettingRow label="默认 shell" hint="新终端启动时使用的 shell">
        <select
          className="settings-input"
          value={defaultShellId}
          onChange={(e) =>
            void updateSettings(
              { shell: { defaultShellId: e.target.value } },
              setError,
            )
          }
        >
          <option value="">自动检测最优(pwsh &gt; powershell &gt; cmd)</option>
          {shells.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName} — {s.executablePath}
            </option>
          ))}
        </select>
      </SettingRow>

      <SettingRow
        label="新终端使用的 shell"
        hint='"默认 shell"或"上次用过的 shell"'
      >
        <div className="settings-radio-group">
          <label className="settings-radio">
            <input
              type="radio"
              name="shell-policy"
              value="default"
              checked={policy === 'default'}
              onChange={() =>
                void updateSettings(
                  {
                    shell: {
                      newTerminalShellPolicy: 'default' as NewTerminalShellPolicy,
                    },
                  },
                  setError,
                )
              }
            />
            使用默认 shell
          </label>
          <label className="settings-radio">
            <input
              type="radio"
              name="shell-policy"
              value="last-used"
              checked={policy === 'last-used'}
              onChange={() =>
                void updateSettings(
                  {
                    shell: {
                      newTerminalShellPolicy: 'last-used' as NewTerminalShellPolicy,
                    },
                  },
                  setError,
                )
              }
            />
            使用上次用过的 shell
          </label>
        </div>
      </SettingRow>

      <SettingRow label="启动模板管理" hint="增删改自定义模板">
        <span className="settings-placeholder">⏳ chunk 4 接入</span>
      </SettingRow>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// 行为分类
// ──────────────────────────────────────────────────────────────────

function BehaviorPanel({
  setError,
}: {
  setError: (msg: string | null) => void;
}): JSX.Element {
  const state = useAppState();
  const b = state.settings.behavior;
  const startupBehavior = b?.startupBehavior ?? 'open-window';
  const autoStart = b?.autoStart ?? false;
  const confirmOnQuit = b?.confirmOnQuit ?? true;
  const selectOnCopy = b?.selectOnCopy ?? true;
  const terminalRightClick = b?.terminalRightClick ?? 'menu';

  return (
    <section className="settings-panel">
      <h2 className="settings-panel-title">行为</h2>

      <SettingRow label="启动时行为" hint="配开机启动用">
        <div className="settings-radio-group">
          <label className="settings-radio">
            <input
              type="radio"
              name="startup"
              value="open-window"
              checked={startupBehavior === 'open-window'}
              onChange={() =>
                void updateSettings(
                  {
                    behavior: {
                      startupBehavior: 'open-window' as StartupBehavior,
                    },
                  },
                  setError,
                )
              }
            />
            打开一个窗口
          </label>
          <label className="settings-radio">
            <input
              type="radio"
              name="startup"
              value="tray-only"
              checked={startupBehavior === 'tray-only'}
              onChange={() =>
                void updateSettings(
                  {
                    behavior: {
                      startupBehavior: 'tray-only' as StartupBehavior,
                    },
                  },
                  setError,
                )
              }
            />
            仅启动到托盘
          </label>
        </div>
      </SettingRow>

      <SettingRow
        label="开机启动"
        hint="Windows 启动时自动启动 EasyTerm(写 Run 注册表)"
      >
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={autoStart}
            onChange={(e) =>
              void updateSettings(
                { behavior: { autoStart: e.target.checked } },
                setError,
              )
            }
          />
          <span>开机启动</span>
        </label>
      </SettingRow>

      <SettingRow
        label="完全退出前确认"
        hint='托盘点"完全退出"且有 session 在跑时弹确认。关单窗口永远不弹'
      >
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={confirmOnQuit}
            onChange={(e) =>
              void updateSettings(
                { behavior: { confirmOnQuit: e.target.checked } },
                setError,
              )
            }
          />
          <span>启用</span>
        </label>
      </SettingRow>

      <SettingRow label="选中即复制" hint="终端选中文本自动复制(类 Linux)">
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={selectOnCopy}
            onChange={(e) =>
              void updateSettings(
                { behavior: { selectOnCopy: e.target.checked } },
                setError,
              )
            }
          />
          <span>启用</span>
        </label>
      </SettingRow>

      <SettingRow label="终端右键行为" hint="弹菜单 或 直接粘贴">
        <div className="settings-radio-group">
          <label className="settings-radio">
            <input
              type="radio"
              name="rclick"
              value="menu"
              checked={terminalRightClick === 'menu'}
              onChange={() =>
                void updateSettings(
                  {
                    behavior: {
                      terminalRightClick: 'menu' as TerminalRightClick,
                    },
                  },
                  setError,
                )
              }
            />
            弹菜单
          </label>
          <label className="settings-radio">
            <input
              type="radio"
              name="rclick"
              value="paste"
              checked={terminalRightClick === 'paste'}
              onChange={() =>
                void updateSettings(
                  {
                    behavior: {
                      terminalRightClick: 'paste' as TerminalRightClick,
                    },
                  },
                  setError,
                )
              }
            />
            直接粘贴
          </label>
        </div>
      </SettingRow>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// 数据分类 (chunk 4 完整接通,chunk 2 仅 "打开数据目录")
// ──────────────────────────────────────────────────────────────────

function DataPanel({
  setError,
}: {
  setError: (msg: string | null) => void;
}): JSX.Element {
  const handleOpenDataDir = (): void => {
    setError(null);
    window.api
      .invoke(COMMAND_CHANNELS.SYSTEM_OPEN_DATA_DIR, {})
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  };

  return (
    <section className="settings-panel">
      <h2 className="settings-panel-title">数据</h2>

      <SettingRow label="数据目录" hint="所有 EasyTerm 配置文件存放处">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="settings-info-text">%APPDATA%\EasyTerm</span>
          <button type="button" className="settings-button" onClick={handleOpenDataDir}>
            在 Explorer 中打开
          </button>
        </div>
      </SettingRow>

      <SettingRow label="导出设置" hint="把全部 JSON 配置导出为 zip 文件">
        <span className="settings-placeholder">⏳ chunk 4 接入</span>
      </SettingRow>

      <SettingRow label="导入设置" hint="选择 zip 文件导入,会询问是否覆盖">
        <span className="settings-placeholder">⏳ chunk 4 接入</span>
      </SettingRow>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// 系统集成分类 (V1.2 启用,V1 显示但置灰)
// ──────────────────────────────────────────────────────────────────

function SystemIntegrationPanel(): JSX.Element {
  return (
    <section className="settings-panel">
      <h2 className="settings-panel-title">系统集成</h2>

      <SettingRow
        label="Explorer 右键集成"
        hint='"在 EasyTerm 中打开此文件夹"(V1.2 启用,V1 占位)'
      >
        <label className="settings-checkbox">
          <input type="checkbox" disabled checked={false} readOnly />
          <span>启用(V1.2 才真正生效)</span>
        </label>
      </SettingRow>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// 高级分类
// ──────────────────────────────────────────────────────────────────

function AdvancedPanel({
  setError,
}: {
  setError: (msg: string | null) => void;
}): JSX.Element {
  const state = useAppState();
  const adv = state.settings.advanced;
  const logLevel = adv?.logLevel ?? 'INFO';

  const [confirmingReset, setConfirmingReset] = useState(false);

  const handleOpenLogs = (): void => {
    setError(null);
    window.api
      .invoke(COMMAND_CHANNELS.SYSTEM_OPEN_LOGS_DIR, {})
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  };

  const handleReset = (): void => {
    setError(null);
    window.api
      .invoke(COMMAND_CHANNELS.SETTINGS_RESET, {})
      .then(() => {
        setConfirmingReset(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  };

  return (
    <section className="settings-panel">
      <h2 className="settings-panel-title">高级</h2>

      <SettingRow label="日志级别" hint="DEBUG 会记录所有 IPC 与 PTY 字节(性能影响)">
        <div className="settings-radio-group">
          <label className="settings-radio">
            <input
              type="radio"
              name="loglevel"
              value="INFO"
              checked={logLevel === 'INFO'}
              onChange={() =>
                void updateSettings(
                  { advanced: { logLevel: 'INFO' } },
                  setError,
                )
              }
            />
            INFO
          </label>
          <label className="settings-radio">
            <input
              type="radio"
              name="loglevel"
              value="DEBUG"
              checked={logLevel === 'DEBUG'}
              onChange={() =>
                void updateSettings(
                  { advanced: { logLevel: 'DEBUG' } },
                  setError,
                )
              }
            />
            DEBUG
          </label>
        </div>
      </SettingRow>

      <SettingRow label="日志目录" hint="%APPDATA%\EasyTerm\logs">
        <button type="button" className="settings-button" onClick={handleOpenLogs}>
          打开日志目录
        </button>
      </SettingRow>

      <SettingRow
        label="重置所有设置"
        hint="把所有设置回到出厂默认。收藏 / 模板 / 最近不受影响"
      >
        {!confirmingReset ? (
          <button
            type="button"
            className="settings-button danger"
            onClick={() => setConfirmingReset(true)}
          >
            重置…
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ color: 'var(--love, #f0f)', fontSize: 12 }}>
              确认重置?
            </span>
            <button
              type="button"
              className="settings-button danger"
              onClick={handleReset}
            >
              确认
            </button>
            <button
              type="button"
              className="settings-button"
              onClick={() => setConfirmingReset(false)}
            >
              取消
            </button>
          </div>
        )}
      </SettingRow>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// 关于分类 (chunk 5 接入完整版)
// ──────────────────────────────────────────────────────────────────

function AboutPanel(): JSX.Element {
  return (
    <section className="settings-panel">
      <h2 className="settings-panel-title">关于</h2>
      <p className="settings-placeholder">⏳ chunk 5 接入版本号 / 构建信息 / 检查更新 / 致谢</p>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// 通用控件
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

interface NumberInputProps {
  value: number;
  min: number;
  max: number;
  step: number;
  /** 显示成 100% 而不是 1 (UI 缩放用) */
  formatPercent?: boolean;
  onChange: (v: number) => void;
}

function NumberInput({
  value,
  min,
  max,
  step,
  formatPercent,
  onChange,
}: NumberInputProps): JSX.Element {
  // 内部 string state 让用户能输入"1.2" → 不被立即截成 1
  const [text, setText] = useState<string>(
    formatPercent ? `${Math.round(value * 100)}` : `${value}`,
  );

  // value (来自 main 广播) 变化时同步内部 text — 只在不聚焦时同步,
  // 否则用户正在输入会被覆盖。简化:每次都同步,行为略糙但 V1 可接受。
  useEffect(() => {
    setText(formatPercent ? `${Math.round(value * 100)}` : `${value}`);
  }, [value, formatPercent]);

  const commit = (): void => {
    const raw = parseFloat(text);
    if (!Number.isFinite(raw)) return;
    const v = formatPercent ? raw / 100 : raw;
    if (v < min || v > max) {
      // 越界回退显示
      setText(formatPercent ? `${Math.round(value * 100)}` : `${value}`);
      return;
    }
    if (v === value) return;
    onChange(v);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setText(e.target.value);
  };

  const handleBlur = (): void => commit();

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <input
        type="number"
        className="settings-input numeric"
        value={text}
        min={formatPercent ? min * 100 : min}
        max={formatPercent ? max * 100 : max}
        step={formatPercent ? Math.round(step * 100) : step}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {formatPercent && <span style={{ color: 'var(--subtle, #f0f)' }}>%</span>}
    </span>
  );
}

interface FontPickerProps {
  value: string;
  fonts: Array<{ family: string; installed: boolean }>;
  onChange: (value: string) => void;
}

/**
 * 字体下拉:白名单中已装的字体 + "自定义" 选项 (打开输入框)。
 */
function FontPicker({ value, fonts, onChange }: FontPickerProps): JSX.Element {
  // value 是 CSS font-family 字符串 (可能包含多个 fallback);提取首个值用作 select 的 value
  const firstFamily = useMemo(() => extractFirstFontFamily(value), [value]);
  const knownFamily = fonts.find((f) => f.family === firstFamily);
  const [isCustom, setIsCustom] = useState<boolean>(!knownFamily);
  const [customText, setCustomText] = useState<string>(value);

  useEffect(() => {
    setCustomText(value);
    setIsCustom(!fonts.find((f) => f.family === extractFirstFontFamily(value)));
  }, [value, fonts]);

  if (isCustom) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <input
          type="text"
          className="settings-input"
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          onBlur={() => onChange(customText)}
          placeholder="例如 'My Font', monospace"
        />
        <button
          type="button"
          className="settings-button"
          onClick={() => setIsCustom(false)}
        >
          切回下拉
        </button>
      </span>
    );
  }

  return (
    <select
      className="settings-input"
      value={firstFamily}
      onChange={(e) => {
        if (e.target.value === '__custom__') {
          setIsCustom(true);
          return;
        }
        onChange(e.target.value);
      }}
    >
      {fonts.map((f) => (
        <option
          key={f.family}
          value={f.family}
          style={{ fontFamily: `"${f.family}", monospace` }}
        >
          {f.family}
          {f.installed ? '' : ' (未装)'}
        </option>
      ))}
      <option value="__custom__">— 自定义 —</option>
    </select>
  );
}

function extractFirstFontFamily(cssFontFamily: string): string {
  // 取逗号前第一个 token,去引号
  const first = (cssFontFamily.split(',')[0] ?? '').trim();
  return first.replace(/^['"]|['"]$/g, '');
}
