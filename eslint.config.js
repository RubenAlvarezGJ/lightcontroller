import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'docs', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The protocol layer must stay pure so it can be tested in Node and ported to other runtimes.
    files: ['src/protocol/**/*.ts'],
    languageOptions: { globals: { ...globals.es2022 } },
    rules: {
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'localStorage',
        'BluetoothDevice',
        'BluetoothRemoteGATTCharacteristic',
      ],
      'no-restricted-imports': [
        'error',
        { patterns: ['../transport/*', '../devices/*', '../ui/*', 'preact', 'preact/*'] },
      ],
    },
  },
  {
    files: ['vite.config.ts', 'eslint.config.js', 'scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
);
