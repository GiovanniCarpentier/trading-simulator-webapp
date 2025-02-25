/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
  ],
  theme: {
    extend: {
      backgroundColor: {
        dark: {
          primary: '#1a1a1a',
          secondary: '#2a2a2a',
          tertiary: '#3a3a3a',
        }
      },
      textColor: {
        dark: {
          primary: '#ffffff',
          accent: '#00ffe3',
          muted: '#a0a0a0',
        }
      },
      borderColor: {
        dark: {
          primary: '#00ffe3',
          secondary: '#666666',
        }
      }
    },
  },
  plugins: [],
}