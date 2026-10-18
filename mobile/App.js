// App entry. Imports the global Tailwind stylesheet (compiled by NativeWind at
// build time) and renders the single MembershipScreen for this skeleton pass.
import "./global.css";

import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";

import MembershipScreen from "./screens/MembershipScreen";

export default function App() {
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <StatusBar style="auto" />
      <MembershipScreen />
    </SafeAreaView>
  );
}
