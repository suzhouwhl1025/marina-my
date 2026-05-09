/**
 * @file src/main/path-manager.ts
 * @purpose 管理路径的三栏分类 (收藏 / 临时 / 最近) 与 Path 状态机。
 *
 * @关键设计:
 * - Path 状态机参见 软件定义书.md 8.2 节:
 *     最近 ↔ 临时 (有/无终端在跑)
 *     最近/临时 → 收藏 (用户主动加入)
 *     收藏 → 最近 (用户移除收藏)
 * - "最近"分类容量上限 30,按 lastUsedAt 降序,自动淘汰最旧的
 * - 所有变更通过 evt:path:tree-updated 广播给所有 Renderer
 *
 * @对应文档章节: 软件定义书.md 第 4 (心智模型)、5.1.1、8.2、11.1 节
 *
 * @不要在这里做的事:
 * - 不要直接操作磁盘 (通过 PersistenceManager)
 * - 不要管理 session 列表 (Session 与 Path 通过 sessionIds 字段关联,
 *   但 session 实例本身归 SessionManager 管)
 *
 * @CP-1 阶段:
 * 此文件先占位,CP-2 (核心数据模型) 阶段完整实现,届时会有详尽的状态机
 * 单元测试 (AGENTS.md 5.3 节"必测"清单)。
 */

/**
 * STUB: 在 CP-2 完整实现。
 */
export class PathManager {
  // CP-2 实现 addBookmark / removeBookmark / renameBookmark / reorderBookmarks /
  // attachSession / detachSession / getTree / removeFromRecent 等方法。
}
