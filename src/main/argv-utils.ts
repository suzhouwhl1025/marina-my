/**
 * @file src/main/argv-utils.ts
 * @purpose 进程入口 argv 的小型纯函数解析器,独立成模块以便单测
 *   (import main/index.ts 会触发 bootstrap → 调用 electron.app,
 *    在测试环境无法运行)。
 */

/**
 * 解析 argv,提取 `--open-here <path>` 紧跟的目录路径。
 *
 * Explorer 右键 "在 Marina 终端中打开" 通过注册表 command 字段调用
 * `Marina.exe --open-here "<path>"`。冷启动和 second-instance handler 都会
 * 走这个 parser。packed / dev 模式 argv 形态略有不同,但 indexOf 都能正确定位。
 *
 * @returns 找到则返回紧跟的字符串;无 / 紧跟项是另一个 flag 时返回 null
 */
export function parseOpenHere(argv: readonly string[]): string | null {
  const idx = argv.indexOf('--open-here');
  if (idx < 0 || idx + 1 >= argv.length) return null;
  const path = argv[idx + 1];
  if (!path || path.startsWith('--')) return null;
  return path;
}
