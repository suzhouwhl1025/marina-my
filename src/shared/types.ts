/**
 * @file types.ts
 * @purpose 跨进程共享的领域类型 (Bookmark / Session / PathNode / Settings 等)。
 *   这些类型对应 软件定义书.md 第 11 章 (数据模型) 的 schema。
 *
 * @关键设计:
 * - 类型按"持久化数据"和"内存数据"分组,与磁盘 JSON 文件一一对应
 * - Settings 接口包含 version 字段用于版本迁移 (软件定义书 11.3)
 * - SessionState/PathCategory 是受限字符串字面量,与状态机定义对齐
 * - 不在这里定义任何带方法的 class,纯数据 (要 JSON 可序列化)
 *
 * @对应文档章节: 软件定义书.md 第 8 章 (状态机)、第 11 章 (数据模型)
 *
 * @CP-1 范围:
 * 此文件先定义 WindowInfo 等 CP-1 必需的类型,Bookmark/Session/Settings 等
 * 完整结构在 CP-2/CP-3/CP-4 阶段补全,以避免现在过度设计。
 */

/**
 * Path 在三栏侧栏中的归属分类 (软件定义书 4 节)。
 */
export type PathCategory = 'bookmarked' | 'temporary' | 'recent';

/**
 * Session 的运行时状态 (软件定义书 8.3 节状态机)。
 * V1 只有 active / idle / tombstoned 三种,V1.1 后会扩展 waiting-input / error。
 */
export type SessionState = 'active' | 'idle' | 'tombstoned';

/**
 * 应用整体生命周期状态 (软件定义书 8.1 节)。
 */
export type AppLifecycleState =
  | 'starting'
  | 'running-with-window'
  | 'running-tray-only'
  | 'exiting';

/**
 * Window 信息 — 由 Main 维护,广播给所有 Renderer 用于显示窗口列表。
 * Renderer 不直接持有 BrowserWindow 引用,只通过 windowId 引用。
 */
export interface WindowInfo {
  /** UUID,持久且不复用 */
  id: string;
  /**
   * 显示给用户的编号,从 1 开始单调递增,关闭后不复用。
   * 应用每次启动时从 1 重新开始 (软件定义书 6.7 节)。
   */
  number: number;
  /** Electron BrowserWindow 的内部 ID,Main 用它定位 webContents */
  electronWindowId: number;
}
