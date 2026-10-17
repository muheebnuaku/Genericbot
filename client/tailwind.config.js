/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Default brand palette — swap these hex values for the client's real
        // brand colors (config.company.brandColors in src/config/index.js
        // drives the same values on the server/WhatsApp side; keep them in sync).
        brand: {
          50:  "#eef3f9",
          100: "#d7e3f0",
          200: "#adc5df",
          300: "#7ea3ca",
          400: "#4c7cae",
          500: "#2c5c8f",
          600: "#1e3f6b",   // primary accent — matches the site's navy CTA buttons
          700: "#183254",
          800: "#132844",
          900: "#0e1e35",
        },
        navy: {
          700: "#1a1a1a",
          800: "#121212",
          900: "#0a0a0a",   // near-black — matches the site's ticker bar / dark chrome
          950: "#000000",
        },
        // Optional extra accent colors — delete or repurpose for the client's
        // actual brand accents (a flag theme, a secondary brand color, etc.)
        accent: {
          1: "#ce1126",
          2: "#d4a017",
          3: "#006b3f",
        },
        cream: "#f7f6f1", // warm off-white page background option

        // Warm-neutral "paper" surfaces + ink — from the dataviz skill's reference
        // palette (chart chrome & ink table). Used across the whole dashboard, not
        // just charts, so cards/charts/text share one consistent, slightly warm
        // neutral scale instead of generic cool slate-gray.
        paper: {
          page:    "#f9f9f7", // main content background
          surface: "#fcfcfb", // card/chart surface
          grid:    "#e1e0d9", // hairline gridlines
          axis:    "#c3c2b7", // axis/baseline lines
        },
        ink: {
          primary:   "#0b0b0b",
          secondary: "#52514e",
          muted:     "#898781",
        },

        // Fixed status scale (never themed) — for verdict badges specifically.
        // Deliberately distinct from categorical chart colors so a verdict never
        // reads as "just another series." Always paired with an icon + label.
        status: {
          good:     "#0ca30c", // True
          warning:  "#fab219", // Misleading
          serious:  "#ec835a", // Partly True
          critical: "#d03b3b", // False
        },

        // Categorical chart series (validated default order, dataviz skill) —
        // used for multi-series charts (e.g. conversations over time). Brand navy
        // stays reserved for UI chrome; this is for data encoding specifically.
        series: {
          1: "#2a78d6", // blue
          2: "#eb6834", // orange
          3: "#1baf7a", // aqua
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card:    "0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)",
        "card-md": "0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -1px rgba(0,0,0,0.04)",
        "card-lg": "0 8px 24px -4px rgba(11,11,11,0.08), 0 2px 8px -2px rgba(11,11,11,0.04)",
      },
    },
  },
  plugins: [],
};
