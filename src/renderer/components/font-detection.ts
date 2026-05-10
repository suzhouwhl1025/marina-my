/**
 * @file src/renderer/components/font-detection.ts
 * @purpose 用 Canvas measureText 探测系统中是否真装了某个字体。
 *
 *   软件定义书 6.6.2 要求"终端字体"下拉显示"从系统检测的等宽字体列表"。
 *   真枚举系统字体需要 Win32 EnumFontFamiliesEx 或 npm 包 (font-list 等),
 *   会引入新依赖 (AGENTS.md 1.2 边界 2 禁止)。改用预设白名单 + Canvas
 *   probe 的折衷:零依赖、足够实用、未来可升级到真枚举。
 *
 * @检测原理:
 *   测量同一段文字在 (1) "目标字体" + sentinel fallback 下的宽度
 *   vs (2) 单独 sentinel fallback 下的宽度。如果系统真装了目标字体,
 *   渲染会用它,宽度通常与 fallback 不同;否则两者一致 (都用了 fallback)。
 *   这是浏览器侧字体探测的标准技巧。
 *
 * @限制:
 *   - 字体度量恰好与 fallback 完全一致的字体会被误判为"未装"
 *     (V1 接受这一边角)
 *   - sentinel 选 monospace + serif + sans-serif 三个,任一不同就视为存在
 */

const PROBE_TEXT = 'mmmmmmmmmlli';
const SENTINELS = ['monospace', 'serif', 'sans-serif'];

interface ProbeContext {
  ctx: CanvasRenderingContext2D;
  baseline: Map<string, number>;
}

let cachedCtx: ProbeContext | null = null;

function getProbeContext(): ProbeContext {
  if (cachedCtx) return cachedCtx;
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 20;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('[font-detection] 浏览器不支持 2D Canvas — 异常环境');
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  // 用相对大字号让差异放大
  const baseline = new Map<string, number>();
  for (const sentinel of SENTINELS) {
    ctx.font = `40px ${sentinel}`;
    baseline.set(sentinel, ctx.measureText(PROBE_TEXT).width);
  }
  cachedCtx = { ctx, baseline };
  return cachedCtx;
}

/**
 * 探测系统是否安装了指定字体。
 *
 * @param family 字体名 (如 "Cascadia Mono")
 * @returns true 表示三个 sentinel 中至少一个测量结果与 baseline 不同
 */
export function isFontAvailable(family: string): boolean {
  if (!family) return false;
  // 系统泛型字体永远算"装了"(monospace / serif 等)
  if (SENTINELS.includes(family.toLowerCase())) return true;

  let probe: ProbeContext;
  try {
    probe = getProbeContext();
  } catch {
    return false;
  }
  for (const sentinel of SENTINELS) {
    probe.ctx.font = `40px "${family}", ${sentinel}`;
    const width = probe.ctx.measureText(PROBE_TEXT).width;
    if (Math.abs(width - probe.baseline.get(sentinel)!) > 0.5) {
      return true;
    }
  }
  return false;
}

/**
 * 终端等宽字体白名单 (按用户偏好顺序)。
 * 探测命中的展示给用户;命中后保留原样;未命中也展示但加 "(未装)" 标注。
 */
export const TERMINAL_FONT_WHITELIST: string[] = [
  'Cascadia Mono',
  'Cascadia Code',
  'Cascadia Code PL',
  'JetBrains Mono',
  'JetBrains Mono NL',
  'Consolas',
  'Source Code Pro',
  'Fira Code',
  'Fira Mono',
  'Hack',
  'IBM Plex Mono',
  'Roboto Mono',
  'LXGW WenKai Mono',
  'Sarasa Mono SC',
  'Lucida Console',
  'Courier New',
];

/**
 * UI 字体白名单 (中英文兼顾,含中文体)。
 */
export const UI_FONT_WHITELIST: string[] = [
  'LXGW WenKai',
  'Microsoft YaHei UI',
  'Microsoft YaHei',
  'Segoe UI',
  'PingFang SC',
  'Source Han Sans CN',
  'Noto Sans CJK SC',
  'Helvetica Neue',
  'system-ui',
];

/**
 * 探测一个白名单中的所有字体,返回 { family, installed } 列表。
 * 顺序保留白名单顺序。
 */
export function probeFonts(
  whitelist: string[],
): Array<{ family: string; installed: boolean }> {
  return whitelist.map((family) => ({
    family,
    installed: isFontAvailable(family),
  }));
}
