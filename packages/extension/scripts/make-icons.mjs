// Generates the PNG icons the Manifest V3 manifest references. Runs before
// `vite build` so the build has something to bundle. Pure Node: writes
// minimal blue PNGs with Node's `zlib.deflateSync`, no external deps.
//
// Re-run any time you want to tweak the icon — delete src/icons/icon*.png
// first if you want them regenerated (the script is idempotent otherwise).

import { deflateSync } from 'node:zlib';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname ?? '.', '..');
const iconsDir = resolve(root, 'src/icons');
mkdirSync(iconsDir, { recursive: true });

// Brand blue matches the web theme (#1a73ff).
const FG = [0x1a, 0x73, 0xff];
const BG = [0x05, 0x06, 0x07]; // near-black

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Draw a square with a dashed border + centered "OB" wordmark. We don't ship a
// font, so the wordmark is rendered as a few hand-plotted pixels at each size.
function makePng(size) {
  const bytesPerRow = 1 + size * 3; // filter byte + RGB
  const raw = Buffer.alloc(bytesPerRow * size);

  const pad = Math.max(1, Math.round(size * 0.1));
  const isBorder = (x, y) => {
    if (x < pad || x >= size - pad || y < pad || y >= size - pad) return false;
    const onEdge =
      x === pad || x === size - pad - 1 || y === pad || y === size - pad - 1;
    if (!onEdge) return false;
    // Dashed: skip every other 2-pixel span.
    const t = x === pad || x === size - pad - 1 ? y : x;
    return Math.floor(t / 2) % 2 === 0;
  };

  // Simple 3x5 pixel font for O and B, scaled up.
  const font = {
    O: ['111', '101', '101', '101', '111'],
    B: ['110', '101', '110', '101', '110'],
  };

  const scale = Math.max(1, Math.floor((size - pad * 4) / 10));
  const textW = (3 + 1 + 3) * scale; // "OB" with 1-col gap
  const textH = 5 * scale;
  const textX = Math.floor((size - textW) / 2);
  const textY = Math.floor((size - textH) / 2);

  const isText = (x, y) => {
    const lx = x - textX;
    const ly = y - textY;
    if (lx < 0 || ly < 0 || ly >= textH) return false;
    const col = Math.floor(lx / scale);
    const row = Math.floor(ly / scale);
    if (col < 3) return font.O[row]?.[col] === '1';
    if (col === 3) return false; // gap
    if (col < 7) return font.B[row]?.[col - 4] === '1';
    return false;
  };

  for (let y = 0; y < size; y++) {
    raw[y * bytesPerRow] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const px = 1 + y * bytesPerRow + x * 3;
      const fg = isText(x, y) || isBorder(x, y);
      const color = fg ? FG : BG;
      raw[px] = color[0];
      raw[px + 1] = color[1];
      raw[px + 2] = color[2];
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = deflateSync(raw);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 48, 128]) {
  const path = resolve(iconsDir, `icon${size}.png`);
  if (existsSync(path)) continue; // idempotent
  writeFileSync(path, makePng(size));
  console.log(`Wrote ${path}`);
}
