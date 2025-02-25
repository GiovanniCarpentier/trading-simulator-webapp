/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{astro,html,js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          background: '#1a1a1a',
          input: '#2a2a2a',
          border: '#444',
          text: '#ffffff',
          muted: '#888888',
          primary: '#4a6cf7', // Button and accent color
        }
      }
    },
  },
  plugins: [],
}