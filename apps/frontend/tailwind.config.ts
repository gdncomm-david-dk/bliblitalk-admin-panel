import type { Config } from "tailwindcss";

// Blu (Blibli Blue) tokens.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#0072FF",
          dark: "#0050BD",
          navy: "#002E7A",
          light: "#4FA4FF",
          50: "#E1F1FF",
          100: "#E8F2FF",
        },
        tosca: "#00CDC7",
        ink: "#000000",
        muted: "#60686E",
        line: "#E8E8E8",
        surface: "#F5F5F5",
        status: {
          blue: "#0072FF",
          green: "#02C82B",
          orange: "#FF7F00",
          red: "#FF4646",
          purple: "#7C3AED",
          yellow: "#FFCD00",
        },
      },
      fontFamily: {
        sans: ["Blibli", "Helvetica Neue", "Arial", "sans-serif"],
      },
      borderRadius: {
        lg: "8px",
        xl: "12px",
        "2xl": "16px",
        "3xl": "20px",
      },
      boxShadow: {
        soft: "0 4px 20px rgba(15, 23, 42, 0.06)",
        card: "0 4px 16px rgba(0, 0, 0, 0.06)",
      },
    },
  },
  plugins: [],
} satisfies Config;
