/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./styles/**/*.css"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: 'var(--w-primary-50)',
          100: 'var(--w-primary-100)',
          200: 'var(--w-primary-200)',
          300: 'var(--w-primary-300)',
          400: 'var(--w-primary-400)',
          500: 'var(--w-primary-500)',
          600: 'var(--w-primary-600)',
          700: 'var(--w-primary-700)',
          800: 'var(--w-primary-800)',
          900: 'var(--w-primary-900)',
          950: 'var(--w-primary-950)',
        }
      },
    },
  },
  plugins: [],
}
