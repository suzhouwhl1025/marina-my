#!/usr/bin/env node
// scripts/repro-cursor-1.mjs
//
// CURSOR-1 / BETA-019 假设复现脚本。
//
// 假设:Marina main 端 scrollback ring buffer 2MB 上限,超出从头部 \n
// 边界裁切。alt-buffer 类应用启动时发一次 ?1049h(进 alt) + ?25l(隐光
// 标),之后只发绘画指令。一旦 scrollback 涨过 2MB,开头那几个字节(包
// 括 ?1049h 和 ?25l)被裁掉。关窗口重开,renderer 重挂 + 重放,xterm
// 收不到 ?1049h → 留在 normal buffer + 默认 cursorBlink:true + 光标可见。
//
// 复现步骤:
//   1. 在 Marina 一个 tab 内 `node scripts/repro-cursor-1.mjs`
//   2. 等屏幕显示 "Emitted X bytes (> 2MB)" 后停帧
//   3. 关 Marina 窗口(托盘里点退出或直接关窗口都行,session 不会被杀)
//   4. 重开 Marina,切回这个 tab
//
// 预期(假设成立):
//   - 屏幕上出现一个**可见且闪烁**的光标(因为 ?25l + ?1049h 都丢了)
//   - 内容看起来"对得上原画面"但被画在了 normal buffer 里(可滚动查看历史)
// 预期(假设不成立):
//   - 屏幕完好,光标隐藏,体验和切走之前一致
//
// 按 Ctrl+C 退出,会清理 alt-buffer 并显光标。

const TARGET_BYTES = 3 * 1024 * 1024; // 3MB,稳过 2MB 截断阈值
const FRAME_LINES = 30;
const FRAME_INTERVAL_MS = 8; // 极速刷,几秒内打满

if (!process.stdout.isTTY) {
  console.error('repro-cursor-1: stdout is not a TTY — script makes no sense in non-TTY context.');
  process.exit(1);
}

let totalBytes = 0;
let stopped = false;
let frame = 0;

function write(s) {
  process.stdout.write(s);
  totalBytes += Buffer.byteLength(s, 'utf8');
}

function cleanup() {
  if (stopped) return;
  stopped = true;
  // 显光标 + 退 alt-buffer
  process.stdout.write('\x1b[?25h\x1b[?1049l');
  process.stdout.write(`repro-cursor-1: emitted ${totalBytes} bytes total\n`);
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('SIGHUP', cleanup);

// ── 一次性 setup:进 alt-buffer + 隐光标
// 这两条**只发一次**,之后再也不发 — 模拟 Claude Code / Codex 的实际行为。
// 如果 Marina 截断把它们裁掉,后续帧里没有任何东西能恢复它们。
write('\x1b[?1049h'); // enter alternate screen buffer
write('\x1b[?25l');   // hide cursor (DECTCEM)

const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function drawFrame() {
  if (stopped) return;

  let buf = '';
  // home + erase display(典型 TUI 全帧重绘)
  buf += '\x1b[H\x1b[2J';

  for (let i = 0; i < FRAME_LINES; i++) {
    const fg = 31 + (i % 7);
    const sp = spinner[(frame + i) % spinner.length];
    buf += `\x1b[${fg}m  ${sp}  frame ${frame.toString().padStart(5)}  line ${i.toString().padStart(2)}  ─  scrollback ≈ ${(totalBytes / 1024).toFixed(0).padStart(5)} KB\x1b[m\r\n`;
  }
  buf += `\r\n\x1b[K──── total emitted: ${(totalBytes / 1024).toFixed(0)} KB  /  target ${(TARGET_BYTES / 1024).toFixed(0)} KB ────`;

  write(buf);
  frame++;

  if (totalBytes >= TARGET_BYTES) {
    // 已经稳过阈值。停帧并画一个稳态终屏,**不再发任何字节**。
    // 这样 Marina scrollback 末尾保持稳定不变,关窗口重开看到的就是这个画面
    // (或者按假设——看到的是 normal buffer + 闪光标 + 画错地方的内容)。
    let final = '';
    final += '\x1b[H\x1b[2J';
    final += `\x1b[1;32m  ✓ Emitted ${totalBytes} bytes  (> 2MB Marina scrollback cap)\x1b[m\r\n\r\n`;
    final += `\x1b[37m  现在:\r\n`;
    final += `    1. 关闭 Marina 窗口\r\n`;
    final += `    2. 从托盘 / 任务栏重新打开 Marina\r\n`;
    final += `    3. 切回这个 tab\r\n\r\n`;
    final += `  如果 CURSOR-1 假设正确:\r\n`;
    final += `    • 屏幕上会出现一个闪烁的光标(?25l 被截断)\r\n`;
    final += `    • 内容停在 normal buffer 里,可上下滚动看到 scrollback(?1049h 被截断)\r\n\r\n`;
    final += `  如果假设错误:\r\n`;
    final += `    • 屏幕完好,无光标,无法滚动(仍在 alt-buffer 内)\r\n\r\n`;
    final += `  Ctrl+C 退出本脚本。\x1b[m`;
    write(final);
    return;
  }

  setTimeout(drawFrame, FRAME_INTERVAL_MS);
}

drawFrame();
