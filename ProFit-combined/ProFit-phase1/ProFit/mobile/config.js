import Constants from "expo-constants";

// API base URL comes from Expo config (app.json -> expo.extra.apiBaseUrl),
// which can be overridden per environment. It is NOT hard-coded in the screens;
// the localhost default is for the dev server only.
export const API_BASE_URL =
  Constants?.expoConfig?.extra?.apiBaseUrl ?? "http://localhost:8000";
