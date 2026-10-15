import { registerRootComponent } from "expo";

import App from "./App";

// Expo entry point. registerRootComponent wraps App and calls
// AppRegistry.registerComponent for both native and web.
registerRootComponent(App);
