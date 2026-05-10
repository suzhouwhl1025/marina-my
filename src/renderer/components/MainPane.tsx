/**
 * @file src/renderer/components/MainPane.tsx
 * @purpose 右侧主区域:TabBar (当前 path 下的 sessions) + 终端区
 *   (本窗口持有的 session 显示 xterm,否则显示新建终端页面)。
 *
 * @关键设计 (CP-2 勘误后):
 * - "持有 = 显示" 不变量:TerminalView 只在 displayableSession (即 selected
 *   且 owner=myWindow 的) 不为 null 时挂载。selected 但 owner != myWindow
 *   (orphan / 他人持有) 时显示 EmptyPathState 新建终端页 — 没有"接管会话"
 *   占位 UI (用户勘误反思 #3)
 * - TabBar 顺序稳定:本窗口持有的 + orphan 按 path 下 sessions 的原始顺序
 *   排列;只把"其他窗口持有"的单独抽到最右端灰显 (用户勘误 #1)
 *   Tab 自己根据 session.ownerWindowId 决定 variant
 * - SESSION_CREATE 调用统一从 state.lastTerminalDims 读 cols/rows,避免
 *   spawn 80×24 然后 resize 到 142×42 触发的 ConPTY 重画 PowerShell 横幅
 *   (用户勘误 #2)
 * - main-pane 容器挂 ResizeObserver,持续把粗估的 cols/rows 写进 store
 *   (字号 × 0.6 估字宽,字号 × lineHeight 估行高);TerminalView 第一次
 *   xterm fit 后会用真实值覆盖
 *
 * @对应文档章节: 软件定义书.md 6.3 (右侧标签页)、6.4 (终端区域)
 */
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  COMMAND_CHANNELS,
  type CreateSessionResponse,
} from '@shared/protocol';
import type { SessionInfo } from '@shared/types';
import {
  findMyOwnedSessionId,
  getDisplayableSession,
  getSessionsInSelectedPath,
  useAppDispatch,
  useAppState,
} from '../store';
import { TerminalView } from './TerminalView';

