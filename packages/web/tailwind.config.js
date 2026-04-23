/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Linear/Vercel-style neutral slate, blue accent retained.
        ink: {
          900: '#0a0a0b', // page background
          800: '#101114', // panel background
          700: '#16181c', // elevated panel / hover bg
          600: '#1d2025', // input / disabled bg
          500: '#26292f', // muted row
          400: '#2a2d33', // subtle border
          300: '#3a3e46', // stronger border / iconography
          200: '#8b909a', // secondary text
          100: '#e6e7ea', // primary text
        },
        brand: {
          50: '#eaf4ff',
          100: '#cfe4ff',
          200: '#9cc8ff',
          300: '#63a8ff',
          400: '#3a8dff',
          500: '#1a73ff',
          600: '#0057e0',
          700: '#0044b3',
          800: '#002f80',
          900: '#001a4d',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      fontSize: {
        // Slightly tighter defaults than Tailwind's — matches Linear.
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.375rem' }],
      },
    },
  },
  plugins: [],
};
