/**
 * @file src/renderer/App.tsx
 * @purpose 应用根组件:handshake 协议 → AppStateProvider → useIpcSync 拉
 *   snapshot + 订阅事件 → 渲染 Sidebar + MainPane 主布局。
 *
 * @对应文档章节: 软件定义书.md 6.1 (整体布局);ipc-protocol.md 第 4 章 handshake
 */
import { useEffect, useState } from 'react';
import { COMMAND_CHANNELS, PROTOCOL_VERSION } from '@shared/protocol';
import type { ThemeId } from '@shared/types';
import { AppStateProvider, useAppState, useIpcSync } from './store';
import { Sidebar } from './components/Sidebar';
import { MainPane } from './components/MainPane';

const THEME_CYCLE: ThemeId[] = [
  'rose-pine',
  'rose-pine-dawn',
  'rose-pine-moon',
  'cutie',
  'business',
  'ubuntu',
  'windows-terminal',
];

type HandshakeState =
  | { status: 'pending' }
  | { status: 'ok'; buildVersion: string }
  | { status: 'mismatch'; mainVersion: number; rendererVersion: number }
  | { status: 'error'; message: string };

export function App(): JSX.Element {
  const [handshake, setHandshake] = useState<HandshakeState>({ status: 'pending' });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.api) {
      setHandshake({
        status: 'error',
        message: 'window.api 不存在 — preload 脚本未正确加载。',
      });
      return;
    }
    window.api
      .getProtocolVersion()
      .then(({ protocolVersion, buildVersion }) => {
        if (protocolVersion !== PROTOCOL_VERSION) {
          setHandshake({
            status: 'mismatch',
            mainVersion: protocolVersion,
            rendererVersion: PROTOCOL_VERSION,
          });
          return;
        }
        setHandshake({ status: 'ok', buildVersion });
      })
      .catch((err: unknown) => {
        setHandshake({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }, []);

  if (handshake.status === 'pending') {
    return <FullPagePlaceholder title="EasyTerm" subtitle="正在握手…" />;
  }

  if (handshake.status === 'mismatch') {
    return (
      <FullPagePlaceholder
        title="EasyTerm"
        subtitle="协议版本不匹配"
        body={`主进程协议版本 ${handshake.mainVersion},渲染端 ${handshake.rendererVersion}。请重启应用或重装。`}
        variant="error"
      />
    );
  }

  if (handshake.status === 'error') {
    return (
      <FullPagePlaceholder
        title="EasyTerm"
        subtitle="启动失败"
        body={handshake.message}
        variant="error"
      />
    );
  }

  // handshake OK
  return (
    <AppStateProvider
      myWindowId={window.api.windowId}
      myWindowNumber={window.api.windowNumber}
    >
      <ConnectedShell buildVersion={handshake.buildVersion} />
    </AppStateProvider>
  );
}

function ConnectedShell({ buildVersion }: { buildVersion: string }): JSX.Element {
  const sync = useIpcSync();
  const state = useAppState();

  if (sync.error) {
    return (
      <FullPagePlaceholder
        title="EasyTerm"
        subtitle="加载 snapshot 失败"
        body={sync.error}
        variant="error"
      />
    );
  }

  if (!sync.ready) {
    return <FullPagePlaceholder title="EasyTerm" subtitle="加载状态…" />;
  }

  const currentTheme = state.settings.appearance?.theme ?? 'rose-pine';

  const cycleTheme = (): void => {
    const idx = THEME_CYCLE.indexOf(currentTheme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]!;
    window.api
      .invoke(COMMAND_CHANNELS.SETTINGS_UPDATE, {
        partial: { appearance: { theme: next } },
      })
      .catch((err) => console.error('[App] theme cycle failed', err));
  };

  return (
    <div className="app-root with-shell" data-theme={currentTheme}>
      <header className="app-header">
        <span className="app-title">EasyTerm</span>
        <span className="app-window-badge">Window {state.myWindowNumber || '?'}</span>
        <button
          type="button"
          className="theme-cycle-btn"
          onClick={cycleTheme}
          title="切换主题 (CP-2 演示跨窗口同步;颜色实际应用在 CP-4 接入)"
        >
          🎨 {currentTheme}
        </button>
        <span className="app-version">v{buildVersion}</span>
      </header>
      <div className="app-body">
        <Sidebar />
        <MainPane />
      </div>
    </div>
  );
}

function FullPagePlaceholder({
  title,
  subtitle,
  body,
  variant,
}: {
  title: string;
  subtitle: string;
  body?: string;
  variant?: 'error';
}): JSX.Element {
  return (
    <div className="app-root">
      <div className={`bootstrap-placeholder${variant === 'error' ? ' error' : ''}`}>
        <h1>{title}</h1>
        <p className="subtitle">{subtitle}</p>
        {body && <pre className="error-pre">{body}</pre>}
      </div>
    </div>
  );
}
