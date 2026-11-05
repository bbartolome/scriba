import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

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
);
