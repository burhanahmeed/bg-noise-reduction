/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0f172a",
        surface: "#1e293b",
        primary: {
          DEFAULT: "#6366f1",
          dark: "#4f46e5",
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-in-from-bottom-4': 'slideInFromBottom4 0.5s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideInFromBottom4: {
          '0%': { transform: 'translateY(1rem)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
