// [BETA-019 DEBUG] HUD 组件 — 嵌在标题栏中部。
//
// 主行(标题栏内一直显示):当前 cursor 状态摘要 + flips 计数 + 末次翻转方向。
// 展开面板(点击 ▼ 切换):完整翻转日志 — 每一次翻转的时刻 / 方向 / 原因 /
//   stack 头,从最新到最旧倒序排列。日志由 beta019-cursor-hud 模块层 Map 持久,
//   组件 unmount / sessionId 切换都不丢失,Marina 进程重启清空。
//
// 翻转捕获机制:beta019-cursor-hud 在 registerTerminal 时给
// `coreService.isCursorHidden` 装 Object.defineProperty setter,翻转瞬间抓
// stack trace,解析出 InputHandler 调用方(softReset / fullReset / setModePrivate
// 等),直接告诉用户是哪条 escape 路径。
//
// 本组件 + beta019-cursor-hud.ts 完成定位后可整体删除。
import { useEffect, useState } from 'react';
import { useAppState } from '../store';
import {
  getTerminal,
  sampleCursor,
  getHistory,
  type CursorSnapshot,
  type FlipHistory,
} from '../debug/beta019-cursor-hud';

interface HudView {
  snap: CursorSnapshot;
  hist: FlipHistory | null;
}

const EMPTY_SNAP: CursorSnapshot = {
  cursorHidden: null,
  cursorInitialized: null,
  blink: null,
  style: null,
  cursorX: null,
  cursorY: null,
  bufferY: null,
};

export function Beta019CursorHud(): JSX.Element | null {
  const state = useAppState();
  const sessionId = state.selectedSessionId;
  const session = sessionId ? state.sessions.get(sessionId) : undefined;

  const [view, setView] = useState<HudView>({ snap: EMPTY_SNAP, hist: null });
  const [expanded, setExpanded] = useState<boolean>(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      const term = getTerminal(sessionId);
      const snap = sampleCursor(term);
      const hist = getHistory(sessionId);
      setView({ snap, hist });
    }, 250);
    return () => window.clearInterval(id);
  }, [sessionId]);

  if (!sessionId) return null;

  const { snap, hist } = view;
  const hideFlips = hist?.hideFlips ?? 0;
  const lastFlipAt = hist?.lastFlipAt ?? null;
  const lastFlipFromTo = hist?.lastFlipFromTo ?? '';

  const hideStr = snap.cursorHidden === null ? '?' : snap.cursorHidden ? 'T' : 'F';
  const lastFlipToF = lastFlipFromTo.endsWith('→F');
  const hideAlarmed = snap.cursorHidden === false && hideFlips >= 1 && lastFlipToF;
  const hideColor = hideAlarmed
    ? '#ff5d9e'
    : snap.cursorHidden === true
      ? '#9ccfd8'
      : '#aaa';
  const flipsColor = hideFlips >= 2 ? '#ff5d9e' : hideFlips === 1 ? '#9ccfd8' : '#888';
  const blinkStr = snap.blink === null ? '?' : snap.blink ? 'T' : 'F';
  const styleStr = snap.style ?? '?';
  const xy = `${snap.cursorX ?? '?'},${snap.cursorY ?? '?'}`;
  const flipAt = lastFlipAt === null ? '—' : `${(lastFlipAt / 1000).toFixed(1)}s`;
  const sessState = session?.state ?? '?';

  return (
    <>
      <div
        className="titlebar-drag"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 8px',
          fontFamily: 'Consolas, monospace',
          fontSize: 11,
          color: '#aaa',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
        title="[BETA-019 DEBUG] 点击 ▼ 展开完整翻转日志"
      >
        <span>BETA-019</span>
        <span>
          hide:<span style={{ color: hideColor, fontWeight: 600 }}>{hideStr}</span>
        </span>
        <span>blink:{blinkStr}</span>
        <span>style:{styleStr}</span>
        <span>xy:[{xy}]</span>
        <span>
          flips:<span style={{ color: flipsColor, fontWeight: 600 }}>{hideFlips}</span>
          {lastFlipFromTo && (
            <span style={{ color: '#888' }}>
              ({lastFlipFromTo}@{flipAt})
            </span>
          )}
        </span>
        <span>state:{sessState}</span>
        {/* 展开/折叠按钮 — 不在 drag 区,避免点击触发拖窗 */}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{
            background: 'transparent',
            border: '1px solid #555',
            color: '#ddd',
            padding: '0 6px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 10,
            lineHeight: '16px',
            borderRadius: 2,
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
          title={expanded ? '折叠日志' : '展开完整翻转日志'}
        >
          {expanded ? '▲ 折叠' : `▼ log(${hist?.flipLog.length ?? 0})`}
        </button>
      </div>
      {expanded && hist && <FlipLogPanel hist={hist} />}
    </>
  );
}

