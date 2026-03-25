/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // 👈 確保這行有包含 .tsx
  ],
  theme: {
    extend: {
      colors: {
        accent: "#769370",
      }
    },
  },
  plugins: [],
}