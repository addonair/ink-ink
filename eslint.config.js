import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '.claude/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  /**
   * NFR-15 — `src/core/` must stay reusable outside this extension.
   *
   * The spec's stated future direction is lifting stroke capture, coordinate
   * handling, and hit-testing into a standalone app. That only stays cheap if
   * the boundary is enforced now, while there is nothing to untangle. A
   * documentation-only rule would erode on the first convenient import.
   */
  {
    files: ['src/core/**/*.ts'],
    ignores: ['src/core/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@adapters/*',
                '@overlay/*',
                '@state/*',
                '@compose/*',
                '../adapters/*',
                '../overlay/*',
                '../state/*',
                '../compose/*',
                '../content/*',
                '../background/*',
              ],
              message:
                'src/core must stay host-agnostic and reusable (NFR-15). Invert the dependency: pass what core needs in as an argument.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'chrome', message: 'src/core must not touch extension APIs (NFR-15).' },
        { name: 'document', message: 'src/core must not query the DOM (NFR-15).' },
        { name: 'window', message: 'src/core must not depend on the browser global (NFR-15).' },
      ],
    },
  },

  /**
   * NFR-10 — host selectors live only in adapters. If a raw selector string
   * appears in the content or overlay layer, repairing a broken site stops
   * being a one-file change.
   */
  {
    files: ['src/content/**/*.ts', 'src/overlay/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            'CallExpression[callee.property.name=/^(querySelector|querySelectorAll|getElementsByClassName)$/] > Literal[value=/[.#\\[]/]',
          message:
            'Host-site selectors belong in src/adapters (NFR-10), not in the content or overlay layer.',
        },
      ],
    },
  },

  {
    files: ['**/*.test.ts'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-imports': 'off',
    },
  },

  {
    files: ['*.config.ts', '*.config.js', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' },
    },
    rules: {
      'no-console': 'off',
    },
  },
);
