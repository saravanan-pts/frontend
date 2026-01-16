import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // GenUI Theme Palette
        genui: {
          main: "#020617",    // Deepest background (Canvas)
          sidebar: "#0F172A", // Sidebars and Headers
          card: "#1E293B",    // Inputs, Panels, Modals
          border: "#334155",  // Borders
          text: "#F8FAFC",    // Primary White Text
          muted: "#94A3B8",   // Secondary Gray Text
          accent: "#2563EB",  // Active Blue
          purple: "#7C3AED",  // AI/Analysis Highlight
        },
      },
    },
  },
  plugins: [],
};
export default config;