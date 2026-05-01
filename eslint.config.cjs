const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const sveltePlugin = require('eslint-plugin-svelte');
const svelteParser = require('svelte-eslint-parser');
const prettier = require('eslint-config-prettier');

const svelteFlat = sveltePlugin.configs['flat/recommended'];

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  history: 'readonly',
  HTMLElement: 'readonly',
  HTMLDivElement: 'readonly',
  HTMLInputElement: 'readonly',
  HTMLButtonElement: 'readonly',
  HTMLAnchorElement: 'readonly',
  Element: 'readonly',
  Event: 'readonly',
  CustomEvent: 'readonly',
  KeyboardEvent: 'readonly',
  MouseEvent: 'readonly',
  Node: 'readonly',
  ResizeObserver: 'readonly',
  IntersectionObserver: 'readonly',
  MutationObserver: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
};

const platformGlobals = {
  console: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  fetch: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  Headers: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  crypto: 'readonly',
  ReadableStream: 'readonly',
  WritableStream: 'readonly',
  TransformStream: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  queueMicrotask: 'readonly',
  structuredClone: 'readonly',
  globalThis: 'readonly',
  Promise: 'readonly',
};

const nodeGlobals = {
  process: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  require: 'readonly',
  module: 'readonly',
  exports: 'writable',
};

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'public/**',
      'build/**',
      '.vite/**',
      '.svelte-kit/**',
      '.wrangler/**',
      'coverage/**',
      'scripts/data-raw/**',
    ],
  },

  js.configs.recommended,

  // Server / shared TS+JS code (Worker runtime + isomorphic helpers).
  {
    files: ['src/**/*.{js,ts}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...platformGlobals,
        ...browserGlobals,
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-undef': 'off', // TS handles this for .ts files
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Backlog — demote to warn for now, ratchet to error in a follow-up.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
    },
  },

  // Svelte components run in browser + SSR; both global sets apply.
  ...svelteFlat,
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: ['.svelte'],
      },
      globals: {
        ...platformGlobals,
        ...browserGlobals,
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-undef': 'off',
      // Backlog — large existing surface; ratchet down in a follow-up PR.
      'svelte/require-each-key': 'warn',
      'svelte/no-navigation-without-resolve': 'warn',
      'svelte/infinite-reactive-loop': 'warn',
      'svelte/no-dom-manipulating': 'warn',
      'svelte/prefer-svelte-reactivity': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
    },
  },

  // Node scripts (build, smoke, integration). CommonJS allowed.
  {
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...platformGlobals,
        ...nodeGlobals,
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Root-level config files are CommonJS.
  {
    files: ['*.config.{js,cjs,mjs,ts}', 'eslint.config.cjs', 'vitest.config.ts', 'tailwind.config.ts', 'svelte.config.js', 'vite.config.js'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...platformGlobals,
        ...nodeGlobals,
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Prettier last so it disables stylistic rules conflicting with the formatter.
  prettier,
];
