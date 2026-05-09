/**
 * @file src/renderer/components/MainPane.tsx
 * @purpose 右侧主区域:TabBar (当前 path 下的 sessions) + 终端区
 *   (选中 session 显示 xterm,否则显示空状态新建按钮)。
 *
 * @关键设计:
 * - TabBar 仅显示当前选中 path 下的 sessions;切换 path 时会换 TabBar
 * - 空状态:选中 path 但没 session → 居中大加号 + 启动模板按钮
 * - 没选中 path → 显示欢迎页,提示从侧栏选个 path
 * - TerminalView 用 sessionId 作为 key,session 切换时强制重建 xterm 实例
 *   (避免 viewport / scroll 状态错乱)
 *
 * @对应文档章节: 软件定义书.md 6.3 (右侧标签页)、6.4 (终端区域)
 */
import { useState, type MouseEvent } from 'react';
import {
  COMMAND_CHANNELS,
  type CreateSessionResponse,
} from '@shared/protocol';
import type { SessionInfo } from '@shared/types';
import {
  getSelectedSession,
  getSessionsInSelectedPath,
  useAppDispatch,
  useAppState,
} from '../store';
import { TerminalView } from './TerminalView';

export function MainPane(): JSX.Element {
  const state = useAppState();
  const sessions = getSessionsInSelectedPath(state);
  const selectedSession = getSelectedSession(state);

  if (!state.selectedPathId) {
    return (
      <main className="main-pane">
        <WelcomeState />
      </main>
    );
  }

  return (
    <main className="main-pane">
      <TabBar sessions={sessions} selectedSessionId={state.selectedSessionId} />
      {selectedSession ? (
        <TerminalView
          // 用 sessionId 作 key,确保切换时彻底重建 xterm 实例
          key={selectedSession.id}
          session={selectedSession}
          myWindowId={state.myWindowId}
        />
      ) : (
        <EmptyPathState pathId={state.selectedPathId} />
      )}
    </main>
  );
}

function WelcomeState(): JSX.Element {
  return (
    <div className="welcome-state">
      <h2>EasyTerm</h2>
      <p>从左侧选一个路径开始,或点击 <strong>收藏 +</strong> 添加文件夹。</p>
    </div>
  );
}

function EmptyPathState({ pathId }: { pathId: string }): JSX.Element {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [creating, setCreating] = useState(false);

  const handleCreate = async (): Promise<void> => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await window.api.invoke<unknown, CreateSessionResponse>(
        COMMAND_CHANNELS.SESSION_CREATE,
        { pathId, templateId: 'shell', cols: 80, rows: 24 },
      );
      dispatch({ type: 'view/select-session', sessionId: res.session.id });
    } catch (err) {
      console.error('[MainPane] create-session failed', err);
    } finally {
      setCreating(false);
    }
  };

  // CP-2 仅 'shell' 模板;CP-3 起从 state.templates 渲染按钮列表
  const templates = state.templates;

  return (
    <div className="empty-path-state">
      <button
        type="button"
        className="empty-create-btn"
        onClick={() => void handleCreate()}
        disabled={creating}
        aria-label="在此路径新建终端"
      >
        +
      </button>
      <p className="empty-hint">在 <code>{pathId}</code> 新建终端</p>
      <div className="empty-templates">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            className="template-button"
            onClick={() => void handleCreate()}
            disabled={creating}
            title={t.name}
          >
            <span className="template-icon">{t.icon}</span>
            <span className="template-label">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface TabBarProps {
  sessions: SessionInfo[];
  selectedSessionId: string | null;
}

function TabBar({ sessions, selectedSessionId }: TabBarProps): JSX.Element {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const handleNewTab = async (): Promise<void> => {
    if (!state.selectedPathId) return;
    try {
      const res = await window.api.invoke<unknown, CreateSessionResponse>(
        COMMAND_CHANNELS.SESSION_CREATE,
        {
          pathId: state.selectedPathId,
          templateId: 'shell',
          cols: 80,
          rows: 24,
        },
      );
      dispatch({ type: 'view/select-session', sessionId: res.session.id });
    } catch (err) {
      console.error('[TabBar] new tab failed', err);
    }
  };

  // 本窗口持有的 tab 在左,其他窗口持有的灰显在右 (软件定义书 6.3.1)
  const myTabs = sessions.filter((s) => s.ownerWindowId === state.myWindowId);
  const ownedByOtherTabs = sessions.filter(
    (s) => s.ownerWindowId && s.ownerWindowId !== state.myWindowId,
  );
  const orphanTabs = sessions.filter((s) => s.ownerWindowId === null);

  return (
    <div className="tab-bar">
      <div className="tab-list">
        {myTabs.map((s) => (
          <Tab key={s.id} session={s} selected={s.id === selectedSessionId} />
        ))}
        {orphanTabs.map((s) => (
          <Tab key={s.id} session={s} selected={s.id === selectedSessionId} variant="orphan" />
        ))}
        {ownedByOtherTabs.map((s) => (
          <Tab key={s.id} session={s} selected={false} variant="other" />
        ))}
      </div>
      <button
        type="button"
        className="tab-new-btn"
        onClick={() => void handleNewTab()}
        title="新建终端"
      >
        +
      </button>
    </div>
  );
}

interface TabProps {
  session: SessionInfo;
  selected: boolean;
  variant?: 'orphan' | 'other';
}

function Tab({ session, selected, variant }: TabProps): JSX.Element {
  const dispatch = useAppDispatch();

  const handleClick = async (e: MouseEvent<HTMLButtonElement>): Promise<void> => {
    e.preventDefault();
    if (variant === 'other') {
      try {
        await window.api.invoke(COMMAND_CHANNELS.SESSION_FOCUS_OWNER, {
          sessionId: session.id,
        });
      } catch (err) {
        console.error('[Tab] focus-owner failed', err);
      }
      return;
    }
    if (variant === 'orphan') {
      try {
        await window.api.invoke(COMMAND_CHANNELS.SESSION_CLAIM, {
          sessionId: session.id,
        });
      } catch (err) {
        console.error('[Tab] claim failed', err);
        return;
      }
    }
    dispatch({ type: 'view/select-session', sessionId: session.id });
  };

  const handleClose = async (e: MouseEvent<HTMLSpanElement>): Promise<void> => {
    e.stopPropagation();
    try {
      await window.api.invoke(COMMAND_CHANNELS.SESSION_CLOSE, {
        sessionId: session.id,
      });
    } catch (err) {
      console.error('[Tab] close failed', err);
    }
  };

  return (
    <button
      type="button"
      className={`tab${selected ? ' selected' : ''}${
        variant === 'other' ? ' owned-by-other' : ''
      }${variant === 'orphan' ? ' orphan' : ''}`}
      onClick={(e) => void handleClick(e)}
      title={
        variant === 'other'
          ? `${session.displayName} (在其他窗口)`
          : session.displayName
      }
    >
      <span className="tab-name">{session.displayName}</span>
      {variant !== 'other' && (
        <span
          className="tab-close"
          onClick={(e) => void handleClose(e)}
          title="关闭"
        >
          ×
        </span>
      )}
    </button>
  );
}
