import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    alias: {
      'cloudflare:workers': fileURLToPath(
        new URL('./scripts/test-utils/cloudflare-workers-stub.js', import.meta.url),
      ),
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/**/types.ts', 'src/**/*.d.ts'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/**/*.{test,spec}.ts'],
          exclude: ['src/**/*.svelte.{test,spec}.ts'],
        },
      },
      {
        extends: true,
        plugins: [svelteTesting()],
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['src/**/*.svelte.{test,spec}.ts'],
        },
      },
    ],
  },
});
