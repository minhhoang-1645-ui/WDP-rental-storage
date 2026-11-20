import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { snapshotHash, validateSignature } from './signature.js';

describe('drawn signature input', () => {
  const makePng = () => {
  const crc = (data: Buffer) => { let n = 0xffffffff; for (const byte of data) { n ^= byte; for (let i = 0; i < 8; i++) n = n & 1 ? (n >>> 1) ^ 0xedb88320 : n >>> 1; } return (n ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const kind = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc(Buffer.concat([kind, data]))); return Buffer.concat([length, kind, data, checksum]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(300, 0); header.writeUInt32BE(100, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc(100 * (300 * 4 + 1)); for (let y = 0; y < 100; y++) for (let x = 0; x < 300; x++) { const at = y * 1201 + 1 + x * 4; pixels.fill(Math.abs(y - (30 + (x % 60))) < 2 ? 40 : 255, at, at + 3); pixels[at + 3] = 255; }
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
};
  const png = makePng();
  it('requires consent and rejects unsupported or oversized images', () => {
    expect(() => validateSignature({ agreed: false, signatureImage: png })).toThrow(BadRequestException);
    expect(() => validateSignature({ agreed: true, signatureImage: 'data:image/svg+xml;base64,AAAA' })).toThrow(BadRequestException);
    expect(() => validateSignature({ agreed: true, signatureImage: `data:image/png;base64,${'A'.repeat(200_004)}` })).toThrow(BadRequestException);
    expect(() => validateSignature({ agreed: true, signatureImage: `data:image/png;base64,${Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(100)]).toString('base64')}` })).toThrow(BadRequestException);
    expect(validateSignature({ agreed: true, signatureImage: png })).toBe(png);
  });
  it('detects changes to the document being approved', () => {
    expect(snapshotHash({ b: { y: 1, x: 2 }, a: [3] })).toBe(snapshotHash({ a: [3], b: { x: 2, y: 1 } }));
    expect(snapshotHash({ amount: 1 })).toBe(snapshotHash({ amount: 1 }));
    expect(snapshotHash({ amount: 1 })).not.toBe(snapshotHash({ amount: 2 }));
  });
});
