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
  },
};

export default config;
