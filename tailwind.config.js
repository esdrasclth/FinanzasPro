/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        obsidian: '#09090b',
        ink: '#18181b',
        graphite: '#3f3f46',
        steel: '#71717a',
        ash: '#a1a1aa',
        pebble: '#d4d4d8',
        fog: '#ececee',
        mist: '#f4f4f5',
        snow: '#ffffff',
        ember: '#ff5a00',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        input: '14px',
        badge: '12px',
        card: '16px',
        'card-lg': '16px',
        hero: '16px',
      },
      boxShadow: {
        pill: 'rgba(255,255,255,0.5) 0px 0.5px 0px 0px inset, rgba(117,123,133,0.4) 0px 9px 14px -5px inset, rgb(44,46,52) 0px 0px 0px 1.5px, rgba(0,0,0,0.14) 0px 4px 6px 0px',
        soft: 'rgba(0,0,0,0.04) 0px 4px 12px 0px',
      },
    },
  },
  plugins: [],
}