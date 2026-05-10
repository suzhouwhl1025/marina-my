/**
 * @file src/main/index.ts
 * @purpose Electron 主进程 entry。装配所有 manager,初始化持久化 store,
 *   注册 IPC 层,管理应用整体生命周期。
 *
 * @关键设计:
 * - 单实例锁: 第二次启动 EasyTerm.exe 转发到已运行实例新开窗口
 *   (软件定义书 5.1.6, AGENTS.md CP-1 完成标志)
 * - window-all-closed 不调用 app.quit() — 应用进入"纯托盘模式"
 *   (软件定义书 8.1, 9.2.1)
 * - 退出仅来自 TrayManager 的"完全退出"或 cmd:app:quit IPC,通过 isQuitting
 *   标志区分"窗口关"与"应用真退出"
 * - 启动顺序:单实例锁 → app.whenReady → JsonStore 创建 → manager.initialize
 *   并行 → installIpcLayer → trayManager.init → 创建首窗
 * - 退出顺序:before-quit → SessionManager.shutdown → manager.flush 等待
 *   持久化落盘 → will-quit → trayManager.destroy
 *
 * @对应文档章节: 软件定义书.md 8.1、9.2.1;AGENTS.md 检查点 1/2
 */
import { app, nativeTheme } from 'electron';
import { join } from 'node:path';
import { WindowManager } from './window-manager';
import { TrayManager } from './tray';
import { SessionManager } from './session-manager';
import { PathManager } from './path-manager';
import { SettingsManager, DEFAULT_SETTINGS } from './settings-manager';
import { TemplatesManager } from './templates-manager';
import { JsonStore } from './persistence';
import { installIpcLayer } from './ipc';
import { getPlatformAdapter } from './platform';
import type {
  BookmarksFile,
  RecentFile,
  Settings,
  TemplatesFile,
} from '@shared/types';

let isQuitting = false;

export function setQuitting(): void {
  isQuitting = true;
}

export function getIsQuitting(): boolean {
  return isQuitting;
}

function bootstrap(): void {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  const windowManager = new WindowManager();

  // 数据目录:%APPDATA%\EasyTerm (软件定义书 11)
  // 注:在 app.whenReady 之前调 app.getPath('userData') 是合法的,
  // Electron 31 在 ready 前就把它解析好了
  const dataDir = app.getPath('userData');
  const settingsStore = new JsonStore<Settings>(join(dataDir, 'settings.json'));
  const bookmarksStore = new JsonStore<BookmarksFile>(join(dataDir, 'bookmarks.json'));
  const recentStore = new JsonStore<RecentFile>(join(dataDir, 'recent.json'));
  const templatesStore = new JsonStore<TemplatesFile>(join(dataDir, 'templates.json'));

  const settingsManager = new SettingsManager(settingsStore);
  const pathManager = new PathManager(bookmarksStore, recentStore);
  const templatesManager = new TemplatesManager(templatesStore);
  const sessionManager = new SessionManager(
    windowManager,
    pathManager,
    templatesManager,
    settingsManager,
  );
  const trayManager = new TrayManager(windowManager, sessionManager, settingsManager);

  // second-instance:在已运行实例新开窗口
  app.on('second-instance', () => {
    try {
      windowManager.createWindow();
    } catch (err) {
      console.error('[main] second-instance: createWindow failed', err);
    }
  });

  app.on('window-all-closed', () => {
    // window-all-closed 不退出:进入"纯托盘模式"
    // isQuitting=true 时 (主动 quit) 让默认行为执行,继续走 before-quit / will-quit
    if (isQuitting) return;
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.whenReady().then(async () => {
    try {
      // 加载持久化数据,故意串行 (settings 决定后续行为,先加载)
      const settingsSrc = await settingsManager.initialize();
      console.info(`[main] settings loaded from: ${settingsSrc}`);
      await pathManager.initialize();
      const tmplSrc = await templatesManager.initialize();
      console.info(`[main] templates loaded from: ${tmplSrc}`);

      installIpcLayer({
        windowManager,
        pathManager,
        settingsManager,
        sessionManager,
        templatesManager,
      });

      // ── 设置副作用 wiring ─────────────────────────────
      // settings.behavior.autoStart 改变 → 触发 OS Run 表写入
      // settings.appearance.followSystemTheme 改变 → 立即同步当前系统颜色
      // nativeTheme.updated → 若 followSystemTheme=true 则切对应主题
      const platformAdapter = process.platform === 'win32' ? getPlatformAdapter() : null;

      const applyFollowSystemTheme = (): void => {
        const s = settingsManager.get();
        if (!s.appearance.followSystemTheme) return;
        const desired = nativeTheme.shouldUseDarkColors ? 'rose-pine' : 'rose-pine-dawn';
        if (s.appearance.theme !== desired) {
          settingsManager.update({ appearance: { theme: desired } });
        }
      };

      settingsManager.on('settingsChanged', (e: { changedKeys: string[]; settings: Settings }) => {
        if (e.changedKeys.includes('behavior.autoStart') && platformAdapter) {
          platformAdapter
            .setAutoStart(e.settings.behavior.autoStart)
            .catch((err) => console.warn('[main] setAutoStart failed', err));
        }
        if (e.changedKeys.includes('appearance.followSystemTheme')) {
          applyFollowSystemTheme();
        }
      });

      nativeTheme.on('updated', () => applyFollowSystemTheme());

      // 启动时执行一次 followSystemTheme 同步 (用户上次开了它,系统主题
      // 改了,启动时该立即对齐)
      applyFollowSystemTheme();

      trayManager.init();
      windowManager.createWindow();
    } catch (err) {
      console.error('[main] bootstrap failed:', err);
      // 启动失败不应让用户看到空白进程,直接退出
      app.exit(1);
    }
  });

  // 真退出前:杀 PTY、刷盘、销毁托盘
  app.on('will-quit', async () => {
    if (!isQuitting) return; // 防御性:不该走到这,因为 before-quit 已 set
    sessionManager.shutdown();
    try {
      // 等数据落盘最多 1 秒,避免无限 block
      const flushAll = Promise.all([
        settingsManager.flush(),
        pathManager.flush(),
        templatesManager.flush(),
      ]);
      await Promise.race([
        flushAll,
        new Promise<void>((resolve) => setTimeout(resolve, 1000)),
      ]);
    } catch (err) {
      console.warn('[main] flush during quit failed:', err);
    }
    trayManager.destroy();
  });

  // 防止 unhandled rejection 静默吞错
  process.on('unhandledRejection', (reason) => {
    console.error('[main] unhandledRejection:', reason);
  });

  // ESLint:DEFAULT_SETTINGS 引用让 import 不被 tree-shake 警告。
  // 实际我们不在这用,留这一行为了明示编译期依赖。
  void DEFAULT_SETTINGS;
}

bootstrap();
