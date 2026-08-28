// ---------------------------------------------------------------------------
// logi - Sinh icon PWA (Stage 6 Task 2)
//
// Không dùng thư viện vẽ ảnh: icon chỉ là vài hình chữ nhật, viết thẳng PNG
// bằng zlib còn nhẹ hơn kéo về một dependency chỉ để chạy một lần.
//
// Chạy lại:  node scripts/make-icons.mjs
// ---------------------------------------------------------------------------
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [10, 10, 10];
// Bốn cột theo màu category, đúng thứ tự trong CATEGORY_COLOR.
const BARS = [
  [0x63, 0x66, 0xf1], // learn
  [0xf5, 0x9e, 0x0b], // work
  [0x10, 0xb9, 0x81], // fitness
  [0xec, 0x48, 0x99], // leisure
];
/** Chiều cao từng cột, theo tỉ lệ vùng vẽ. */
const HEIGHTS = [1, 0.62, 0.84, 0.44];

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  // Vùng an toàn cho icon maskable: nội dung nằm trong 60% giữa, vì iOS và
  // Android đều cắt góc theo hình dạng riêng của hệ điều hành.
  const pad = Math.round(size * 0.2);
  const inner = size - pad * 2;
  const gap = Math.round(inner * 0.07);
  const barW = Math.round((inner - gap * (BARS.length - 1)) / BARS.length);

  const px = (x, y) => {
    for (let i = 0; i < BARS.length; i++) {
      const x0 = pad + i * (barW + gap);
      const h = Math.round(inner * HEIGHTS[i]);
      const y0 = pad + inner - h;
      if (x >= x0 && x < x0 + barW && y >= y0 && y < pad + inner) return BARS[i];
    }
    return BG;
  };

  // Mỗi hàng bắt đầu bằng 1 byte filter type 0 (None).
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = px(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolour RGB

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
for (const size of [192, 512, 180]) {
  const file = size === 180 ? 'public/apple-touch-icon.png' : `public/icons/icon-${size}.png`;
  writeFileSync(file, png(size));
  console.log(`${file}  ${size}×${size}`);
}
