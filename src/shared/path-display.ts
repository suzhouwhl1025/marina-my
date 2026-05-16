/**
 * @file src/shared/path-display.ts
 * @purpose BETA-014:Sidebar 同 category 内末级文件夹同名时,自动补父目录区分。
 *
 *   例:`projA/src` 和 `projB/src` 都显示为 `src` 时,
 *       变成 `projA/src` 和 `projB/src`(逐级加父目录,直到唯一)。
 *
 *   - 已手动命名(node.displayName)的路径不参与去重(用户优先级最高)
 *   - 用 normalizePath 把 / 和 \ 统一(Windows 兼容)
 *   - 纯函数,可单测;不依赖 React / store
 *
 * @对应文档章节: 软件定义书.md 6.2(左侧栏);工单 BETA-014
 */
import type { PathNode } from '@shared/types';

/**
 * 同 category 内同名末级去重。返回 nodeId → displayName 映射。
 *
 * 算法:
 * 1. 第一轮:每个未手动命名的节点取 lastSegment 作为候选名,手动命名的节点
 *    直接定稿(用 node.displayName)。
 * 2. 检查未定稿节点里是否有重复候选名,有的话给重复者每人多吃一段父目录,
 *    形成 `parent/last`,继续下一轮检查。
 * 3. 一直加,直到所有未定稿节点的候选名都唯一,或已到根(无法再加)。
 *
 * 不跨 category 比较:同名 `src` 同时出现在收藏栏和系统栏不互相去重 — 视觉上
 * 它们已被栏分隔。
 */
export function disambiguatePathNames(
  nodes: readonly PathNode[],
): Map<string, string> {
  const result = new Map<string, string>();

  // 已手动命名的直接定稿
  const candidates: { node: PathNode; segments: string[]; depth: number }[] = [];
  for (const n of nodes) {
    if (n.displayName !== undefined && n.displayName !== '') {
      result.set(n.id, n.displayName);
      continue;
    }
    const segments = splitPath(n.path);
    candidates.push({ node: n, segments, depth: 1 });
  }

  // 逐轮加深直到候选名唯一
  const MAX_DEPTH = 16; // 保险阀,防极端情况死循环
  for (let round = 0; round < MAX_DEPTH; round++) {
    const nameToCands = new Map<string, typeof candidates>();
    for (const c of candidates) {
      const name = formatName(c.segments, c.depth);
      if (!nameToCands.has(name)) nameToCands.set(name, []);
      nameToCands.get(name)!.push(c);
    }

    const unresolved: typeof candidates = [];
    for (const [name, cands] of nameToCands) {
      if (cands.length === 1) {
        result.set(cands[0]!.node.id, name);
      } else {
        // 同名 → 还能再加父目录的继续加,已经吃到根的也只能定稿(没办法)
        for (const c of cands) {
          if (c.depth < c.segments.length) {
            c.depth += 1;
            unresolved.push(c);
          } else {
            result.set(c.node.id, name); // 已到根,接受同名
          }
        }
      }
    }

    if (unresolved.length === 0) break;
    candidates.length = 0;
    candidates.push(...unresolved);
  }

  // 极端情况兜底:超过 MAX_DEPTH 仍有冲突时,直接定稿剩余
  for (const c of candidates) {
    if (!result.has(c.node.id)) {
      result.set(c.node.id, formatName(c.segments, c.depth));
    }
  }
  return result;
}

/**
 * 把 path 拆段。同时识别 / 和 \;Windows 盘符段(如 "C:")作为一段保留。
 * 末段不能是空串(尾斜杠剥掉)。
 */
function splitPath(p: string): string[] {
  // 替换 \ 为 / 后 split,过滤空段
  const segs = p.replace(/\\/g, '/').split('/').filter((s) => s.length > 0);
  return segs;
}

/**
 * 给定 segments 与"取末尾几段",拼成显示名。
 * depth=1 → 'last'
 * depth=2 → 'parent/last'
 * depth=N → 'segN/.../last'
 */
function formatName(segments: string[], depth: number): string {
  if (segments.length === 0) return '';
  const take = Math.min(depth, segments.length);
  const tail = segments.slice(segments.length - take);
  return tail.join('/');
}
