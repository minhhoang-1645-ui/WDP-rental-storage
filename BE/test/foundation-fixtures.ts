import { deflateSync } from 'node:zlib';
export function signature() {
  const crc = (data: Buffer) => {
    let n = 0xffffffff;
    for (const byte of data) {
      n ^= byte;
      for (let i = 0; i < 8; i++) n = n & 1 ? (n >>> 1) ^ 0xedb88320 : n >>> 1;
    }
    return (n ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const kind = Buffer.from(type),
      len = Buffer.alloc(4),
      check = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    check.writeUInt32BE(crc(Buffer.concat([kind, data])));
    return Buffer.concat([len, kind, data, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(300);
  header.writeUInt32BE(100, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.alloc(120100);
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 300; x++) {
      const at = y * 1201 + 1 + x * 4;
      pixels.fill(Math.abs(y - (30 + (x % 60))) < 2 ? 40 : 255, at, at + 3);
      pixels[at + 3] = 255;
    }
  return (
    'data:image/png;base64,' +
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(pixels)),
      chunk('IEND', Buffer.alloc(0)),
    ]).toString('base64')
  );
}
