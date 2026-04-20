/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "DM Sans",
          "system-ui",
          "Segoe UI",
          "sans-serif",
        ],
        display: ["Outfit", "system-ui", "sans-serif"],
        /** Broadcast / projector section titles only */
        displayWide: ["Orbitron", "system-ui", "sans-serif"],
      },
      colors: {
        cup: {
          ink: "#0f1419",
          paper: "#f6f3ee",
          accent: "#c45c26",
          muted: "#5c6670",
          line: "#d4cfc6",
          win: "#1d7a5c",
          loss: "#a63d3d",
          draw: "#7a6f2d",
          /** Live projection (?display=1) dark “arena” theme */
          stage: "#080c12",
          stageElevated: "#111923",
          stageBorder: "#273041",
          signal: "#f5c542",
          signalMuted: "#c9a227",
          /** W/D/L tuned for dark panels */
          winBright: "#34d399",
          lossBright: "#f87171",
          drawBright: "#fbbf24",
        },
      },
    },
  },
  plugins: [],
};
