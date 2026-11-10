// Renders the PWA PNG icons (a warm glowing disc on a dark square) without
// external image tools. Run with: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x16, 0x11, 0x0f];
// Radial gradient stops: [offset 0..1 of radius, r, g, b, alpha]
const STOPS = [
  [0, 0xff, 0xf4, 0xe0, 1],
  [0.35, 0xff, 0xb3, 0x47, 1],
  [0.75, 0xff, 0x6a, 0x2a, 1],
  [1, 0xff, 0x6a, 0x2a, 0],
];

function gradient(t) {
  for (let i = 1; i < STOPS.length; i++) {
    const [o1, ...a] = STOPS[i - 1];
    const [o2, ...b] = STOPS[i];
    if (t <= o2) {
      const k = (t - o1) / (o2 - o1);
      return a.map((v, j) => v + (b[j] - v) * k);
    }
  }
  return STOPS.at(-1).slice(1);
}

function render(size) {
  const rows = [];
  const cx = size / 2;
  const cy = size * 0.5;
  const radius = size * (200 / 512);
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3); // filter byte + RGB
    for (let x = 0; x < size; x++) {
      // Gradient centre sits slightly above the disc centre, like the SVG.
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - size * 0.46) / radius;
      const inDisc = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= radius;
      let px = BG;
      if (inDisc) {
        const [r, g, b, a] = gradient(Math.min(d, 1));
        px = [r, g, b].map((v, i) => Math.round(v * a + BG[i] * (1 - a)));
      }
      row.set(px, 1 + x * 3);
    }
    rows.push(row);
  }
  return png(size, Buffer.concat(rows));
}

function png(size, raw) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), render(size));
}
console.log('Wrote public/icon-192.png and public/icon-512.png');
