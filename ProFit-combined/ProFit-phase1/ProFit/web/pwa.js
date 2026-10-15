/* Registers the offline app shell so ProFit installs and opens like a native app
   on Android, iOS (Add to Home Screen) and desktop Chrome/Edge. Only runs on
   HTTPS or localhost, the only places browsers allow service workers. */
if ("serviceWorker" in navigator &&
    (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
