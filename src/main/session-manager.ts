/**
 * @file src/main/session-manager.ts
 * @purpose 管理所有 PTY 会话的生命周期 (创建、活跃/空闲检测、墓地、销毁)。
 *
 * @关键设计:
 * - 每个 Session 在守护进程内是单例,owner_window_id 可为 null
 *   (软件定义书 8.4)
 * - PTY 进程退出后进入"墓地"5 分钟,期间用户可恢复 (软件定义书 8.3)
 * - 字节流通过 IPC 推送给 owner window,无 owner 时仍写 scrollback
 * - 任一时刻 session 最多一个 owner window (ADR-005)
 *
 * @对应文档章节: 软件定义书.md 5.1.2、8.3、8.4;AGENTS.md CP-3 完成标志
 *
 * @不要在这里做的事:
 * - 不要解析 OSC 1337 (那是 cwd-tracker 的职责,CP-3 加入)
 * - 不要持久化 session (session 不持久化,设计如此 — ADR-004)
 * - 不要管理 path 归属 (那是 path-manager 的职责)
 *
 * @CP-1 / CP-2 / CP-3 阶段:
 * 该模块完整实现在 CP-3。CP-1 阶段不需要 PTY 工作,这个文件只是骨架占位,
 * 让其他模块的 import 路径稳定。
 */

/**
 * STUB: 在 CP-3 完整实现。
 */
export class SessionManager {
  // CP-3 实现 createSession / closeSession / claimOwner / releaseOwner /
  // restartFromTombstone / getScrollback 等方法。
}
