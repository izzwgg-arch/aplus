/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"]
      },
      colors: {
        primary: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          500: "#3B82F6",
          600: "#2563EB",
          700: "#1D4ED8"
        },
        medicalBlue: {
          50: "#eef7ff",
          100: "#d9ecff",
          500: "#1c77d2",
          600: "#1667b8",
          700: "#0f4d8c",
          900: "#082740"
        }
      }
    }
  },
  plugins: []
};
