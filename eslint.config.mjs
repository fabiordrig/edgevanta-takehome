// eslint.config.mjs — monorepo root
// Source: https://typescript-eslint.io/troubleshooting/typed-linting/monorepos/
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier, // must be last — disables formatting rules that conflict with Prettier (D-19)
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/*.js',
      '**/*.mjs',
      '**/*.cjs',
      '**/next-env.d.ts', // Next.js auto-generated file — contains triple-slash references by design
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
);
