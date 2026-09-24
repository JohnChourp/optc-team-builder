import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.john.optcteambuilder",
  appName: "OPTC Team Builder",
  webDir: "dist/optc-team-builder/browser",
  plugins: {
    SocialLogin: {
      logLevel: 1,
      providers: {
        apple: false,
        facebook: false,
        google: true,
        twitter: false,
      },
    },
    /*
     * 869f6tcz0. The app is dark-only, but with no style here Capacitor's SystemBars
     * applies DEFAULT, which follows the phone: dark icons on a light device. DARK means
     * light icons for a dark background. The background behind both bars is the Android
     * theme's windowBackground, set to the app's own #070b17 in styles.xml.
     */
    SystemBars: {
      style: "DARK",
    },
  },
};

export default config;
