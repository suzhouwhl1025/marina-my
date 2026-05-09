/**
 * @file src/main/ipc.ts
 * @purpose 集中注册所有 ipcMain.handle / ipcMain.on 处理器。
 *   把命令路由到对应的 manager 模块,统一日志、错误处理、信封解包。
 *
 * @关键设计:
 * - 严格遵守 ipc-protocol.md:仅用 invoke/handle (禁用 send/on)
 * - 每个 handler 接收 CommandEnvelope,自动记录 requestId 和 windowId 到日志
 * - 错误统一封装成带错误码的对象返回 (ipc-protocol.md 第 7 节)
 * - handler 本身不写业务逻辑,只做参数校验 + 转发到对应 manager
 *
 * @对应文档章节: docs/ipc-protocol.md 全部;软件定义书.md 9.4
 *
 * @AGENTS.md 5.4: handler 仅做转发的部分不需要单测,转发到的 manager 单独测。
 *
 * @CP-1 阶段:
 * 占位 stub,实际 handler 注册在 CP-2 起逐步加入 (随 manager 实现)。
 */

/**
 * STUB: 注册所有 IPC handler。在 CP-2 起按需调用。
 */
export function registerIpcHandlers(): void {
  // CP-2 起在这里逐个注册 handler:
  //   ipcMain.handle(COMMAND_CHANNELS.APP_GET_PROTOCOL_VERSION, ...)
  //   ipcMain.handle(COMMAND_CHANNELS.APP_GET_SNAPSHOT, ...)
  //   等等
}
