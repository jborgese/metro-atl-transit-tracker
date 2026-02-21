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
      'coverage/**'
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
    files: ['**/*.svelte'],
    languageOptions: {
      parser: require('svelte-eslint-parser'),
      parserOptions: { parser: require('@typescript-eslint/parser') }
    },
    plugins: { svelte: require('eslint-plugin-svelte') },
    rules: {}
  }
];
