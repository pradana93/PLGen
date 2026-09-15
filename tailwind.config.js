/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html","./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#3498db",
        success: "#27ae60",
        danger: "#e74c3c",
        warning: "#f39c12",
        purple: "#9b59b6",
        dark: "#2c3e50"
      }
    }
  },
  plugins: []
}
