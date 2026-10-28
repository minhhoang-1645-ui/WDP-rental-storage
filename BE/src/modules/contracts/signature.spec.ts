import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { snapshotHash, validateSignature } from './signature.js';

describe('drawn signature input', () => {
  const png = `data:image/png;base64,${Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(100)]).toString('base64')}`;
  it('requires consent and rejects unsupported or oversized images', () => {
    expect(() => validateSignature({ agreed: false, signatureImage: png })).toThrow(BadRequestException);
    expect(() => validateSignature({ agreed: true, signatureImage: 'data:image/svg+xml;base64,AAAA' })).toThrow(BadRequestException);
    expect(() => validateSignature({ agreed: true, signatureImage: `data:image/png;base64,${'A'.repeat(200_004)}` })).toThrow(BadRequestException);
    expect(validateSignature({ agreed: true, signatureImage: png })).toBe(png);
  });
  it('detects changes to the document being approved', () => {
    expect(snapshotHash({ amount: 1 })).toBe(snapshotHash({ amount: 1 }));
    expect(snapshotHash({ amount: 1 })).not.toBe(snapshotHash({ amount: 2 }));
  });
});
