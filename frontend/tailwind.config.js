/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F6F8FA",
        panel: "#FFFFFF",
        ink: "#0F172A",
        muted: "#64748B",
        line: "#E2E8F0",
        brand: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          400: "#3B82F6",
          500: "#2563EB",
          600: "#1D4ED8",
          700: "#1E40AF",
          900: "#172554",
        },
        alert: {
          low: "#0EA5E9",
          medium: "#F59E0B",
          high: "#DC2626",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 1px 3px 0 rgba(15, 23, 42, 0.06)",
      },
    },
  },
  plugins: [],
}
