module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.astro/**',
      'public/**',
      'build/**',
      '.vite/**'
    ]
  },
  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parser: require('@typescript-eslint/parser')
    },
    plugins: {
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin')
    },
    rules: {}
  },
  {
    files: ['**/*.astro'],
    languageOptions: {
      parser: require('astro-eslint-parser'),
      parserOptions: { parser: require('@typescript-eslint/parser') }
    },
    plugins: { astro: require('eslint-plugin-astro') },
    rules: {}
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: require('svelte-eslint-parser'),
      parserOptions: { parser: require('@typescript-eslint/parser') }
    },
    plugins: { svelte: require('eslint-plugin-svelte') },
    rules: {}
  }
];
