/**
 * @file protocol.ts
 * @purpose IPC 协议的共享类型定义。Main 与 Renderer 都从这里 import,
 *   确保两端对消息 schema 的理解完全一致。
 *
 * @关键设计:
 * - Channel 命名严格遵守 docs/ipc-protocol.md 第 2.1 节的 `<kind>:<domain>:<action>` 格式
 * - 每个命令的 payload 类型与返回值类型成对定义,便于在 ipc-client.ts 中泛型推导
 * - 所有 payload 必须 JSON 可序列化 (ipc-protocol.md 1.3 节)
 * - 这个文件不引入任何运行时代码,纯类型 + 常量
 *
 * @对应文档章节: docs/ipc-protocol.md 全部
 *
 * @CP-1 范围:
 * 此文件先导出 PROTOCOL_VERSION 和最基础的 channel 常量,具体 command/event 类型
 * 在 CP-2 (核心数据模型) 和 CP-3 (Session 管理) 时按需补全。
 */

/**
 * 协议版本号。Main 与 Renderer 不匹配时拒绝 handshake。
 * Bump 规则:破坏性变更 +1;新增 channel 或扩展 payload 不需要 bump。
 */
export const PROTOCOL_VERSION = 1 as const;

/**
 * 所有命令通道的命名常量,集中管理避免硬编码字符串散落各处。
 * 在 CP-2/CP-3 阶段会逐步补全此清单 (参考 ipc-protocol.md 第 3.1 节)。
 */
export const COMMAND_CHANNELS = {
  // App 域
  APP_GET_PROTOCOL_VERSION: 'cmd:app:get-protocol-version',
  APP_GET_SNAPSHOT: 'cmd:app:get-snapshot',
  APP_QUIT: 'cmd:app:quit',

  // Window 域
  WINDOW_CREATE: 'cmd:window:create',
  WINDOW_CLOSE_SELF: 'cmd:window:close-self',
} as const;

export type CommandChannel = (typeof COMMAND_CHANNELS)[keyof typeof COMMAND_CHANNELS];

/**
 * 所有事件通道的命名常量。
 */
export const EVENT_CHANNELS = {
  WINDOW_LIST_UPDATED: 'evt:window:list-updated',
} as const;

export type EventChannel = (typeof EVENT_CHANNELS)[keyof typeof EVENT_CHANNELS];

/**
 * 命令信封 (ipc-protocol.md 2.3 节)。
 * Renderer 端 invoke 时会自动包装,Main 端 handle 时会自动解包。
 */
export interface CommandEnvelope<P = unknown> {
  windowId: string;
  requestId: string;
  payload: P;
}

/**
 * 事件信封 (ipc-protocol.md 2.4 节)。
 */
export interface EventEnvelope<P = unknown> {
  eventId: string;
  timestamp: number;
  payload: P;
}

/**
 * cmd:app:get-protocol-version 的返回类型。
 */
export interface GetProtocolVersionResponse {
  version: typeof PROTOCOL_VERSION;
}
