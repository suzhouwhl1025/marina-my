/* eslint-env node */
// ESLint 配置 — 三个 override 块分别覆盖 main / preload (Node) 与 renderer (DOM + React)。
// 不要在这里塞业务规则,业务规则放进各自子目录的 .eslintrc 增量配置 (后续如需)。
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  env: {
    es2022: true,
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  ignorePatterns: ['out/', 'dist/', 'release/', 'node_modules/', 'coverage/', '*.cjs'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/consistent-type-imports': 'error',
    'no-console': 'off',
  },
  overrides: [
    {
      files: ['src/main/**/*.ts', 'src/preload/**/*.ts'],
      env: { node: true, browser: false },
    },
    {
      files: ['src/renderer/**/*.{ts,tsx}'],
      env: { browser: true, node: false },
      extends: [
        'plugin:react/recommended',
        'plugin:react-hooks/recommended',
        'prettier',
      ],
      settings: { react: { version: 'detect' } },
      rules: {
        'react/react-in-jsx-scope': 'off',
      },
    },
    {
      files: ['**/*.test.ts', '**/*.spec.ts'],
      env: { node: true },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
};
