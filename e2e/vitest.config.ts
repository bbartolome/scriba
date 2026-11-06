import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only the mock server's Vitest tests. The Playwright specs in tests/ run under `npm run e2e`.
    include: ['fixtures/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
