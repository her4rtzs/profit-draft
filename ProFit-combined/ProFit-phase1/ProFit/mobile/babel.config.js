// Babel config for the Expo app. NativeWind compiles Tailwind classes at build
// time via the preset's `jsxImportSource` plus the `nativewind/babel` preset —
// there is NO runtime CDN/Tailwind build (per AGENTS.md).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      // Reanimated's plugin must be listed last.
      "react-native-reanimated/plugin",
    ],
  };
};
