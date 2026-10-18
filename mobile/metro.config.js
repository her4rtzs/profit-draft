// Metro config wiring NativeWind so Tailwind classes are transformed at build
// time. `input` points at the global stylesheet that declares the Tailwind
// layers. (Expo SDK 50+.)
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css" });
