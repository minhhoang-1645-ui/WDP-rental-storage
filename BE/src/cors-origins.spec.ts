import { describe, expect, it } from 'vitest';
import { corsOrigins } from './cors-origins.js';

describe('browser origins for web and Expo development', () => {
  it('uses only explicitly configured origins when supplied', () => {
    expect(corsOrigins(' https://app.example.org/path, https://app.example.org/,javascript:alert(1), invalid ', true, ['192.168.1.8'])).toEqual(['https://app.example.org']);
  });
  it('includes the current local server address only in development', () => {
    expect(corsOrigins(undefined, true, ['192.168.1.8', 'not-an-ip'])).toContain('http://192.168.1.8:8081');
    expect(corsOrigins(undefined, false, ['192.168.1.8'])).not.toContain('http://192.168.1.8:8081');
    expect(corsOrigins(undefined, true, ['192.168.1.8'])).not.toContain('http://attacker.example.org:8081');
  });
});
