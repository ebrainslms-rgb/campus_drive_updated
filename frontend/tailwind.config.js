/** @type {import('tailwindcss').Config} */
export default {
  // Reuses the same [data-theme="dark"] attribute ThemeContext already sets
  // on <html> - no separate class toggle needed, one source of truth.
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#0F172A",
          light:   "#1E293B",
          card:    "#162032",
        },
        cyan: {
          eb:     "#06B6D4",
          dark:   "#0891B2",
          glow:   "#67E8F9",
        },
        orange: {
          eb:     "#F97316",
          dark:   "#EA580C",
          glow:   "#FB923C",
          soft:   "#FED7AA",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "cyan-glow": "0 0 24px 4px rgba(6,182,212,0.35)",
        "card":      "0 8px 48px 0 rgba(6,182,212,0.10), 0 2px 16px 0 rgba(0,0,0,0.55)",
      },
      animation: {
        "fade-up":    "fadeUp 0.45s cubic-bezier(0.4,0,0.2,1) both",
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        "spin-slow":  "spin 8s linear infinite",
      },
      keyframes: {
        fadeUp: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
