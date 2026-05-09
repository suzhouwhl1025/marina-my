/**
 * @file src/renderer/components/TerminalView.tsx
 * @purpose 把 xterm.js 实例附加到一个已存在的 session,完成双向字节流。
 *   session 由父组件 (Sidebar/MainPane) 通过 cmd:session:create 创建,
 *   TerminalView 只是 session 的"观察窗"。
 *
 * @关键设计:
 * - props.session 是已创建的 SessionInfo,不在此处 spawn PTY (CP-2 起改);
 *   CP-1 的 TerminalView 既创建又消费,CP-2 把创建职责交给 Sidebar/TabBar
 * - 主题颜色与 CSS variables 同步 (软件定义书 5.1.9 Rose Pine)
 * - 字节流: PTY → main → evt:session:output → atob → xterm.write
 *           xterm.onData → utf8 → base64 → cmd:session:send-input → main
 * - 用 sessionId 作 React key,session 切换时强制重建 xterm 实例
 *   (避免 viewport / 滚动状态错乱)
 * - 组件卸载时不调 cmd:session:close (session 跨 mount 存活,
 *   关闭由 Tab × 显式触发 / 窗口关闭由 main 端 handleWindowClosed 处理)
 *
 * @对应文档章节:
 *   软件定义书.md 5.1.4 (终端体验)、5.1.9 (主题);
 *   ipc-protocol.md 第 5.2、第 8 (字节流)
 *
 * @CP-2 限制:
 * - 切换 session 后再切回:看不到历史输出 (无 scrollback,CP-3 接入)
 * - 不接 OSC 1337 cwd 跟踪 (CP-3)
 * - 不接复制粘贴菜单 / 搜索 (CP-4)
 */
import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import {
  COMMAND_CHANNELS,
  EVENT_CHANNELS,
  type SessionOutputPayload,
} from '@shared/protocol';
import type { SessionInfo } from '@shared/types';
import '@xterm/xterm/css/xterm.css';

const ROSE_PINE_XTERM_THEME = {
  background: '#191724',
  foreground: '#e0def4',
  cursor: '#e0def4',
  cursorAccent: '#191724',
  selectionBackground: '#403d52',
  black: '#26233a',
  red: '#eb6f92',
  green: '#31748f',
  yellow: '#f6c177',
  blue: '#9ccfd8',
  magenta: '#c4a7e7',
  cyan: '#ebbcba',
  white: '#e0def4',
  brightBlack: '#6e6a86',
  brightRed: '#eb6f92',
  brightGreen: '#31748f',
  brightYellow: '#f6c177',
  brightBlue: '#9ccfd8',
  brightMagenta: '#c4a7e7',
  brightCyan: '#ebbcba',
  brightWhite: '#e0def4',
} as const;

interface TerminalViewProps {
  session: SessionInfo;
  myWindowId: string;
}

export function TerminalView({ session, myWindowId }: TerminalViewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isOwner = session.ownerWindowId === myWindowId;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    if (!isOwner) {
      // 非 owner 不渲染终端 (output 不会推过来)。CP-2 简化:
      // 显示提示。CP-3 接入 scrollback 后非 owner 也可看历史。
      return undefined;
    }

    const term = new Terminal({
      fontFamily:
        '"Cascadia Mono", "JetBrains Mono", Consolas, "LXGW WenKai Mono", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'bar',
      theme: ROSE_PINE_XTERM_THEME,
      scrollback: 5000,
      allowProposedApi: false,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(container);

    try {
      fitAddon.fit();
    } catch {
      /* 忽略极小窗口 fit 错误 */
    }

    const cols = term.cols;
    const rows = term.rows;

    // 启动后立即同步初始尺寸给 PTY (session 的初始 cols/rows 可能与
    // 当前 xterm fit 后的实际值不同,一次性矫正)
    if (cols !== session.cols || rows !== session.rows) {
      window.api
        .invoke(COMMAND_CHANNELS.SESSION_RESIZE, {
          sessionId: session.id,
          cols,
          rows,
        })
        .catch(() => {});
    }

    // 接 PTY 输出
    const cleanupOutput = window.api.on<SessionOutputPayload>(
      EVENT_CHANNELS.SESSION_OUTPUT,
      (payload) => {
        if (payload.sessionId !== session.id) return;
        const bytes = decodeBase64ToBytes(payload.data);
        term.write(bytes);
      },
    );

    // 用户键盘输入 → 发回 PTY
    const dataHandler = term.onData((data) => {
      const base64 = encodeStringToBase64(data);
      window.api
        .invoke(COMMAND_CHANNELS.SESSION_SEND_INPUT, {
          sessionId: session.id,
          data: base64,
        })
        .catch((err) => console.error('[TerminalView] send-input failed', err));
    });

    // ResizeObserver:容器变化 → fit + cmd:session:resize (RAF debounce)
    let lastCols = cols;
    let lastRows = rows;
    let pendingFrame: number | null = null;
    let disposed = false;
    const resizeObserver = new ResizeObserver(() => {
      if (disposed) return;
      if (pendingFrame !== null) return;
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = null;
        if (disposed) return;
        try {
          fitAddon.fit();
        } catch {
          return;
        }
        const newCols = term.cols;
        const newRows = term.rows;
        if (newCols === lastCols && newRows === lastRows) return;
        lastCols = newCols;
        lastRows = newRows;
        window.api
          .invoke(COMMAND_CHANNELS.SESSION_RESIZE, {
            sessionId: session.id,
            cols: newCols,
            rows: newRows,
          })
          .catch(() => {});
      });
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
      resizeObserver.disconnect();
      cleanupOutput();
      dataHandler.dispose();
      term.dispose();
    };
  }, [session.id, isOwner, session.cols, session.rows, myWindowId]);

  if (!isOwner) {
    return (
      <div className="terminal-not-owner">
        <p>
          这个会话当前由 <strong>另一个窗口</strong> 持有。
          点击此处接管 (CP-2 简化:接管后看不到历史输出,CP-3 接入 scrollback 后修)。
        </p>
        <button
          type="button"
          className="terminal-claim-btn"
          onClick={() =>
            void window.api.invoke(COMMAND_CHANNELS.SESSION_CLAIM, {
              sessionId: session.id,
            })
          }
        >
          接管会话
        </button>
      </div>
    );
  }

  return (
    <div className="terminal-wrapper">
      <div className="terminal-statusbar">
        <span className="status-dot active" />
        <span className="status-text">
          {session.displayName} · pid {session.pid}
        </span>
        <span className="status-cwd" title={session.cwd}>
          {session.cwd}
        </span>
      </div>
      <div className="terminal-host" ref={containerRef} />
    </div>
  );
}

function decodeBase64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeStringToBase64(str: string): string {
  const utf8 = new TextEncoder().encode(str);
  let binary = '';
  for (const byte of utf8) binary += String.fromCharCode(byte);
  return btoa(binary);
}
