import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC emits the decorator metadata that NestJS dependency injection reads. It takes the
  // decorator flags from tsconfig.json, so the test transform matches the build.
  plugins: [swc.vite()],
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 60_000,
    // The type tests (`*.test-d.ts`) are checked by tsc, so a shape that drifts fails the suite.
    typecheck: {
      enabled: true,
      include: ['test/**/*.test-d.ts'],
      tsconfig: './tsconfig.typecheck.json',
    },
  },
});
