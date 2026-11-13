import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter({
        config: 'wrangler.jsonc',
        platformProxy: { configPath: 'wrangler.jsonc' },
      }),
      alias: { '@': resolve(__dirname, 'src') },
    }),
  ],
  // `cloudflare:*` modules only exist inside the workers runtime; leave the
  // import in the bundle for workerd to resolve at runtime.
  ssr: { external: ['cloudflare:email'] },
  build: { rollupOptions: { external: ['cloudflare:email'] } },
});
