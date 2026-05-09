/**
 * @file src/renderer/App.tsx
 * @purpose 应用根组件。CP-1 阶段只显示占位页面验证启动流程,
 *   CP-2 起替换为 MainView (侧栏 + 标签页 + 终端区) / SettingsView 切换。
 *
 * @对应文档章节: 软件定义书.md 6.1 (整体布局)
 *
 * @CP-1 状态: 占位页面。
 */
import { useEffect, useState } from 'react';

export function App() {
  const [windowId, setWindowId] = useState<string>('(loading)');

  useEffect(() => {
    // window.api 由 preload 通过 contextBridge 暴露
    if (typeof window !== 'undefined' && window.api) {
      setWindowId(window.api.windowId);
    }
  }, []);

  return (
    <div className="app-root">
      <div className="bootstrap-placeholder">
        <h1>EasyTerm</h1>
        <p className="subtitle">checkpoint 1 — 项目初始化阶段</p>
        <dl className="diagnostics">
          <dt>Window ID</dt>
          <dd>{windowId}</dd>
          <dt>Renderer 进程</dt>
          <dd>就绪</dd>
          <dt>Preload 桥</dt>
          <dd>{typeof window !== 'undefined' && window.api ? '已连接' : '未连接'}</dd>
        </dl>
        <p className="hint">
          这是 CP-1 项目初始化骨架。CP-1 后续 commit 将加入 xterm.js、托盘、单实例锁、
          多窗口编号等功能。完整 UI 在 CP-2 起逐步替换此页面。
        </p>
      </div>
    </div>
  );
}
