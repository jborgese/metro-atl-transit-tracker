import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter({
        config: 'wrangler.jsonc',
        platformProxy: { configPath: 'wrangler.jsonc' },
      }),
    }),
  ],
  // `cloudflare:*` modules only exist inside the workers runtime; leave the
  // import in the bundle for workerd to resolve at runtime.
  ssr: { external: ['cloudflare:email'] },
  build: { rollupOptions: { external: ['cloudflare:email'] } },
});
