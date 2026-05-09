/**
 * @file src/main/platform/windows.ts
 * @purpose Windows 平台适配器实现。V1 唯一完整实现的平台。
 *
 * @关键设计:
 * - 检测顺序: pwsh.exe (PowerShell 7+) > powershell.exe (Windows PowerShell 5.1)
 *   > cmd.exe > Git Bash (软件定义书 5.1.10、12.2)
 * - 进程 cwd 查询: NtQueryInformationProcess + 读 PEB (软件定义书 12.2)
 *   该 API 是 NTAPI,需要从 ntdll.dll 通过 ffi 调用,V1 接受 5 秒一次的轮询频率
 * - Explorer 右键集成: 写 HKCU\Software\Classes\Directory\shell\... (V1.2 启用)
 * - 开机启动: app.setLoginItemSettings({ openAtLogin }) (Electron 内置,跨平台)
 *
 * @对应文档章节: 软件定义书.md 12.2;AGENTS.md 第 8 章
 *
 * @CP-1 阶段:
 * 各方法仍是 throw stub。CP-3 (cwd 跟踪) 和 CP-4 (设置完整化) 实现真正逻辑。
 */
import type { PlatformAdapter, ShellInfo } from './index';

export class WindowsAdapter implements PlatformAdapter {
  async detectShells(): Promise<ShellInfo[]> {
    throw new Error('[WindowsAdapter] detectShells not implemented (CP-3)');
  }

  buildShellLaunchParams(
    _shell: ShellInfo,
    _hookFilePath: string,
  ): { args: string[]; env: Record<string, string> } {
    throw new Error('[WindowsAdapter] buildShellLaunchParams not implemented (CP-3)');
  }

  async registerFileManagerIntegration(_appExePath: string): Promise<void> {
    throw new Error(
      '[WindowsAdapter] registerFileManagerIntegration not implemented (V1.2)',
    );
  }

  async unregisterFileManagerIntegration(): Promise<void> {
    throw new Error(
      '[WindowsAdapter] unregisterFileManagerIntegration not implemented (V1.2)',
    );
  }

  async getProcessCwd(_pid: number): Promise<string | null> {
    throw new Error('[WindowsAdapter] getProcessCwd not implemented (CP-3)');
  }

  async setAutoStart(_enabled: boolean): Promise<void> {
    throw new Error('[WindowsAdapter] setAutoStart not implemented (CP-4)');
  }

  async isAutoStartEnabled(): Promise<boolean> {
    throw new Error('[WindowsAdapter] isAutoStartEnabled not implemented (CP-4)');
  }
}