function FlipLogPanel({ hist }: { hist: FlipHistory }): JSX.Element {
  const log = hist.flipLog;
  // 倒序展示 — 最新在上
  const rows = [...log].reverse();
  const copyAll = (): void => {
    const text = log
      .map(
        (e, i) =>
          `#${i + 1}\t${(e.at / 1000).toFixed(2)}s\t${e.fromTo}\t${e.reason}\t${e.stackHead}`,
      )
      .join('\n');
    void navigator.clipboard.writeText(text).catch(() => {
      /* ignore */
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 36, // .app-titlebar 高度:Windows 36px / macOS 32px,优先对齐 Windows
        right: 24,
        zIndex: 9999,
        background: '#1f1d2e',
        border: '1px solid #524f67',
        borderRadius: 4,
        padding: 8,
        maxWidth: 720,
        maxHeight: 'calc(100vh - 80px)',
        overflowY: 'auto',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        fontFamily: 'Consolas, monospace',
        fontSize: 11,
        color: '#e0def4',
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
          borderBottom: '1px solid #393552',
          paddingBottom: 4,
        }}
      >
        <span style={{ color: '#c4a7e7', fontWeight: 600 }}>
          BETA-019 翻转日志 (共 {log.length} 条)
        </span>
        <button
          type="button"
          onClick={copyAll}
          style={{
            background: '#393552',
            border: '1px solid #524f67',
            color: '#e0def4',
            padding: '2px 8px',
            fontSize: 10,
            cursor: 'pointer',
            borderRadius: 2,
            fontFamily: 'inherit',
          }}
        >
          📋 复制全部
        </button>
      </div>
      {log.length === 0 ? (
        <div style={{ color: '#6e6a86', padding: 8 }}>
          尚未捕获到翻转。启动 Claude Code 应看到首次 F→T(`?25l` 隐藏光标)。
        </div>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ color: '#908caa', borderBottom: '1px solid #393552' }}>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>#</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>时刻</th>
              <th style={{ textAlign: 'center', padding: '4px 8px' }}>方向</th>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>原因 (来源 escape)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, idx) => {
              const num = log.length - idx;
              const isToF = e.fromTo.endsWith('→F');
              const dirColor = isToF ? '#ff5d9e' : '#9ccfd8';
              return (
                <tr
                  key={`${e.atEpoch}-${num}`}
                  style={{ borderBottom: '1px solid #2a2738' }}
                  title={e.stackHead}
                >
                  <td style={{ padding: '4px 8px', color: '#6e6a86' }}>{num}</td>
                  <td
                    style={{
                      padding: '4px 8px',
                      textAlign: 'right',
                      color: '#f6c177',
                    }}
                  >
                    {(e.at / 1000).toFixed(2)}s
                  </td>
                  <td
                    style={{
                      padding: '4px 8px',
                      textAlign: 'center',
                      color: dirColor,
                      fontWeight: 600,
                    }}
                  >
                    {e.fromTo}
                  </td>
                  <td style={{ padding: '4px 8px' }}>{e.reason}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div
        style={{
          color: '#6e6a86',
          fontSize: 10,
          marginTop: 8,
          paddingTop: 4,
          borderTop: '1px solid #393552',
        }}
      >
        悬停每行看 stack head。粉红 T→F 在运行中出现 = bug 假设证实,原因列直接指明 escape 路径。
      </div>
    </div>
  );
}
