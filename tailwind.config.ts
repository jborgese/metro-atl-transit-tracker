import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

const config: Config = {
  content: ['./src/**/*.{astro,html,js,jsx,svelte,ts,tsx}'],
  theme: {
  extend: {
    typography: {
      invert: {
        css: {
          '--tw-prose-body': '#d4d4d8',
          '--tw-prose-headings': '#fafafa',
          '--tw-prose-links': '#93c5fd',
          '--tw-prose-bold': '#fafafa',
          '--tw-prose-bullets': '#71717a',
        }
      }
    }
  }
},
  plugins: [typography]
}

export default config
