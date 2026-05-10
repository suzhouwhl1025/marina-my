/**
 * @file src/renderer/components/Sidebar.tsx
 * @purpose 三栏侧栏 (收藏 / 临时 / 最近),路径节点 + 子 session 节点。
 *   含 + 按钮调文件夹选择器、拖文件夹到收藏区加入收藏 (drag-drop)、
 *   单击选中、双击新建 session、右键菜单 (CP-2 简化菜单)。
 *
 * @关键设计:
 * - 三栏始终显示,即使空 (软件定义书 6.2.1: 默认全部展开)
 * - 同 path 在三栏不重叠;每个 path 节点可展开看 sessions
 * - sessions 显示状态点 (active 绿 / idle 黄 / tombstoned 灰)、
 *   是否被其他窗口持有 (灰显 + ↗ 图标)
 * - 拖 Explorer 文件夹到 .sidebar-bookmarks-dropzone (CP-2 完成标志):
 *   先校验 file:// path 是否存在且是目录,然后调 cmd:bookmark:add
 * - 设置入口固定在底部 (CP-2 占位,CP-4 接入完整设置)
 *
 * @对应文档章节: 软件定义书.md 6.2 (左侧栏)、7.3 (拖拽规格)
 */
import {
  useState,
  useMemo,
  useEffect,
  createContext,
  useContext,
  useCallback,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  COMMAND_CHANNELS,
  type AddBookmarkResponse,
  type PickFolderResponse,
  type CreateSessionResponse,
} from '@shared/protocol';
import type { PathNode, SessionInfo } from '@shared/types';
import { findMyOwnedSessionId, useAppDispatch, useAppState } from '../store';

/**
 * 状态点颜色 (软件定义书 6.2.4 状态指示):
 * - active 🟢:近期有 PTY 输出
 * - idle  🟡:活着但 N 秒无输出
 * - exited ⚫:进程已退出 (ADR-008 取代旧 'tombstoned')
 *
 * 用 CSS variables 走主题切换 (CP-4 接通);#f0f fallback 是 stylelint 兜底
 * 防止变量缺失渲染成黑色 (软件定义书 5.1.9)。
 */
const STATE_DOT_COLOR: Record<SessionInfo['state'], string> = {
  active: 'var(--pine, #f0f)',
  idle: 'var(--gold, #f0f)',
  exited: 'var(--muted, #f0f)',
};

// ──────────────────────────────────────────────────────────────────
// 简易 Context Menu (CP-3 勘误 #4)
//
// Electron 默认会忽略 window.prompt / alert 这种 web 标准 API,所以原
// CP-3 用 prompt 实现的"设默认模板"完全没反应。这里用 React 渲染一个
// fixed 定位的菜单,点击外部 / Esc 关闭。
//
// CP-4 时若加更多右键交互 (复制路径 / Explorer 中显示 / 重命名),把这个
// 抽出 components/ContextMenu.tsx 复用。CP-3 阶段只用一处,内联即可。
// ──────────────────────────────────────────────────────────────────

interface ContextMenuItem {
  /** 显示文本;支持 emoji 前缀 */
  label: string;
  /** 鼠标悬停 tooltip,可选 */
  hint?: string;
  /** 当前是否选中 (用于显示 ✓ 前缀) */
  checked?: boolean;
  /** 点击触发的副作用 */
  onSelect: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
  /** 顶部小标题,可选 */
  title?: string;
}

interface ContextMenuApi {
  open(state: ContextMenuState): void;
  close(): void;
}

const ContextMenuApiContext = createContext<ContextMenuApi | null>(null);

function useContextMenuApi(): ContextMenuApi {
  const v = useContext(ContextMenuApiContext);
  if (!v) throw new Error('[Sidebar] ContextMenuApi 必须在 ContextMenuProvider 内使用');
  return v;
}

