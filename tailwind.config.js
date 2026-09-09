/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdf4',
          500: '#16a34a',
          900: '#064e3b',
        },
        dark: {
          900: '#0f172a',
          800: '#1e293b',
          700: '#334155',
        },
      },
    },
  },
  plugins: [],
};