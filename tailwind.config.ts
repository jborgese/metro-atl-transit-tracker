import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

const config: Config = {
  content: ['./src/**/*.{astro,html,js,jsx,svelte,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Atlanta 1996 brand palette (via CSS variables)
        atl: {
          green: 'var(--atl-green)',         // #33514D
          bronze: 'var(--atl-bronze)',       // #7E6E4F
          red: 'var(--atl-red)',             // #a73a32
          magenta: 'var(--atl-magenta)',     // #a32f65
          blue: 'var(--atl-blue)',           // #4280c4
          lavender: 'var(--atl-lavender)',   // #8a62b0
        },

        // Semantic UI tokens (recommended)
        surface: {
          0: 'var(--surface-0)', // app bg (green)
          1: 'var(--surface-1)', // elevated panel
          2: 'var(--surface-2)', // elevated panel (opaque)
        },
        text: {
          primary: 'var(--text-on-dark)',
          muted: 'var(--text-muted)',
          dim: 'var(--text-dim)',
          onlight: 'var(--text-on-light)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },
      },

      boxShadow: {
        soft: 'var(--shadow-1)',
        panel: 'var(--shadow-2)',
      },

      typography: {
        invert: {
          css: {
            // Use your neutral tokens (better than hard-coded zincs)
            '--tw-prose-body': 'var(--text-muted)',
            '--tw-prose-headings': 'var(--text-on-dark)',
            '--tw-prose-lead': 'var(--text-muted)',
            '--tw-prose-bold': 'var(--text-on-dark)',
            '--tw-prose-counters': 'var(--text-dim)',
            '--tw-prose-bullets': 'var(--text-dim)',
            '--tw-prose-hr': 'var(--border-subtle)',
            '--tw-prose-quotes': 'var(--text-on-dark)',
            '--tw-prose-quote-borders': 'var(--border-subtle)',
            '--tw-prose-captions': 'var(--text-dim)',
            '--tw-prose-code': 'var(--text-on-dark)',
            '--tw-prose-pre-code': 'var(--text-on-dark)',
            '--tw-prose-pre-bg': 'var(--surface-2)',
            '--tw-prose-th-borders': 'var(--border-subtle)',
            '--tw-prose-td-borders': 'var(--border-subtle)',

            // Brand-consistent link color
            '--tw-prose-links': 'var(--atl-blue)',

            // Optional: link hover can be handled in CSS, but you can also do:
            a: {
              color: 'var(--atl-blue)',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
              fontWeight: '600',
            },
            'a:hover': {
              color: 'var(--text-on-dark)',
            },

            // Optional: make inline code a bit more legible on dark surfaces
            'code::before': { content: '""' },
            'code::after': { content: '""' },
          },
        },
      },
    },
  },
  plugins: [typography],
}

export default config