/**
 * @file src/main/window-manager.ts
 * @purpose 管理所有 BrowserWindow 实例的创建、销毁、编号分配。
 *   维护 windowId ↔ BrowserWindow 的映射,响应"新开窗口 / 关闭所有窗口 /
 *   聚焦某窗口"等命令,并广播窗口列表变化事件。
 *
 * @关键设计:
 * - 窗口编号 (Window 1, Window 2, ...) 单调递增,关闭后不复用
 *   (软件定义书 6.7 节)
 * - 应用每次启动 nextWindowNumber 从 1 重新开始 (运行时分配,不持久化)
 * - 每个 windowId 用 UUID v4,不复用,与 Electron 内部的 webContents.id 解耦
 * - 通过 query string ?windowId=... 把 ID 传给 Renderer (ipc-protocol 2.2)
 *
 * @对应文档章节: 软件定义书.md 第 6.7、9.2、9.3 节;ipc-protocol.md 第 2.2 节
 *
 * @不要在这里做的事:
 * - 不要管理 session 的 owner 关系 (那是 SessionManager 职责)
 * - 不要存储窗口的视图状态如选中路径 — 那是 Renderer 私有,Main 不存
 *
 * @CP-1 状态:
 * 当前为占位 stub。完整实现在 CP-1 后续 commit (跑通最小窗口后) 加入,
 * 包括 createWindow / closeWindow / focusWindow / list / handle close events。
 */
import type { WindowInfo } from '@shared/types';

/**
 * 窗口管理器接口。CP-1 后续 commit 实现真正的类。
 */
export interface IWindowManager {
  createWindow(): WindowInfo;
  closeWindow(windowId: string): void;
  list(): WindowInfo[];
  focus(windowId: string): boolean;
}

/**
 * STUB: 后续在 CP-1 实现。当前导出仅占位,使其他模块在引用时不报错。
 *
 * @throws 调用任何方法都会 throw,提醒开发者实现尚未完成。
 */
export class WindowManager implements IWindowManager {
  createWindow(): WindowInfo {
    throw new Error('[WindowManager] createWindow not implemented (CP-1 in progress)');
  }
  closeWindow(_windowId: string): void {
    throw new Error('[WindowManager] closeWindow not implemented (CP-1 in progress)');
  }
  list(): WindowInfo[] {
    return [];
  }
  focus(_windowId: string): boolean {
    throw new Error('[WindowManager] focus not implemented (CP-1 in progress)');
  }
}
