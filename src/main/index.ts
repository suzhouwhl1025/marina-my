/**
 * @file src/main/index.ts
 * @purpose Electron 主进程 entry。负责守护进程的整体启动 / 退出流程,
 *   包括单实例锁、应用事件监听、子模块初始化。
 *
 * @关键设计:
 * - 单实例锁: 第二次启动 EasyTerm.exe 转发到已运行实例新开窗口
 *   (软件定义书 5.1.6, AGENTS.md CP-1 完成标志)
 * - window-all-closed 事件不调用 app.quit() — 应用进入"纯托盘模式",
 *   生命周期独立于任何窗口 (软件定义书 8.1, 9.2.1)
 * - 退出仅来自托盘菜单"完全退出"主动触发,不和窗口生命周期绑定
 * - 子模块 (WindowManager / TrayManager / SessionManager 等) 的初始化
 *   顺序固定,详见 bootstrap() 内的注释
 *
 * @对应文档章节: 软件定义书.md 第 8.1、9.2.1 节;AGENTS.md 检查点 1
 *
 * @不要在这里做的事:
 * - 不要直接创建 BrowserWindow (那是 WindowManager 的职责)
 * - 不要直接 spawn PTY (那是 SessionManager 的职责)
 * - 不要写业务逻辑 — 这个文件只是装配 + 生命周期事件
 *
 * @CP-1 状态:
 * 当前为最小可运行骨架,bootstrap 仅创建一个空白窗口验证 Electron 启动正常。
 * 完整 CP-1 功能 (xterm.js、托盘、单实例锁等) 将在后续 commit 中分别加入。
 */
import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 是否处于开发模式。electron-vite 在 dev 时设置 ELECTRON_RENDERER_URL
 * 指向 http://localhost:5173,build 后此变量不存在,渲染端从本地静态文件加载。
 */
const isDev = !!process.env.ELECTRON_RENDERER_URL;

/**
 * 当前已知最近活动的窗口 (用于单实例 second-instance 事件聚焦)。
 * CP-1 后续 WindowManager 接管后此变量将被移除。
 */
let primaryWindow: BrowserWindow | null = null;

/**
 * 创建一个最小窗口。CP-1 完整版本会通过 WindowManager 创建并附带
 * windowId/number/menu 等元数据,目前先用最简形式跑通。
 */
function createBootstrapWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    show: false,
    title: 'EasyTerm',
    backgroundColor: '#191724', // Rose Pine base — 软件定义书 5.1.9
    webPreferences: {
      preload: resolve(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // node-pty 后续接入需要,沙箱模式无法使用 IPC handle 中的原生模块
    },
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    void win.loadFile(resolve(__dirname, '../renderer/index.html'));
  }

  return win;
}

/**
 * 装配子系统并打开第一个窗口。
 *
 * 顺序敏感性:
 * 1. 单实例锁必须在所有子系统初始化前申请,失败立刻 quit
 * 2. PlatformAdapter / PathManager / SessionManager 等的初始化在 CP-2/CP-3 加入
 * 3. 创建首个窗口必须在 ready 事件之后
 */
function bootstrap(): void {
  // 单实例锁: 第二次启动转发已运行实例新开窗口
  // (CP-1 完成标志: AGENTS.md 4.2 检查点 1)
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    // CP-1 后续 WindowManager 接入后改为创建新窗口;此处先聚焦主窗口
    if (primaryWindow) {
      if (primaryWindow.isMinimized()) primaryWindow.restore();
      primaryWindow.focus();
    }
  });

  app.whenReady().then(() => {
    primaryWindow = createBootstrapWindow();
  });

  // 关闭所有窗口绝不退出应用 (软件定义书 9.2.1)
  // 即使在 macOS / Linux,我们也保持托盘常驻 (软件定义书 12.3)
  app.on('window-all-closed', () => {
    // 故意留空 — 进入"纯托盘模式" (CP-1 后续接入托盘后才有真正意义)
  });
}

bootstrap();
