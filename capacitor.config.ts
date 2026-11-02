import type { CapacitorConfig } from "@capacitor/cli";

// The app is server-rendered (Next.js server actions + cookie sessions), so the native shell loads the hosted
// deployment rather than a static export. Set VELOCITY_APP_URL to the production origin before `npx cap sync`.
// For the Android emulator against a local dev server use http://10.0.2.2:3000 (cleartext is allowed only for that).
const url = process.env.VELOCITY_APP_URL || "https://velocityerp.co";

const config: CapacitorConfig = {
  appId: "com.velocityerp.app",
  appName: "Velocity ERP",
  webDir: "mobile/www",
  backgroundColor: "#150f0d",
  server: { url, cleartext: url.startsWith("http://"), androidScheme: "https" },
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: "#150f0d", showSpinner: false },
    StatusBar: { style: "DARK", backgroundColor: "#150f0d" },
    Keyboard: { resize: "body" },
  },
};

export default config;
