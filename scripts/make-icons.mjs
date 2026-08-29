// ---------------------------------------------------------------------------
// logi - Sinh icon PWA (Stage 6 Task 2)
//
// Không dùng thư viện vẽ ảnh: icon chỉ là vài thanh bo tròn, viết thẳng PNG
// bằng zlib còn nhẹ hơn kéo về một dependency chỉ để chạy một lần.
//
// Hình phải khớp `public/favicon.svg` (bộ icon dùng chung cho mọi app trong
// ws/app): nền accent đặc, 4 thanh sóng âm màu trắng vẽ trên lưới 24x24.
// PNG cố tình vẽ tràn viền (không bo góc) vì Android/iOS tự cắt theo mặt nạ
// của hệ điều hành - bo sẵn sẽ lòi ra viền trắng.
//
// Chạy lại:  node scripts/make-icons.mjs
// ---------------------------------------------------------------------------
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [0xd9, 0x77, 0x06]; // accent của logi (amber 600)
const FG = [0xff, 0xff, 0xff];

// Toạ độ trên lưới 24x24, giống hệt các <path> trong favicon.svg.
const STROKE = 2.4;
const BARS = [
  { x: 5.0, y0: 9.5, y1: 14.5 },
  { x: 9.7, y0: 6.0, y1: 18.0 },
  { x: 14.3, y0: 8.5, y1: 15.5 },
  { x: 19.0, y0: 4.5, y1: 19.5 },
];

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
  const pad = size * 0.2;
  const unit = (size - pad * 2) / 24;
  const to = (v) => pad + v * unit;
  const r = (STROKE / 2) * unit;

  // Thanh bo tròn = hình chữ nhật cộng hai nửa tròn ở hai đầu.
  const caps = BARS.map((b) => ({
    cx: to(b.x),
    top: to(b.y0) + r,
    bot: to(b.y1) - r,
    r,
  }));

  const px = (x, y) => {
    for (const c of caps) {
      const dx = x + 0.5 - c.cx;
      if (Math.abs(dx) > c.r) continue;
      if (y + 0.5 >= c.top && y + 0.5 <= c.bot) return FG;
      const dy = y + 0.5 < c.top ? y + 0.5 - c.top : y + 0.5 - c.bot;
      if (dx * dx + dy * dy <= c.r * c.r) return FG;
    }
    return BG;
  };

  // Mỗi hàng bắt đầu bằng 1 byte filter type 0 (None).
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const [rr, gg, bb] = px(x, y);
      raw[o++] = rr;
      raw[o++] = gg;
      raw[o++] = bb;
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
  console.log(`${file}  ${size}x${size}`);
}
