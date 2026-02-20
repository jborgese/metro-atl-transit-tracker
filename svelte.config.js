import adapter from '@sveltejs/adapter-cloudflare';
import preprocess from 'svelte-preprocess';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = {
  preprocess: preprocess(),
  kit: {
    adapter: adapter({
      config: 'wrangler.jsonc',
      platformProxy: {
        configPath: 'wrangler.jsonc'
      }
    }),
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
};

export default config;
