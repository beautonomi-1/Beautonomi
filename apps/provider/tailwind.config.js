/**
 * Provider app Tailwind + NativeWind.
 * Presets: nativewind/preset + @beautonomi/ui-tokens (primary, muted, spacing, etc.).
 * Extend only app-specific tokens (e.g. primary-light).
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [
    require("nativewind/preset"),
    require("@beautonomi/ui-tokens/nativewind-preset"),
  ],
  theme: {
    extend: {
      colors: {
        "primary-light": "rgba(255, 0, 119, 0.05)",
      },
    },
  },
  plugins: [],
};
