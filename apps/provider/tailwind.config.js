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
        primary: "#FF0077",
        "primary-light": "rgba(255, 0, 119, 0.05)",
      },
    },
  },
  plugins: [],
};
