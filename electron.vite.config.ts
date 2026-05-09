/**
 * @file electron.vite.config.ts
 * @purpose electron-vite 主配置:为 main / preload / renderer 三个进程分别配
 *   置 Vite 构建。dev 时 Vite 提供 HMR,build 时输出到 out/。
 *
 * @关键设计:
 * - 三个 entry: src/main/index.ts, src/preload/index.ts, src/renderer/index.html
 * - 共享类型从 src/shared/ 引入,通过 @shared/* alias 暴露给三方
 * - main / preload 走 Node 环境(externalize node-pty 等原生模块)
 * - renderer 走浏览器环境(React + xterm.js)
 *
 * @对应文档章节: 软件定义书.md 第 9 章 (技术架构)、AGENTS.md 第 11 章 (工作流)
 *
 * @构建产物:
 * - out/main/index.js — Electron 主进程 entry,被 package.json "main" 字段引用
 * - out/preload/index.js — 预加载脚本
 * - out/renderer/ — 静态资源 + 入口 index.html
 */
import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main'),
      },
    },
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer'),
      },
    },
    build: {
      outDir: '../../out/renderer',
      emptyOutDir: true,
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') },
      },
    },
    server: {
      port: 5173,
    },
  },
});
