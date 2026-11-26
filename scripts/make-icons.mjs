// 외부 의존성 없이 PWA 아이콘(PNG)을 생성한다. (node scripts/make-icons.mjs)
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BG = [47, 91, 234];
const WHITE = [255, 255, 255];
const ORANGE = [255, 154, 61];
const INK = [30, 58, 160];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, painter) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const SS = 4;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = (x + (sx + 0.5) / SS) / size, v = (y + (sy + 0.5) / SS) / size;
        const c = painter(u, v);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
      }
      const n = SS * SS, o = y * (size * 4 + 1) + 1 + x * 4;
      const al = a / n;
      raw[o] = al ? Math.round(r / (a / 255)) : 0;
      raw[o + 1] = al ? Math.round(g / (a / 255)) : 0;
      raw[o + 2] = al ? Math.round(b / (a / 255)) : 0;
      raw[o + 3] = Math.round(al);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const inRoundRect = (u, v, x0, y0, x1, y1, r) => {
  const cx = Math.max(x0 + r, Math.min(u, x1 - r)), cy = Math.max(y0 + r, Math.min(v, y1 - r));
  return (u - cx) ** 2 + (v - cy) ** 2 <= r * r && u >= x0 && u <= x1 && v >= y0 && v <= y1;
};
// 펼친 책 + 별(경험치) 모티프. scale<1 이면 maskable 안전영역 안으로 축소.
function painter(full, scale) {
  return (u0, v0) => {
    const u = 0.5 + (u0 - 0.5) / scale, v = 0.5 + (v0 - 0.5) / scale;
    const bg = full ? true : inRoundRect(u0, v0, 0, 0, 1, 1, 0.22);
    if (!bg) return null;
    // 별
    const sx = u - 0.72, sy = v - 0.27, sr = Math.hypot(sx, sy);
    const ang = Math.atan2(sy, sx);
    const starR = 0.085 * (0.55 + 0.45 * Math.cos(5 * (ang + Math.PI / 2)));
    if (sr < starR + 0.02) return ORANGE;
    // 책 두 쪽
    const left = inRoundRect(u, v, 0.2, 0.36, 0.49, 0.78, 0.04);
    const right = inRoundRect(u, v, 0.51, 0.36, 0.8, 0.78, 0.04);
    if (left || right) {
      // 줄글
      const lines = [0.47, 0.56, 0.65];
      for (const ly of lines) {
        if (Math.abs(v - ly) < 0.012 && ((u > 0.26 && u < 0.44) || (u > 0.56 && u < 0.74))) return INK;
      }
      return WHITE;
    }
    return BG;
  };
}
writeFileSync('public/icon-192.png', png(192, painter(false, 1)));
writeFileSync('public/icon-512.png', png(512, painter(false, 1)));
writeFileSync('public/icon-512-maskable.png', png(512, painter(true, 0.78)));
writeFileSync('public/apple-touch-icon.png', png(180, painter(true, 0.9)));
writeFileSync('public/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="rgb(${BG})"/><rect x="20" y="36" width="29" height="42" rx="4" fill="#fff"/><rect x="51" y="36" width="29" height="42" rx="4" fill="#fff"/><g stroke="rgb(${INK})" stroke-width="2.4" stroke-linecap="round"><path d="M26 47h18M26 56h18M26 65h18M56 47h18M56 56h18M56 65h18"/></g><circle cx="72" cy="27" r="9" fill="rgb(${ORANGE})"/></svg>`);
console.log('icons written');
