// Génère les icônes PNG de la PWA (pas de dépendance externe : encodeur PNG maison).
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public');

// --- Encodeur PNG minimal (RGBA) ---
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // raw avec filtre 0 par ligne
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// --- Dessin d'une icône "voiture" ---
function px(rgba, w, x, y, [r, g, b, a = 255]) {
  const i = (y * w + x) * 4;
  rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a;
}
const NAVY = [15, 23, 42];
const CYAN = [56, 189, 248];

function drawIcon(size, pad = 0) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // fond navy plein (coins arrondis)
      const u = x / size;
      const v = y / size;
      let col = NAVY;

      // zone utile (pour maskable on garde la voiture dans 1-2*pad)
      const s = 1 - 2 * pad;
      const cu = (u - pad) / s;
      const cv = (v - pad) / s;

      const inBody = cu > 0.16 && cu < 0.84 && cv > 0.44 && cv < 0.62;
      const inCabin = cu > 0.32 && cu < 0.68 && cv > 0.3 && cv < 0.46;
      const w1 = Math.hypot(cu - 0.33, cv - 0.63) < 0.085;
      const w2 = Math.hypot(cu - 0.67, cv - 0.63) < 0.085;
      const w1in = Math.hypot(cu - 0.33, cv - 0.63) < 0.04;
      const w2in = Math.hypot(cu - 0.67, cv - 0.63) < 0.04;

      if (cu >= 0 && cu <= 1 && cv >= 0 && cv <= 1) {
        if ((inBody || inCabin || w1 || w2) && !w1in && !w2in) col = CYAN;
      }
      px(rgba, size, x, y, col);
    }
  }
  return encodePNG(size, size, rgba);
}

fs.writeFileSync(path.join(OUT, 'icon-192.png'), drawIcon(192));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), drawIcon(512));
fs.writeFileSync(path.join(OUT, 'icon-maskable-512.png'), drawIcon(512, 0.12)); // safe area
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), drawIcon(180));
console.log('✅ Icônes PWA générées dans public/');
