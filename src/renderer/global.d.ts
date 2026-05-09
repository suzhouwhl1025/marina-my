/**
 * @file src/renderer/global.d.ts
 * @purpose Renderer 端的全局类型补丁,声明 window.api (由 preload 注入)。
 *
 * @对应文档章节: docs/ipc-protocol.md 第 2 章
 */
import type { Api } from '../preload';

declare global {
  interface Window {
    api: Api;
  }
}

export {};
