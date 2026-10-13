import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          lime: "#82BE28",
          gold: "#F2C94C",
          forest: "#254B32",
          "forest-dark": "#1A3523",
          "lime-light": "#96D433",
        },
        surface: {
          cream: "#F7F4EA",
          card: "#FFFDF7",
          hover: "#F2EFE2",
        },
        content: {
          primary: "#20291F",
          muted: "#687166",
        },
        border: {
          subtle: "#E4E4D8",
          strong: "#D0D0C0",
        },
        status: {
          success: "#267847",
          warning: "#A56B00",
          danger: "#B42318",
        },
      },
      borderRadius: {
        clay: "1.25rem",
        "clay-sm": "0.875rem",
        "clay-lg": "1.75rem",
      },
      boxShadow: {
        clay: "6px 6px 16px rgba(37, 75, 50, 0.07), -6px -6px 16px rgba(255, 255, 255, 0.95)",
        "clay-sm": "4px 4px 10px rgba(37, 75, 50, 0.05), -4px -4px 10px rgba(255, 255, 255, 0.9)",
        "clay-lg": "8px 8px 24px rgba(37, 75, 50, 0.09), -8px -8px 24px rgba(255, 255, 255, 0.95)",
        "clay-inset": "inset 2px 2px 5px rgba(37, 75, 50, 0.08), inset -2px -2px 5px rgba(255, 255, 255, 0.9)",
        "clay-btn": "4px 4px 12px rgba(118, 176, 34, 0.35), -2px -2px 6px rgba(255, 255, 255, 0.8)",
      },
    },
  },
  plugins: [],
} satisfies Config;
