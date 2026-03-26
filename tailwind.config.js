/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // ── 調色盤 ─────────────────────────────
      colors: {
        cream:   { DEFAULT: '#F7F4EB', dark: '#EDE8D5' },
        sage:    { DEFAULT: '#8FAF7E', light: '#B5CFA7', dark: '#6A8F5C' },
        earth:   { DEFAULT: '#C4956A', light: '#DDB896', dark: '#9E7040' },
        bark:    { DEFAULT: '#6B5C4E', light: '#8C7B6E' },
        sky:     { DEFAULT: '#A8CADF', light: '#C8DFF0' },
        blush:   { DEFAULT: '#E8B4B8', light: '#F2D0D3' },
        honey:   { DEFAULT: '#E8C96A', light: '#F2DFA0' },
        moss:    { DEFAULT: '#5C7A4A' },
        // 類別顏色
        cat: {
          attraction: '#8FAF7E',  // 景點 - 鼠尾草綠
          food:       '#E8C96A',  // 美食 - 蜂蜜黃
          transport:  '#A8CADF',  // 交通 - 天空藍
          hotel:      '#E8B4B8',  // 住宿 - 玫瑰粉
        }
      },
      // ── 字體 ──────────────────────────────
      fontFamily: {
        sans:    ['"Noto Sans TC"', '"M PLUS Rounded 1c"', 'sans-serif'],
        rounded: ['"M PLUS Rounded 1c"', '"Nunito"', 'sans-serif'],
        mono:    ['"Source Code Pro"', 'monospace'],
      },
      // ── 圓角 ──────────────────────────────
      borderRadius: {
        'xl':  '1rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      // ── 客製化陰影 (手帳風格) ──────────────
      boxShadow: {
        'soft':   '4px 4px 0px #D6D0BE',
        'soft-lg':'6px 6px 0px #D6D0BE',
        'card':   '0 2px 16px rgba(107,92,78,0.10)',
        'card-lg':'0 4px 24px rgba(107,92,78,0.14)',
        'inner-soft': 'inset 2px 2px 6px rgba(107,92,78,0.10)',
      },
      // ── 背景紋理 ──────────────────────────
      backgroundImage: {
        'dot-pattern': "radial-gradient(circle, #C4A882 1px, transparent 1px)",
        'grid-pattern':"linear-gradient(#E0D9C8 1px, transparent 1px), linear-gradient(90deg, #E0D9C8 1px, transparent 1px)",
      },
      backgroundSize: {
        'dot-sm':  '16px 16px',
        'grid-sm': '20px 20px',
      },
      // ── 動畫 ──────────────────────────────
      animation: {
        'bounce-soft': 'bounceSoft 0.6s ease-out',
        'slide-up':    'slideUp 0.3s ease-out',
        'fade-in':     'fadeIn 0.4s ease-out',
      },
      keyframes: {
        bounceSoft: {
          '0%':   { transform: 'scale(0.95)' },
          '60%':  { transform: 'scale(1.03)' },
          '100%': { transform: 'scale(1)' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}