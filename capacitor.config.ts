import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android wrapper for the POS. The app is server-rendered, so the phone loads
 * the hosted site rather than a bundled static build; POS_MOBILE_URL overrides
 * the default at build time.
 */
const config: CapacitorConfig = {
  appId: "com.luckycharms.pos",
  appName: "Northwind POS",
  webDir: "capacitor-shell",
  server: {
    url: process.env["POS_MOBILE_URL"] || "https://updatecms.luckycharmsdnbhd.com",
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