function ContextMenuProvider({ children }: { children: ReactNode }): JSX.Element {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const close = useCallback(() => setMenu(null), []);
  const api = useMemo<ContextMenuApi>(
    () => ({
      open: (state) => setMenu(state),
      close,
    }),
    [close],
  );

  // Esc / 全局点击 / 滚轮 都关菜单
  useEffect(() => {
    if (!menu) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    const onClickAway = (): void => close();
    const onScroll = (): void => close();
    window.addEventListener('keydown', onKey);
    // mousedown 比 click 早一个 phase,在浮层"自己消失"前就拿到事件;
    // 浮层内部的 mousedown 用 stopPropagation 阻止冒泡到这里。
    window.addEventListener('mousedown', onClickAway);
    window.addEventListener('wheel', onScroll, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClickAway);
      window.removeEventListener('wheel', onScroll);
    };
  }, [menu, close]);

  return (
    <ContextMenuApiContext.Provider value={api}>
      {children}
      {menu && (
        <div
          className="ctx-menu"
          style={{ left: menu.x, top: menu.y }}
          // 内部 mousedown 不冒泡到 window onClickAway
          onMouseDown={(e) => e.stopPropagation()}
          role="menu"
        >
          {menu.title && <div className="ctx-menu-title">{menu.title}</div>}
          {menu.items.map((it, idx) => (
            <button
              key={idx}
              type="button"
              className={`ctx-menu-item${it.checked ? ' checked' : ''}`}
              title={it.hint}
              onClick={() => {
                it.onSelect();
                close();
              }}
            >
              <span className="ctx-menu-check">{it.checked ? '✓' : ' '}</span>
              <span className="ctx-menu-label">{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </ContextMenuApiContext.Provider>
  );
}

export function Sidebar(): JSX.Element {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [dragOver, setDragOver] = useState(false);

  const handlePickFolder = async (): Promise<void> => {
    try {
      const result = await window.api.invoke<unknown, PickFolderResponse>(
        COMMAND_CHANNELS.BOOKMARK_PICK_FOLDER,
        {},
      );
      if (result.path === null) return;
      await window.api.invoke<unknown, AddBookmarkResponse>(
        COMMAND_CHANNELS.BOOKMARK_ADD,
        { path: result.path },
      );
    } catch (err) {
      console.error('[Sidebar] pick-folder + add-bookmark failed', err);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>): void => {
    // 只在真正离开容器时清,避免子元素 dragenter 引起 flash
    if (e.currentTarget === e.target) setDragOver(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    // Electron 把 OS 拖拽的文件信息放在 dataTransfer.files,带原生 path
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      // file.path 是 Electron 提供的扩展属性 (浏览器标准 File API 没有),
      // V1 我们假定 sandbox: false + nodeIntegration: false + contextIsolation: true
      // 也就是 webPreferences 默认提供 file.path
      const path = (file as File & { path?: string }).path;
      if (!path) continue;
      try {
        await window.api.invoke<unknown, AddBookmarkResponse>(
          COMMAND_CHANNELS.BOOKMARK_ADD,
          { path },
        );
      } catch (err) {
        console.error('[Sidebar] drop add-bookmark failed', err);
      }
    }
  };

  return (
    <ContextMenuProvider>
      <aside className="sidebar">
        <div
          className={`sidebar-bookmarks-dropzone${dragOver ? ' drag-over' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={(e) => void handleDrop(e)}
        >
          <Category
            title="收藏"
            icon="📌"
            paths={state.pathTree.bookmarks}
            actionLabel="+"
            actionTitle="选择文件夹添加到收藏"
            onAction={() => void handlePickFolder()}
          />
          <Category title="临时" icon="🕐" paths={state.pathTree.temporary} />
          <Category title="最近" icon="•" paths={state.pathTree.recent} />
        </div>
        <div className="sidebar-footer">
          <button
            type="button"
            className="settings-entry"
            onClick={() => dispatch({ type: 'view/enter-settings' })}
            title="设置"
          >
            ⚙ 设置
          </button>
        </div>
      </aside>
    </ContextMenuProvider>
  );
}

interface CategoryProps {
  title: string;
  icon: string;
  paths: PathNode[];
  actionLabel?: string;
  actionTitle?: string;
  onAction?: () => void;
}

function Category({
  title,
  icon,
  paths,
  actionLabel,
  actionTitle,
  onAction,
}: CategoryProps): JSX.Element {
  return (
    <section className="sidebar-category">
      <header className="sidebar-category-header">
        <span className="sidebar-category-title">
          <span className="sidebar-category-icon" aria-hidden="true">
            {icon}
          </span>
          {title}
        </span>
        <span className="sidebar-category-count">{paths.length}</span>
        {actionLabel && (
          <button
            type="button"
            className="sidebar-category-action"
            onClick={onAction}
            title={actionTitle}
          >
            {actionLabel}
          </button>
        )}
      </header>
      {paths.length === 0 ? (
        <p className="sidebar-empty">空</p>
      ) : (
        <ul className="sidebar-paths">
          {paths.map((p) => (
            <PathItem key={p.id} node={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PathItem({ node }: { node: PathNode }): JSX.Element {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const ctxMenu = useContextMenuApi();
  const expanded = state.expandedPathIds.has(node.id);
  const selected = state.selectedPathId === node.id;
  const sessions = useMemo(
    () => node.sessionIds.map((sid) => state.sessions.get(sid)).filter(Boolean) as SessionInfo[],
    [node.sessionIds, state.sessions],
  );
  const activeCount = sessions.length;
  const displayName = node.displayName ?? lastSegmentOf(node.path);

  const handleSelect = (): void => {
    dispatch({ type: 'view/select-path', pathId: node.id });
  };

  const handleToggleExpand = (e: MouseEvent<HTMLSpanElement>): void => {
    e.stopPropagation();
    dispatch({ type: 'view/toggle-path-expand', pathId: node.id });
  };

  const handleDoubleClick = async (): Promise<void> => {
    // 双击 = 在该 path 下用默认模板新建 session
    // 优先级:bookmark.defaultTemplateId > 全局 defaultTemplateId > 'shell' 兜底
    const templateId =
      node.defaultTemplateId ?? state.defaultTemplateId ?? 'shell';
    try {
      const dims = state.lastTerminalDims;
      const res = await window.api.invoke<unknown, CreateSessionResponse>(
        COMMAND_CHANNELS.SESSION_CREATE,
        {
          pathId: node.path,
          templateId,
          cols: dims.cols,
          rows: dims.rows,
        },
      );
      // 先切 path (会自动选 my-owned firstSid,但新创建的可能不是 firstSid),
      // 再显式 select 新创建的 session。两次 dispatch 在 React 18 自动 batch。
      dispatch({ type: 'view/select-path', pathId: node.id });
      dispatch({ type: 'view/select-session', sessionId: res.session.id });
    } catch (err) {
      console.error('[Sidebar] doubleclick create-session failed', err);
    }
  };

  const handleContextMenu = (e: MouseEvent<HTMLDivElement>): void => {
    // CP-3 勘误 #4:仅收藏路径支持右键菜单 (软件定义书 6.2.2)。
    // 临时 / 最近的右键菜单 (加入收藏 / 从最近移除等) 是 CP-4 范围。
    if (node.category !== 'bookmarked') return;
    e.preventDefault();
    e.stopPropagation();

    const items = state.templates.map((t) => ({
      label: `${t.icon} ${t.name}`,
      hint: t.command ? `启动命令: ${t.command}` : '系统默认 shell',
      checked: t.id === node.defaultTemplateId,
      onSelect: () => {
        window.api
          .invoke(COMMAND_CHANNELS.BOOKMARK_SET_DEFAULT_TEMPLATE, {
            pathId: node.path,
            templateId: t.id,
          })
          .catch((err) =>
            console.error('[Sidebar] set-default-template failed', err),
          );
      },
    }));
    ctxMenu.open({
      x: e.clientX,
      y: e.clientY,
      title: `设默认模板 — ${node.displayName ?? lastSegmentOf(node.path)}`,
      items,
    });
  };

  return (
    <li className={`path-item${selected ? ' selected' : ''}`}>
      <div
        className="path-item-row"
        onClick={handleSelect}
        onDoubleClick={() => void handleDoubleClick()}
        onContextMenu={handleContextMenu}
        title={node.path}
      >
        {sessions.length > 0 ? (
          <span
            className={`path-expand-arrow${expanded ? ' expanded' : ''}`}
            onClick={handleToggleExpand}
            aria-label={expanded ? '收起' : '展开'}
          >
            ▶
          </span>
        ) : (
          <span className="path-expand-arrow placeholder" />
        )}
        <span className="path-name">{displayName}</span>
        {activeCount > 0 && (
          <span className="path-session-count" title={`${activeCount} 个终端`}>
            {activeCount}
          </span>
        )}
      </div>
      {expanded && sessions.length > 0 && (
        <ul className="session-list">
          {sessions.map((s) => (
            <SessionItem key={s.id} session={s} />
          ))}
        </ul>
      )}
    </li>
  );
}

function SessionItem({ session }: { session: SessionInfo }): JSX.Element {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMine = session.ownerWindowId === state.myWindowId;
  const ownedByOther =
    session.ownerWindowId !== null && session.ownerWindowId !== state.myWindowId;
  const selected = state.selectedSessionId === session.id;

  const handleClick = (): void => {
    // 本窗口已是 owner → 仅切 view
    if (isMine) {
      dispatch({ type: 'view/select-path', pathId: session.pathId });
      dispatch({ type: 'view/select-session', sessionId: session.id });
      return;
    }
    // 其他窗口持有 → 聚焦那个窗口,所有权不变 (软件定义书 8.4)
    if (ownedByOther) {
      window.api
        .invoke(COMMAND_CHANNELS.SESSION_FOCUS_OWNER, {
          sessionId: session.id,
        })
        .catch((err) => console.error('[Sidebar] focus-owner failed', err));
      return;
    }
    // 无主 → 乐观接管 (与 Tab.handleClick orphan 分支同协议:本地立即
    // 改 owner + select,消除 EmptyPathState 闪烁;失败回滚)
    const myWindowId = state.myWindowId;
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
    dispatch({ type: 'view/select-path', pathId: session.pathId });
    dispatch({ type: 'view/select-session', sessionId: session.id });

    window.api
      .invoke(COMMAND_CHANNELS.SESSION_CLAIM, { sessionId: session.id })
      .catch((err) => {
        console.error('[Sidebar] claim failed, rolling back', err);
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
  };

  // ADR-008:currentCwd 与 originalCwd 不一致时显示 ⚠️ tooltip 真实 cwd。
  // session.pathId 永久不变,所以不会在 UI 上"跳" path,只是这个标志告诉用户
  // session 内 cd 走了。
  const cwdDrifted =
    !!session.currentCwd &&
    !!session.originalCwd &&
    !samePath(session.currentCwd, session.originalCwd);

  const baseTitle = ownedByOther
    ? `${session.displayName} (在其他窗口,点击聚焦那个窗口)`
    : session.displayName;
  const fullTitle = cwdDrifted
    ? `${baseTitle}\n当前目录已变 → ${session.currentCwd}\n(原: ${session.originalCwd})`
    : baseTitle;

  return (
    <li
      className={`session-item${selected ? ' selected' : ''}${
        ownedByOther ? ' owned-by-other' : ''
      }${session.state === 'exited' ? ' exited' : ''}`}
      onClick={() => void handleClick()}
      title={fullTitle}
    >
      <span
        className="session-state-dot"
        style={{ backgroundColor: STATE_DOT_COLOR[session.state] }}
      />
      <span className="session-name">{session.displayName}</span>
      {cwdDrifted && (
        <span className="session-cwd-drift" aria-label="当前目录已变" title={session.currentCwd}>
          ⚠
        </span>
      )}
      {session.state === 'exited' && (
        <span
          className="session-exit-code"
          title={`已退出 (exitCode=${session.exitCode ?? 0})`}
        >
          ⚫
        </span>
      )}
      {ownedByOther && <span className="session-owned-by-other">↗</span>}
    </li>
  );
}

/**
 * 比较两个路径是否指向同一目录。Windows 大小写无关,POSIX 大小写敏感。
 * 不做 normalize (currentCwd / originalCwd 进入 SessionInfo 之前已经 path.resolve 过)。
 */
function samePath(a: string, b: string): boolean {
  if (a === b) return true;
  // Windows 上 C:\Foo 和 c:\foo 指同一目录。SessionManager 已经把卷符大写,
  // 但 OSC 报告的 cwd 卷符大小写可能不一致,这里再松一层。
  return a.toLowerCase() === b.toLowerCase();
}

function lastSegmentOf(path: string): string {
  // 跨平台:取 / 或 \ 分隔的最后一段;空字符串 / 根路径回退到原路径
  const m = path.match(/[^/\\]+$/);
  return m ? m[0] : path;
}
