/**
 * @file src/main/platform/index.ts
 * @purpose 平台适配层接口定义 + 平台分发。所有平台特定 API 必须通过此处
 *   暴露的 PlatformAdapter 接口调用,核心代码不允许写 process.platform 判断。
 *
 * @关键设计:
 * - V1 只完整实现 Windows,macOS / Linux 抛 "Not implemented",留给社区
 *   贡献 (软件定义书 12.1、12.2)
 * - 接口故意小,每个方法对应一个具体的系统能力,便于 mock 测试
 *
 * @对应文档章节: 软件定义书.md 第 12 章 (跨平台策略);AGENTS.md 第 8 章
 *
 * @AGENTS.md 8.1: V1 只测 Windows,但代码必须 platform-aware。
 *   不许在 windows.ts 之外的地方写 process.platform === 'win32' 判断。
 */
import type { WindowsAdapter } from './windows';

/**
 * 一个被检测到的 shell 的元数据。
 */
export interface ShellInfo {
  /** 内部 id,如 'pwsh' / 'powershell' / 'cmd' */
  id: string;
  /** 显示名,如 'PowerShell 7' / 'Windows PowerShell' / 'Command Prompt' */
  displayName: string;
  /** 可执行文件绝对路径 */
  executablePath: string;
}

/**
 * 平台适配器接口 (软件定义书 12.2)。
 * macOS / Linux 实现保留接口,运行时 throw 'Not implemented'。
 */
export interface PlatformAdapter {
  /** 检测系统中可用的 shell */
  detectShells(): Promise<ShellInfo[]>;

  /** 给定一个 shell,返回启动它时注入 OSC 1337 hook 所需的额外参数和环境变量 */
  buildShellLaunchParams(
    shell: ShellInfo,
    hookFilePath: string,
  ): { args: string[]; env: Record<string, string> };

  /** 注册 / 注销文件管理器右键集成 (V1.2 启用) */
  registerFileManagerIntegration(appExePath: string): Promise<void>;
  unregisterFileManagerIntegration(): Promise<void>;

  /** 查询进程当前工作目录 (OSC 1337 hook 失败时的兜底) */
  getProcessCwd(pid: number): Promise<string | null>;

  /** 设置 / 查询开机启动 */
  setAutoStart(enabled: boolean): Promise<void>;
  isAutoStartEnabled(): Promise<boolean>;
}

/**
 * 当前平台的 adapter 单例。延迟到首次访问时初始化,避免在测试中误触发副作用。
 *
 * @throws 在 macOS / Linux 上 throw "Not implemented yet. Contributions welcome!"
 */
let cachedAdapter: PlatformAdapter | null = null;

export function getPlatformAdapter(): PlatformAdapter {
  if (cachedAdapter) return cachedAdapter;

  // 仅此处允许检查 process.platform。其他模块必须通过 getPlatformAdapter()。
  // 动态 import 让 macos.ts / linux.ts 在 Windows 上不被加载,减少打包体积
  // 并避免他们的 import 副作用 (虽然目前是 throw,未来可能有真实代码)。
  switch (process.platform) {
    case 'win32': {
      // require 同步加载,确保启动时拿到 adapter (Electron main 允许 CJS 风格)
      // electron-vite 在 main 配置 externalizeDepsPlugin 后这是允许的
      const { WindowsAdapter: Adapter } = require('./windows') as {
        WindowsAdapter: new () => WindowsAdapter;
      };
      cachedAdapter = new Adapter();
      return cachedAdapter;
    }
    case 'darwin':
      throw new Error(
        '[platform] macOS support not implemented yet. Contributions welcome! ' +
          'See CONTRIBUTING.md and src/main/platform/macos.ts.',
      );
    case 'linux':
      throw new Error(
        '[platform] Linux support not implemented yet. Contributions welcome! ' +
          'See CONTRIBUTING.md and src/main/platform/linux.ts.',
      );
    default:
      throw new Error(`[platform] Unsupported process.platform: "${process.platform}"`);
  }
}

/**
 * 仅供测试使用,允许把 adapter 替换成 mock。
 * 生产代码不许调用。
 */
export function __setPlatformAdapterForTest(adapter: PlatformAdapter | null): void {
  cachedAdapter = adapter;
}
