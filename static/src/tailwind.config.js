/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class", '[data-theme="dark"]'],
  // Scan the Django templates and django-components for class usage so the
  // build-time CSS includes exactly what the portal renders (no runtime CDN).
  content: [
    "../../templates/**/*.html",
    "../../components/**/*.html",
    "../../apps/**/templates/**/*.html",
  ],
  theme: {
    extend: {
      colors: {
        profit: {
          gold: "#F5C518",
          "gold-hover": "#FAD03C",
          "gold-pressed": "#8A6A00",
          "navy-canvas": "#070B18",
          "navy-card": "#0F1A33",
          "navy-elevated": "#162547",
          "navy-inset": "#0A1124",
          "navy-border": "#1F2F55",
          "light-navy-canvas": "#F7F8FC",
          "light-navy-card": "#FFFFFF",
          "light-navy-inset": "#EEF2FA",
          "light-navy-border": "#DDE3F0",
        },
      },
    },
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: [
      {
        profitLight: {
          primary: "#F5C518",
          "primary-content": "#0B1530",
          secondary: "#0F1A33",
          "secondary-content": "#F4F6FB",
          accent: "#8A6A00",
          "accent-content": "#FFFFFF",
          neutral: "#0B1530",
          "neutral-content": "#FFFFFF",
          "base-100": "#FFFFFF",
          "base-200": "#F7F8FC",
          "base-300": "#EEF2FA",
          "base-content": "#0B1530",
          info: "#0B8FD6",
          success: "#15803D",
          warning: "#D97706",
          error: "#B91C1C",
        },
        profitDark: {
          primary: "#F5C518",
          "primary-content": "#0B1530",
          secondary: "#162547",
          "secondary-content": "#F4F6FB",
          accent: "#FAD03C",
          "accent-content": "#0B1530",
          neutral: "#0F1A33",
          "neutral-content": "#F4F6FB",
          "base-100": "#070B18",
          "base-200": "#0F1A33",
          "base-300": "#162547",
          "base-content": "#F4F6FB",
          info: "#38BDF8",
          success: "#34D399",
          warning: "#FBBF24",
          error: "#F87171",
        },
      },
    ],
  },
};
