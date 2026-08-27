'use strict';
// 트레이용 템플릿 아이콘(16/32px)을 만든다.
// macOS 템플릿 이미지는 알파 채널만 쓰이고 색은 OS가 테마에 맞춰 칠한다.
// 외부 이미지 파일을 두지 않으려고 PNG를 직접 인코딩한다.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** size×size 코인(링) 모양을 그린 RGBA 픽셀을 PNG 버퍼로 만든다. */
function coinPng(size) {
  const c = (size - 1) / 2;
  const outer = size * 0.46;
  const inner = size * 0.30;
  const ss = 4;                    // 슈퍼샘플링으로 계단현상 완화

  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);   // 맨 앞 1바이트는 필터 타입(0)
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss - 0.5;
          const py = y + (sy + 0.5) / ss - 0.5;
          const d = Math.hypot(px - c, py - c);
          if (d <= outer && d >= inner) hits++;
        }
      }
      const a = Math.round((hits / (ss * ss)) * 255);
      const o = 1 + x * 4;
      row[o] = 0; row[o + 1] = 0; row[o + 2] = 0; row[o + 3] = a;
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // color type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = path.join(__dirname, '..', 'src', 'assets');
fs.mkdirSync(dir, { recursive: true });
for (const [name, size] of [['trayTemplate.png', 16], ['trayTemplate@2x.png', 32]]) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, coinPng(size));
  console.log(`${name}  ${size}x${size}  ${fs.statSync(p).size}B`);
}
