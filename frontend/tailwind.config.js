/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ceramic: {
          DEFAULT: '#EBE8E3',
          dark: '#F7F5F0',
        },
        plastic: '#FDFCF9',
        espresso: {
          DEFAULT: '#3E3430',
          dark: '#2C2420',
        },
        tungsten: '#8C8682',
        amber: {
          DEFAULT: '#DDAA44',
          light: '#E4AD3F',
        },
        signal: {
          green: '#6B9E78',
          red: '#CC5544',
        },
        tinted: {
          paper: '#F2F0EB',
        },
      },
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        body: ['IBM Plex Sans', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      boxShadow: {
        lift: '0 8px 24px -4px rgba(62, 52, 48, 0.12), 0 2px 6px -1px rgba(62, 52, 48, 0.04)',
        deep: '0 20px 40px -8px rgba(62, 52, 48, 0.2)',
        soft: '0 4px 12px rgba(62, 52, 48, 0.08)',
        inset: 'inset 0 2px 4px rgba(62, 52, 48, 0.05)',
        'inset-slot': 'inset 0 2px 4px rgba(62, 52, 48, 0.08)',
        glow: '0 0 12px rgba(221, 170, 68, 0.4)',
        pneumatic: '0 4px 0 #b88a32, 0 8px 16px rgba(228, 173, 63, 0.4)',
        'pneumatic-pressed': 'inset 0 2px 4px rgba(0, 0, 0, 0.2)',
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
      },
      backgroundImage: {
        'dot-grid': 'radial-gradient(#8C8682 1px, transparent 1px)',
      },
      animation: {
        dash: 'dash 1s linear infinite',
        'cursor-blink': 'blink 1s step-end infinite',
      },
      keyframes: {
        dash: {
          '0%': { strokeDashoffset: '24' },
          '100%': { strokeDashoffset: '0' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
