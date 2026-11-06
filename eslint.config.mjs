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
);
