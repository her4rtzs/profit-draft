/** @type {import('tailwindcss').Config} */
module.exports = {
  // Scan the Django templates and django-components for class usage so the
  // build-time CSS includes exactly what the portal renders (no runtime CDN).
  content: [
    "../../templates/**/*.html",
    "../../components/**/*.html",
    "../../apps/**/templates/**/*.html",
  ],
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: ["light"],
  },
};
