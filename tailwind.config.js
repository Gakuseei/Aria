/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // v1.0 ROSE NOIR Theme Palette
        noir: {
          rose: '#f43f5e',
          'rose-dark': '#e11d48',
          'rose-glow': 'rgba(244, 63, 94, 0.3)',
          pink: '#ec4899',
          'pink-dark': '#db2777',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Consolas', 'Liberation Mono', 'Menlo', 'monospace'],
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'slide-up': 'slideUp 0.4s ease-out forwards',
        'slide-down': 'slideDown 0.4s ease-out forwards',
        'scale-in': 'scaleIn 0.2s ease-out forwards',
        'spin-slow': 'spin 20s linear infinite',
        'glow': 'glow 2s ease-in-out infinite',
        'glow-rose': 'glowRose 2s ease-in-out infinite',
      },
      keyframes: {
        glowRose: {
          '0%, 100%': { boxShadow: '0 0 10px rgba(244, 63, 94, 0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(244, 63, 94, 0.5)' },
        },
      },
      backdropBlur: {
        xs: '2px',
        '2xl': '40px',
      },
      boxShadow: {
        'glow-rose': '0 0 20px rgba(244, 63, 94, 0.3)',
        'glow-rose-lg': '0 0 40px rgba(244, 63, 94, 0.4)',
        'glow-pink': '0 0 20px rgba(236, 72, 153, 0.3)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.3)',
        'glass-lg': '0 16px 48px rgba(0, 0, 0, 0.4)',
      },
    },
  },
  plugins: [],
};
