/**
 * @file src/shared/css-var-fallback.test.ts
 * @purpose enforce 软件定义书 5.1.9 红线 — 所有 CSS var() 调用必须带
 *   fallback。否则在某主题下若该变量未定义,xterm 字体颜色 / sidebar
 *   边框等会渲染成黑色 / undefined 导致 UI 大面积塌陷。
 *
 *   stylelint 内置规则不覆盖这一条,所以我们在 vitest 阶段强制检查;
 *   CI 也会跑 npm test,等价于 lint 阶段的 fail-fast。
 *
 * @关键设计:
 * - 用 regex 匹配 `var(--xxx)` 形式 (无逗号 = 无 fallback);
 *   `var(--xxx, ...)` 视为合法
 * - 扫整个 src/ 下的 .css 文件 (renderer/styles + 未来其它位置)
 * - 错误信息精确到 文件:行号 + 完整 var() 表达式,方便修
 *
 * @对应文档章节: 软件定义书.md 5.1.9 节
 *
 * @不在 src/renderer 写的原因:vitest.config 把 include 限定在 main/shared,
 * renderer 下不会被收集。这是项目级红线测试,放 shared 合适。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');

function findCssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...findCssFiles(full));
    } else if (entry.endsWith('.css')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * 把 CSS 注释 `/* ... *\/` (含跨行) 替换成等长空白,既能保留行号映射,
 * 又能确保注释里的 "var()" 文档描述不被当成真实代码。
 */
function stripCssComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

function findVarUsagesWithoutFallback(rawContent: string): Array<{
  line: number;
  expression: string;
}> {
  const content = stripCssComments(rawContent);
  const out: Array<{ line: number; expression: string }> = [];
  const lines = content.split('\n');
  // 匹配单行内的 var(...);深嵌套不会出现在我们的 CSS 里。
  const re = /var\(([^()]*)\)/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const inner = m[1] ?? '';
      if (!inner.includes(',')) {
        out.push({ line: i + 1, expression: m[0] });
      }
    }
  }
  return out;
}

describe('CSS var() fallback enforcement (软件定义书 5.1.9)', () => {
  const files = findCssFiles(SRC_ROOT);

  it('找到至少一个 CSS 文件', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = file.replace(SRC_ROOT, 'src').replace(/\\/g, '/');
    it(`${rel} 中所有 var() 都必须带 fallback`, () => {
      const content = readFileSync(file, 'utf-8');
      const offenders = findVarUsagesWithoutFallback(content);
      if (offenders.length > 0) {
        const lines = offenders
          .map((o) => `  ${rel}:${o.line}: ${o.expression}`)
          .join('\n');
        throw new Error(
          `发现 ${offenders.length} 处缺少 fallback 的 var() 调用:\n${lines}\n\n` +
            `按软件定义书 5.1.9,所有 var() 必须写成 var(--name, #f0f) 形式;\n` +
            `#f0f 是兜底色 — 当变量未定义时渲染成显眼的洋红色,便于发现遗漏。`,
        );
      }
    });
  }
});
