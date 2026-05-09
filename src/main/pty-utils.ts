/**
 * @file src/main/pty-utils.ts
 * @purpose PtyController 用到的几个纯函数,抽到独立模块便于单测
 *   (PtyController 本身依赖 node-pty / Electron,直接测成本高)。
 *
 * @关键设计:
 * - 这里只放无副作用、不依赖 Electron / node-pty 的工具函数
 * - 添加新函数前问自己"能不能在不 mock electron 的前提下测",不能就别加
 *
 * @对应文档章节:
 *   软件定义书.md 5.1.4 (终端体验);
 *   ipc-protocol.md 7.1 (InvalidDimensions 错误码)
 */

/**
 * 把 process.env 里的 undefined 值过滤掉,转成 node-pty 要的纯 string 字典。
 * 同时剔除指定的环境变量 (例如 Electron 私有变量,避免污染子 shell)。
 *
 * @param sourceEnv 源环境变量 (通常是 process.env)
 * @param skipKeys 要排除的 key 集合
 */
export function buildSpawnEnv(
  sourceEnv: NodeJS.ProcessEnv,
  skipKeys: Iterable<string> = [],
): Record<string, string> {
  const skip = new Set(skipKeys);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(sourceEnv)) {
    if (typeof value === 'string' && !skip.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * 把可能不合法的 cols/rows 约束到 [min, max] 之间。非整数 / NaN / 越界
 * 都会被替换成 fallback 值。
 *
 * 边界来自 ConPTY 经验:0 或负数会让 ConPTY 抛错;过大 (> 1000) 会内存
 * 占用激增。fallback 80x24 是终端事实标准。
 */
export function validateDimensions(
  cols: number,
  rows: number,
  options: { minCols?: number; maxCols?: number; minRows?: number; maxRows?: number } = {},
): { cols: number; rows: number } {
  const minCols = options.minCols ?? 1;
  const maxCols = options.maxCols ?? 1000;
  const minRows = options.minRows ?? 1;
  const maxRows = options.maxRows ?? 1000;
  return {
    cols: clamp(cols, minCols, maxCols, 80),
    rows: clamp(rows, minRows, maxRows, 24),
  };
}

function clamp(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
