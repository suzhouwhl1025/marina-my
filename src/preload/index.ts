/**
 * @file src/preload/index.ts
 * @purpose Preload 脚本,运行在每个 BrowserWindow 的隔离上下文中。
 *   通过 contextBridge 把白名单的 IPC 能力暴露给 renderer (window.api)。
 *
 * @关键设计:
 * - contextIsolation 启用,sandbox 关闭 (因 main 用 node-pty 等原生模块)
 * - 不直接暴露 ipcRenderer 给 renderer,只暴露包装好的 invoke / on / off
 * - 暴露 windowId (从 URL query 解析,见 ipc-protocol.md 2.2)
 * - 这里不写业务逻辑,只是一座最薄的桥
 *
 * @对应文档章节: docs/ipc-protocol.md 全部;软件定义书.md 9.2.2
 *
 * @AGENTS.md 5.1: preload 不需要单测 (简单转发)。
 *
 * @CP-1 阶段:
 * 暴露最小 API: getWindowId / getProtocolVersion (用于验证 IPC 通路)。
 * 完整 API 在 CP-2 起逐步加入。
 */
import { contextBridge, ipcRenderer } from 'electron';
import { COMMAND_CHANNELS, type CommandEnvelope } from '@shared/protocol';

/**
 * 从 URL query string 提取本窗口的 windowId。
 * Main 创建 BrowserWindow 时会附加 ?windowId=...
 */
function getWindowIdFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('windowId');
  // CP-1 阶段允许没有 windowId (bootstrap 用最小窗口); CP-2 起 WindowManager
  // 接管时会必传。这里返回 'bootstrap' 作为占位,方便日志识别。
  return id ?? 'bootstrap';
}

/**
 * 包装 ipcRenderer.invoke,自动附加 windowId / requestId / payload 信封。
 */
async function invoke<P, R>(channel: string, payload: P): Promise<R> {
  const envelope: CommandEnvelope<P> = {
    windowId: getWindowIdFromUrl(),
    requestId: crypto.randomUUID(),
    payload,
  };
  return ipcRenderer.invoke(channel, envelope);
}

/**
 * 暴露给 renderer 的 API。renderer 通过 window.api 访问。
 * 类型在 src/renderer/global.d.ts 中声明。
 */
const api = {
  /** 当前窗口的 ID (CP-1 占位 'bootstrap',CP-2 起为 UUID) */
  windowId: getWindowIdFromUrl(),

  /** 协议版本握手 (handshake) — CP-2 完整实现 */
  getProtocolVersion: () =>
    invoke<undefined, { version: number }>(
      COMMAND_CHANNELS.APP_GET_PROTOCOL_VERSION,
      undefined,
    ),

  /** 订阅 main 推送的事件,返回取消订阅函数 */
  on: <P>(channel: string, handler: (payload: P) => void): (() => void) => {
    const wrapped = (_event: unknown, envelope: { payload: P }) => handler(envelope.payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.off(channel, wrapped);
  },
} as const;

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
