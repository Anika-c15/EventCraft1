/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#E8450A',
          50: '#FEF0EB',
          100: '#FDD8CC',
          200: '#FAB199',
          300: '#F78A66',
          400: '#F46333',
          500: '#E8450A',
          600: '#C23A08',
          700: '#9C2E06',
          800: '#762304',
          900: '#501802',
        },
        background: '#F5F4F0',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
