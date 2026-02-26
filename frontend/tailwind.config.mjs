/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  darkMode: ['class'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            color: 'hsl(var(--foreground))',
            a: {
              color: 'hsl(var(--primary))',
              textDecoration: 'none',
              '&:hover': { textDecoration: 'underline' },
            },
            strong: { color: 'hsl(var(--foreground))', fontWeight: '600' },
            h1: { color: 'hsl(var(--foreground))', fontWeight: '700' },
            h2: { color: 'hsl(var(--foreground))', fontWeight: '700', marginTop: '2em', marginBottom: '1em' },
            h3: { color: 'hsl(var(--foreground))', fontWeight: '600', marginTop: '1.6em', marginBottom: '0.6em' },
            h4: { color: 'hsl(var(--foreground))', fontWeight: '600' },
            p: { marginTop: '1.25em', marginBottom: '1.25em', lineHeight: '1.75' },
            ul: { listStyleType: 'disc', paddingLeft: '1.625em' },
            ol: { listStyleType: 'decimal', paddingLeft: '1.625em' },
            li: { marginTop: '0.5em', marginBottom: '0.5em' },
            'li::marker': { color: 'hsl(var(--primary))' },
            code: {
              color: 'hsl(var(--primary))',
              backgroundColor: 'hsl(var(--muted))',
              padding: '0.2em 0.4em',
              borderRadius: '0.25rem',
              fontWeight: '500',
            },
            'code::before': { content: '""' },
            'code::after': { content: '""' },
            pre: {
              backgroundColor: 'hsl(var(--muted))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.5rem',
              padding: '1em',
              overflow: 'auto',
            },
            blockquote: {
              borderLeftColor: 'hsl(var(--primary))',
              borderLeftWidth: '4px',
              paddingLeft: '1em',
              fontStyle: 'italic',
              color: 'hsl(var(--muted-foreground))',
            },
            img: { borderRadius: '0.5rem', marginTop: '2em', marginBottom: '2em' },
          },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
