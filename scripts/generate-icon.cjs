#!/usr/bin/env node
/**
 * Marina 应用图标生成器 — 从托盘图标设计 (tray.ts generateTrayIcon) 升级
 * 到 256x256,作为 win.icon。
 *
 * 用法:
 *   node scripts/generate-icon.cjs
 *
 * 产物:build/icon.png (256x256 RGBA)
 *
 * electron-builder 在 build:win 时接受 PNG ≥256×256,自动转成多尺寸 ICO。
 *
 * 不依赖任何 npm 包(AGENTS.md 1.2 边界 2):内置一个最小 PNG 编码器,
 * 渲染管线纯 JS。
 *
 * 设计与 build/icon.svg 同源 — Rose Pine 深紫底 + Iris ">_" 提示符 + Gold 光标。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZE = 256;
const OUT_PNG = path.resolve(__dirname, '..', 'build', 'icon.png');
const OUT_ICO = path.resolve(__dirname, '..', 'build', 'icon.ico');

// 调色板(与 src/main/tray.ts 同源,从 SVG 取色)
const BG_TOP = rgb('#1f1d2e');
const BG_BOTTOM = rgb('#191724');
const INNER_BORDER = rgb('#26233a');
const IRIS = rgb('#c4a7e7');
const GOLD = rgb('#f6c177');

// 圆角矩形参数(对应 SVG 256x256, rx=56)
const CORNER_RADIUS = 56;
const INNER_INSET = 8;
const INNER_BORDER_WIDTH = 2;
const INNER_CORNER_RADIUS = 48;

// ">" 提示符 polyline
const PROMPT_POINTS = [
  [72, 92],
  [116, 128],
  [72, 164],
];
const PROMPT_STROKE = 20;

// "_" 下划线
const UNDERSCORE = { x1: 140, y1: 172, x2: 196, y2: 172, stroke: 20 };

// gold 光标 (20x44 在 (140, 92),圆角 3)
const CURSOR = { x: 140, y: 92, w: 20, h: 44, r: 3 };

// ────────────────────────────────────────────────────────────────
// PNG 编码 (无依赖) — 先声明,后面 main() 用
// ────────────────────────────────────────────────────────────────

const CRC_TABLE = makeCrcTable();

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(rgbaBuf, w, h) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type 6 = RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace
  const rowBytes = w * 4;
  const raw = Buffer.alloc(h * (rowBytes + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (rowBytes + 1)] = 0;
    rgbaBuf.copy(raw, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ────────────────────────────────────────────────────────────────
// 几何 helper
// ────────────────────────────────────────────────────────────────

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function makePixelOps() {
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  function setPixel(x, y, [r, g, b], a) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    const i = (y * SIZE + x) * 4;
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  }
  return { buf, setPixel };
}

function insideRoundedRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x >= x0 + w || y >= y0 + h) return false;
  const lx = x0 + r;
  const ry = y0 + r;
  const rx = x0 + w - 1 - r;
  const by = y0 + h - 1 - r;
  let cx;
  let cy;
  if (x < lx && y < ry) { cx = lx; cy = ry; }
  else if (x > rx && y < ry) { cx = rx; cy = ry; }
  else if (x < lx && y > by) { cx = lx; cy = by; }
  else if (x > rx && y > by) { cx = rx; cy = by; }
  else return true;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function strokeRoundedRect(setPixel, x0, y0, w, h, r, sw, color) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const inside = insideRoundedRect(x, y, x0, y0, w, h, r);
      const innerInside = insideRoundedRect(
        x, y, x0 + sw, y0 + sw, w - 2 * sw, h - 2 * sw, Math.max(0, r - sw),
      );
      if (inside && !innerInside) setPixel(x, y, color, 0xff);
    }
  }
}

function strokeSegment(setPixel, [x1, y1], [x2, y2], stroke, color) {
  const half = stroke / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let t = ((x - x1) * dx + (y - y1) * dy) / len2;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      const px = x1 + t * dx;
      const py = y1 + t * dy;
      const ddx = x - px;
      const ddy = y - py;
      if (ddx * ddx + ddy * ddy <= half * half) {
        setPixel(x, y, color, 0xff);
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────
// 主流程
// ────────────────────────────────────────────────────────────────

function main() {
  const { buf, setPixel } = makePixelOps();

  // 1. 圆角矩形背景(线性渐变 top → bottom)
  for (let y = 0; y < SIZE; y++) {
    const t = y / (SIZE - 1);
    const r = (BG_TOP[0] * (1 - t) + BG_BOTTOM[0] * t) | 0;
    const g = (BG_TOP[1] * (1 - t) + BG_BOTTOM[1] * t) | 0;
    const b = (BG_TOP[2] * (1 - t) + BG_BOTTOM[2] * t) | 0;
    for (let x = 0; x < SIZE; x++) {
      if (insideRoundedRect(x, y, 0, 0, SIZE, SIZE, CORNER_RADIUS)) {
        setPixel(x, y, [r, g, b], 0xff);
      }
    }
  }

  // 2. 内边框 — (8,8)-(248,248) 圆角 48 上画 2px stroke
  strokeRoundedRect(
    setPixel,
    INNER_INSET,
    INNER_INSET,
    SIZE - 2 * INNER_INSET,
    SIZE - 2 * INNER_INSET,
    INNER_CORNER_RADIUS,
    INNER_BORDER_WIDTH,
    INNER_BORDER,
  );

  // 3. ">" 提示符 — 两段 polyline
  strokeSegment(setPixel, PROMPT_POINTS[0], PROMPT_POINTS[1], PROMPT_STROKE, IRIS);
  strokeSegment(setPixel, PROMPT_POINTS[1], PROMPT_POINTS[2], PROMPT_STROKE, IRIS);

  // 4. "_" 下划线
  strokeSegment(
    setPixel,
    [UNDERSCORE.x1, UNDERSCORE.y1],
    [UNDERSCORE.x2, UNDERSCORE.y2],
    UNDERSCORE.stroke,
    IRIS,
  );

  // 5. Gold 光标方块
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (insideRoundedRect(x, y, CURSOR.x, CURSOR.y, CURSOR.w, CURSOR.h, CURSOR.r)) {
        setPixel(x, y, GOLD, 0xff);
      }
    }
  }

  const pngData = encodePng(buf, SIZE, SIZE);
  fs.mkdirSync(path.dirname(OUT_PNG), { recursive: true });
  fs.writeFileSync(OUT_PNG, pngData);
  console.log(`[generate-icon] wrote ${OUT_PNG} (${SIZE}x${SIZE})`);

  // 同时输出 ICO (PNG-in-ICO 容器):NSIS 的 installerIcon / uninstallerIcon
  // 不接 PNG,必须 ICO。Windows Vista+ 支持 ICO 内嵌 PNG,直接把上面 PNG
  // 包一层就能复用同一资源。
  fs.writeFileSync(OUT_ICO, encodeIco(pngData, SIZE));
  console.log(`[generate-icon] wrote ${OUT_ICO} (PNG-in-ICO, ${SIZE}x${SIZE})`);
}

/**
 * 把单张 PNG 包装为 ICO 文件(Windows Vista+ 接受 PNG payload)。
 * ICONDIR (6 bytes) + ICONDIRENTRY (16 bytes) + PNG payload。
 *
 * ICONDIR:
 *   uint16 reserved = 0
 *   uint16 type = 1 (ICO)
 *   uint16 count = 1
 * ICONDIRENTRY:
 *   uint8  width  (0 = 256)
 *   uint8  height (0 = 256)
 *   uint8  colorCount = 0 (无调色板)
 *   uint8  reserved = 0
 *   uint16 planes = 1
 *   uint16 bitCount = 32
 *   uint32 bytesInRes = PNG length
 *   uint32 imageOffset = 22 (sizeof header)
 */
function encodeIco(pngBuf, sizePx) {
  const header = Buffer.alloc(6 + 16);
  // ICONDIR
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  // ICONDIRENTRY
  header.writeUInt8(sizePx === 256 ? 0 : sizePx, 6);
  header.writeUInt8(sizePx === 256 ? 0 : sizePx, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(pngBuf.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, pngBuf]);
}

main();
