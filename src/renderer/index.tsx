/**
 * @file src/renderer/index.tsx
 * @purpose Renderer 进程 entry。挂载 React 根组件到 #root。
 *
 * @关键设计:
 * - 严格模式开启 (StrictMode) — 帮助发现 effect 重复触发等问题
 * - 通过 window.api (preload 暴露) 与 main 通信,renderer 内部不能直接 require electron
 *
 * @对应文档章节: 软件定义书.md 9.2.2
 *
 * @CP-1 阶段:
 * 极简入口 — 只渲染 App.tsx 显示一个占位页面,验证 Electron + Vite + React
 * 链路全部跑通。CP-2 起接入 store / IPC client / 完整 UI。
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error(
    '[renderer] #root element missing in index.html — ' +
      'Vite did not load the HTML correctly or the template was modified.',
  );
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
