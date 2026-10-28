import { Buffer } from "node:buffer";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(here, "../public/icons");

const BACKGROUND = [11, 15, 20, 255];
const BARS = [
  { color: [45, 212, 191, 255], weight: 60 },
  { color: [96, 165, 250, 255], weight: 25 },
  { color: [244, 114, 182, 255], weight: 15 },
];

const SUPERSAMPLE = 3;
const CORNER_RADIUS = 0.16;

function insideRoundedRect(x, y, rect, radius) {
  const { left, top, width, height } = rect;
  const r = Math.min(radius, width / 2, height / 2);
  const cx = Math.min(Math.max(x, left + r), left + width - r);
  const cy = Math.min(Math.max(y, top + r), top + height - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function renderBitmap(size, scale) {
  const bars = [];
  const gap = size * 0.035;
  const totalHeight = size * 0.46 * scale;
  const usedHeight = totalHeight - gap * (BARS.length - 1);
  const weightTotal = BARS.reduce((sum, bar) => sum + bar.weight, 0);
  const width = size * 0.44 * scale;
  const left = (size - width) / 2;

  let top = (size - totalHeight) / 2;
  for (const bar of BARS) {
    const height = (usedHeight * bar.weight) / weightTotal;
    bars.push({ color: bar.color, rect: { left, top, width, height } });
    top += height + gap;
  }

  return { bars, radius: Math.min(width, usedHeight) * CORNER_RADIUS };
}

function drawPixel(buffer, size, x, y, color) {
  const index = (y * size + x) * 4;
  buffer[index] = color[0];
  buffer[index + 1] = color[1];
  buffer[index + 2] = color[2];
  buffer[index + 3] = color[3];
}

function renderIcon(size, markScale) {
  const big = size * SUPERSAMPLE;
  const buffer = new Uint8Array(big * big * 4);
  const { bars, radius } = renderBitmap(big, markScale);

  for (let y = 0; y < big; y += 1) {
    for (let x = 0; x < big; x += 1) {
      let color = BACKGROUND;
      for (const bar of bars) {
        if (insideRoundedRect(x, y, bar.rect, radius)) {
          color = bar.color;
          break;
        }
      }
      drawPixel(buffer, big, x, y, color);
    }
  }

  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sums = [0, 0, 0, 0];
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const index = ((y * SUPERSAMPLE + sy) * big + (x * SUPERSAMPLE + sx)) * 4;
          sums[0] += buffer[index] ?? 0;
          sums[1] += buffer[index + 1] ?? 0;
          sums[2] += buffer[index + 2] ?? 0;
          sums[3] += buffer[index + 3] ?? 0;
        }
      }
      const samples = SUPERSAMPLE * SUPERSAMPLE;
      const outIndex = (y * size + x) * 4;
      out[outIndex] = Math.round(sums[0] / samples);
      out[outIndex + 1] = Math.round(sums[1] / samples);
      out[outIndex + 2] = Math.round(sums[2] / samples);
      out[outIndex + 3] = Math.round(sums[3] / samples);
    }
  }

  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(outputDir, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, markScale: 1 },
  { file: "icon-512.png", size: 512, markScale: 1 },
  { file: "maskable-512.png", size: 512, markScale: 0.72 },
  { file: "apple-touch-icon.png", size: 180, markScale: 1 },
];

for (const target of targets) {
  const png = encodePng(target.size, renderIcon(target.size, target.markScale));
  writeFileSync(resolve(outputDir, target.file), png);
  process.stdout.write(
    `wrote icons/${target.file} (${target.size}x${target.size}, ${png.length} bytes)\n`,
  );
}
