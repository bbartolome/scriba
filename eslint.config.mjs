import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import moduleBoundaries from './tools/eslint/module-boundaries.mjs';

const scriba = { rules: { 'module-boundaries': moduleBoundaries } };

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.angular/**',
      '**/coverage/**',
      // Third-party agent skills and the gitignored spike are outside this repo's lint scope.
      '.claude/**',
      'prototypes/**',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['apps/api/src/modules/**/*.ts', 'apps/web/src/app/features/**/*.ts'],
    plugins: { scriba },
    rules: { 'scriba/module-boundaries': 'error' },
  },
  // provisional: survey 16 §7 item 5 (the examples check joins lint at phase:examples-check)
  // survey 16 §3 phase:examples-check [proposed rule]: a unit test outside e2e/ reads no sample
  // folder. The string literals named here are the examples/ path and SCRIBA_EXAMPLES_DIR.
  {
    files: ['**/*.test.ts'],
    // e2e/ may read the samples. The contracts env test holds the SCRIBA_EXAMPLES_DIR default in
    // its spec table and reads no file, so it is exempt by name.
    ignores: ['e2e/**', 'packages/contracts/test/platform/env.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/(^|[\\\\/])examples([\\\\/]|$)|SCRIBA_EXAMPLES_DIR/]',
          message:
            'A unit test outside e2e/ does not read examples/ or SCRIBA_EXAMPLES_DIR. Move the test to e2e/, or use a fixture.',
        },
      ],
    },
  },
);
