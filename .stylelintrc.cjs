/**
 * stylelint 配置 — 基础风格规则。
 *
 * 注:软件定义书 5.1.9 要求"所有 var() 调用必须带 #f0f fallback,防止
 * 未定义变量污染"。stylelint 内置规则不直接覆盖这一条,因此此规则由
 * src/renderer/styles/global.css.test.ts 单独 enforce (npm test 执行)。
 *
 * @对应文档章节: 软件定义书.md 5.1.9 节
 */
module.exports = {
  extends: ['stylelint-config-standard'],
  rules: {
    // 主题用大量未声明变量,关掉相关误报
    'no-descending-specificity': null,
    'declaration-block-no-redundant-longhand-properties': null,
    // 主题选择器 [data-theme="..."] 不需要警告
    'selector-attribute-quotes': 'always',
    // CSS 字体名带空格用单引号包,允许
    'font-family-name-quotes': 'always-where-recommended',
    // 不强求 alpha-value 用百分比 (rgba(0,0,0,0.35) 可读性更好)
    'alpha-value-notation': null,
    // 我们用 14 个 Rose Pine 色调,允许任意 hex 命名
    'color-function-notation': null,
    'color-hex-length': null,
    // 短横线连接的 class / id 命名跟着 BEM-ish 写法
    'selector-class-pattern': null,
    'selector-id-pattern': null,
    'keyframes-name-pattern': null,
    // 允许 vendor prefix (xterm 自带 -webkit-* 滚动条)
    'value-no-vendor-prefix': null,
    'property-no-vendor-prefix': null,
    'selector-no-vendor-prefix': null,
    'at-rule-no-vendor-prefix': null,
  },
};
