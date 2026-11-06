import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The mock server's Vitest tests, and the sample check on the repo's examples/ folder. The
    // Playwright specs in tests/ run under `npm run e2e`.
    include: ['fixtures/**/*.test.ts', 'examples-check/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