export function MainPane(): JSX.Element {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const sessions = getSessionsInSelectedPath(state);
  const displayable = getDisplayableSession(state);

  const containerRef = useRef<HTMLElement | null>(null);
  const fontSize = state.settings.appearance?.terminalFontSize ?? 13;
  const lineHeight = state.settings.appearance?.terminalLineHeight ?? 1.2;

  // ResizeObserver:把主区容器尺寸 + 字号 → 估算 cols/rows → 写入 store。
  // SESSION_CREATE 调用点统一读 store.lastTerminalDims,确保 spawn PTY 时
  // 尺寸接近 xterm fit 后的值,避免 ConPTY 重画 banner 重复进 ring buffer。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const update = (): void => {
      // monospace 字宽 ≈ 字号 × 0.6;cell 高 = 字号 × lineHeight。
      // 这是粗估 (xterm 真实算法考虑 letterSpacing 等),首次创建时差几列
      // 不致命;TerminalView 一旦 mount 会用 fit 后的精确值覆盖。
      const charWidth = fontSize * 0.6;
      const cellHeight = fontSize * lineHeight;
      // 主区扣掉 statusbar (约 24px) 和 padding (8px*2),保留有效区域
      const usableW = Math.max(0, el.clientWidth - 16);
      const usableH = Math.max(0, el.clientHeight - 56);
      const cols = Math.max(20, Math.floor(usableW / charWidth));
      const rows = Math.max(5, Math.floor(usableH / cellHeight));
      dispatch({ type: 'view/update-terminal-dims', dims: { cols, rows } });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dispatch, fontSize, lineHeight]);

  if (!state.selectedPathId) {
    return (
      <main className="main-pane" ref={containerRef}>
        <WelcomeState />
      </main>
    );
  }

  return (
    <main className="main-pane" ref={containerRef}>
      <TabBar sessions={sessions} selectedSessionId={state.selectedSessionId} />
      {displayable ? (
        <TerminalView
          // 用 sessionId 作 key,确保切换时彻底重建 xterm 实例
          key={displayable.id}
          session={displayable}
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
      const dims = state.lastTerminalDims;
      const res = await window.api.invoke<unknown, CreateSessionResponse>(
        COMMAND_CHANNELS.SESSION_CREATE,
        { pathId, templateId: 'shell', cols: dims.cols, rows: dims.rows },
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
      const dims = state.lastTerminalDims;
      const res = await window.api.invoke<unknown, CreateSessionResponse>(
        COMMAND_CHANNELS.SESSION_CREATE,
        {
          pathId: state.selectedPathId,
          templateId: 'shell',
          cols: dims.cols,
          rows: dims.rows,
        },
      );
      dispatch({ type: 'view/select-session', sessionId: res.session.id });
    } catch (err) {
      console.error('[TabBar] new tab failed', err);
    }
  };

  // CP-2 勘误后:tab 顺序稳定 — 不按 owner 分组重排。
  // 本窗口可能"显示"的 (owner=myWindow 或 orphan) 按 path 原顺序留在
  // sessions 数组的位置;其他窗口持有的单独抽到最右端灰显。
  // 这样点击 orphan tab 触发 claim 后,该 tab 保持原位,旧 my-owned 也
  // 保持原位 — 用户视觉上不会看到 tab 跳动 (用户勘误 #1)。
  const visibleTabs: SessionInfo[] = [];
  const ownedByOtherTabs: SessionInfo[] = [];
  for (const s of sessions) {
    if (s.ownerWindowId !== null && s.ownerWindowId !== state.myWindowId) {
      ownedByOtherTabs.push(s);
    } else {
      visibleTabs.push(s);
    }
  }

  return (
    <div className="tab-bar">
      <div className="tab-list">
        {visibleTabs.map((s) => (
          <Tab
            key={s.id}
            session={s}
            myWindowId={state.myWindowId}
            selected={s.id === selectedSessionId}
          />
        ))}
        {ownedByOtherTabs.map((s) => (
          <Tab
            key={s.id}
            session={s}
            myWindowId={state.myWindowId}
            selected={false}
          />
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
  myWindowId: string;
  selected: boolean;
}

function Tab({ session, myWindowId, selected }: TabProps): JSX.Element {
  const state = useAppState();
  const dispatch = useAppDispatch();

  // Variant 由 session.ownerWindowId 自决,不再由父级分组传入。这样 tab
  // 即使移动 (虽然现在不再重排) 也不会丢 variant。
  const variant: 'mine' | 'orphan' | 'other' =
    session.ownerWindowId === myWindowId
      ? 'mine'
      : session.ownerWindowId === null
        ? 'orphan'
        : 'other';

  const handleClick = (e: MouseEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    if (variant === 'other') {
      // 其他窗口持有 → 聚焦那个窗口,所有权不变 (软件定义书 8.4)
      window.api
        .invoke(COMMAND_CHANNELS.SESSION_FOCUS_OWNER, {
          sessionId: session.id,
        })
        .catch((err) => console.error('[Tab] focus-owner failed', err));
      return;
    }
    if (variant === 'orphan') {
      // 乐观接管:本地立即改 owner + select,消除"+按钮闪一下"现象。
      // claim 失败 (race: SessionAlreadyOwned/NotFound,几乎不会发生)
      // 时再 dispatch 回滚到之前持有状态。
      const prevOwnedId = findMyOwnedSessionId(state);
      if (prevOwnedId && prevOwnedId !== session.id) {
        dispatch({
          type: 'sessions/owner-changed',
          sessionId: prevOwnedId,
          ownerWindowId: null,
        });
      }
      dispatch({
        type: 'sessions/owner-changed',
        sessionId: session.id,
        ownerWindowId: myWindowId,
      });
      dispatch({ type: 'view/select-session', sessionId: session.id });

      window.api
        .invoke(COMMAND_CHANNELS.SESSION_CLAIM, { sessionId: session.id })
        .catch((err) => {
          console.error('[Tab] claim failed, rolling back', err);
          // 回滚:目标变回 orphan,旧持有变回 myWindow
          dispatch({
            type: 'sessions/owner-changed',
            sessionId: session.id,
            ownerWindowId: null,
          });
          if (prevOwnedId && prevOwnedId !== session.id) {
            dispatch({
              type: 'sessions/owner-changed',
              sessionId: prevOwnedId,
              ownerWindowId: myWindowId,
            });
          }
          dispatch({ type: 'view/select-session', sessionId: prevOwnedId });
        });
      return;
    }
    // 本窗口持有 (mine):仅切换 view (新模型下其实 myTabs 至多 1 个,
    // 多数场景这就是当前 selected — no-op,但保留分支以防 race)
    dispatch({ type: 'view/select-session', sessionId: session.id });
  };

  const handleClose = (e: MouseEvent<HTMLSpanElement>): void => {
    e.stopPropagation();
    window.api
      .invoke(COMMAND_CHANNELS.SESSION_CLOSE, { sessionId: session.id })
      .catch((err) => console.error('[Tab] close failed', err));
  };

  return (
    <button
      type="button"
      className={
        `tab` +
        (selected ? ' selected' : '') +
        (variant === 'other' ? ' owned-by-other' : '') +
        (variant === 'orphan' ? ' orphan' : '')
      }
      onClick={handleClick}
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
          onClick={handleClose}
          title="关闭"
          role="button"
        >
          ×
        </span>
      )}
    </button>
  );
}
