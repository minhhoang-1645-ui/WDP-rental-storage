import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/service-offerings.recovery.spec.ts'],
    fileParallelism: false,
    testTimeout: 45000,
    hookTimeout: 45000,
  },
});
