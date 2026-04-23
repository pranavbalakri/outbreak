/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Terminal/cyberpunk palette — pure black with blue accent.
        ink: {
          900: '#050607',
          800: '#0a0b0d',
          700: '#101216',
          600: '#16181d',
          500: '#1e2128',
          400: '#2a2e38',
          300: '#3a3f4b',
          200: '#6b7180',
          100: '#c7cbd4',
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
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'monospace',
        ],
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
