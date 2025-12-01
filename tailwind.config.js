/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx,css}",       // ⭐ scan everything
    "./components/**/*.{js,ts,jsx,tsx,mdx,css}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx,css}",
    "./src/**/*.{js,ts,jsx,tsx,mdx,css}",       // ⭐ safety catch
    "./globals.css"                             // ⭐ FORCE Tailwind to keep your global CSS
  ],
  theme: {
    extend: {
      animation: {
        "gradient-slow": "gradient-slow 15s ease infinite",
      },
      keyframes: {
        "gradient-slow": {
          "0%": { "background-position": "0% 50%" },
          "50%": { "background-position": "100% 50%" },
          "100%": { "background-position": "0% 50%" },
        },
      },
    },
  },
  plugins: [],
};