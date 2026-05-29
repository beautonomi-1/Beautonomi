/* global __dirname */
const fs = require("fs");
const path = require("path");

// Load .env.local and use parsed values directly (bypass process.env to avoid Expo placeholders)
const envPath = path.join(__dirname, ".env.local");
const envFromFile = {};
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim().replace(/^["']|["']$/g, "");
      if (key.startsWith("EXPO_PUBLIC_")) {
        envFromFile[key] = val;
        process.env[key] = val;
      }
    }
  }
}

// APP_ENV drives production-only toggles like APNs env + OneSignal mode.
const appEnv =
  process.env.APP_ENV ||
  (process.env.NODE_ENV === "production" ? "production" : "development");
const isProduction = appEnv === "production";
const oneSignalMode = isProduction ? "production" : "development";

/** Base config (previously in app.json). Kept here so expo-doctor passes its
 *  "app.config.js should use app.json values" check and we have a single
 *  source of truth. */
const BASE_EXPO_CONFIG = {
  name: "Beautonomi",
  slug: "customer",
  scheme: "customer",
  updates: {
    url: "https://u.expo.dev/434ef972-0597-4d93-9c09-ff7b9e11b149",
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  version: "1.0.47",
  orientation: "default",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.beautonomi",
    appleTeamId: "QW33CYPQX5",
    buildNumber: "239",
    infoPlist: {
      UIBackgroundModes: ["remote-notification"],
      NSCalendarsUsageDescription:
        "Beautonomi can add your appointment to your calendar when you choose Save to calendar.",
      ITSAppUsesNonExemptEncryption: false,
      // WrongAppScreen: Linking.canOpenURL("provider://") needs the scheme here
      // (iOS blocks undeclared schemes). Must match plugin `scheme` and
      // apps/provider `scheme` + android.package com.beautonomi.partner.
      LSApplicationQueriesSchemes: ["provider"],
    },
    entitlements: {
      "aps-environment": isProduction ? "production" : "development",
      "com.apple.security.application-groups": [
        "group.com.beautonomi.onesignal",
      ],
    },
    associatedDomains: [
      "applinks:beautonomi.com",
      "applinks:www.beautonomi.com",
      "applinks:beautonomi.co.za",
      "applinks:www.beautonomi.co.za",
    ],
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
    package: "com.beautonomi",
    permissions: [
      "android.permission.POST_NOTIFICATIONS",
      "com.google.android.gms.permission.AD_ID",
    ],
    versionCode: 240,
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: "resize",
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "beautonomi.com", pathPrefix: "/" },
          { scheme: "https", host: "www.beautonomi.com", pathPrefix: "/" },
          { scheme: "https", host: "beautonomi.co.za", pathPrefix: "/" },
          { scheme: "https", host: "www.beautonomi.co.za", pathPrefix: "/" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    favicon: "./assets/favicon.png",
    bundler: "metro",
    output: "single",
  },
  plugins: [
    [
      "./plugins/android-sibling-app-queries/app.plugin.js",
      { packageName: "com.beautonomi.partner", scheme: "provider" },
    ],
    [
      "expo-build-properties",
      {
        ios: {
          deploymentTarget: "15.1",
          privacyManifestAggregationEnabled: true,
        },
        android: {
          minSdkVersion: 24,
          compileSdkVersion: 35,
          targetSdkVersion: 35,
          ndkVersion: "28.0.12433566",
          useLegacyPackaging: false,
        },
      },
    ],
    "../../tooling/expo-plugins/withGradleWrapperResilience",
    [
      "expo-local-authentication",
      {
        faceIDPermission:
          "Beautonomi uses Face ID or Touch ID so you can sign in quickly. Biometric data stays on your device and is not sent to our servers.",
      },
    ],
    [
      "onesignal-expo-plugin",
      { mode: oneSignalMode },
    ],
    "expo-notifications",
    "expo-router",
    "expo-font",
    [
      "expo-tracking-transparency",
      {
        userTrackingPermission:
          "This identifier is used to measure how people discover Beautonomi (for example, which campaigns led to installs) so we can improve the app. You can change this anytime in Settings.",
      },
    ],
    "singular-react-native",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Beautonomi uses your location while the app is open to show nearby professionals, travel times, and better address suggestions.",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Allow Beautonomi to access your photos for your profile, reviews, and sharing images.",
        cameraPermission:
          "Allow Beautonomi to use the camera for your profile, reviews, and sharing photos.",
      },
    ],
    [
      "expo-calendar",
      {
        calendarPermission:
          "Beautonomi can add your booking to your calendar when you tap Save to calendar.",
      },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: "#ffffff",
        image: "./assets/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
      },
    ],
    [
      "@sentry/react-native/expo",
      {
        url: "https://sentry.io/",
        project: "mobile-customer",
        organization: "beautonomi",
      },
    ],
    // After Sentry: ensure EAS env for uploads reaches Run Script phases (see plugin header).
    "./plugins/sentry-allow-failure",
  ],
  extra: {
    eas: { projectId: "434ef972-0597-4d93-9c09-ff7b9e11b149" },
    router: { origin: "https://beautonomi.com" },
  },
};

/** Merge runtime env into the base config. */
module.exports = () => {
  const iosStoreId =
    envFromFile.EXPO_PUBLIC_IOS_APP_STORE_ID ??
    process.env.EXPO_PUBLIC_IOS_APP_STORE_ID ??
    "";
  const extra = {
    ...BASE_EXPO_CONFIG.extra,
    EXPO_PUBLIC_SUPABASE_URL:
      envFromFile.EXPO_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY:
      envFromFile.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_APP_URL:
      envFromFile.EXPO_PUBLIC_APP_URL ?? process.env.EXPO_PUBLIC_APP_URL,
    EXPO_PUBLIC_ONESIGNAL_APP_ID:
      envFromFile.EXPO_PUBLIC_ONESIGNAL_APP_ID ??
      process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID,
    EXPO_PUBLIC_SENTRY_DSN:
      envFromFile.EXPO_PUBLIC_SENTRY_DSN ?? process.env.EXPO_PUBLIC_SENTRY_DSN,
    /** When "1" or "true", send Sentry events in __DEV__ (see src/lib/sentry.ts). */
    EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV:
      envFromFile.EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV ??
      process.env.EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV,
    EXPO_PUBLIC_IOS_APP_STORE_ID: iosStoreId,
    /** App Store numeric ID for in-app review / feedback links. */
    iosAppId: iosStoreId,
    APP_ENV: appEnv,
    EXPO_PUBLIC_DEFAULT_PHONE_REGION:
      envFromFile.EXPO_PUBLIC_DEFAULT_PHONE_REGION ??
      process.env.EXPO_PUBLIC_DEFAULT_PHONE_REGION ??
      "ZA",
    EXPO_PUBLIC_WEB_API_TENANT_HOST:
      envFromFile.EXPO_PUBLIC_WEB_API_TENANT_HOST ??
      process.env.EXPO_PUBLIC_WEB_API_TENANT_HOST,
    EXPO_PUBLIC_GLOBAL_ENTRY_HOST:
      envFromFile.EXPO_PUBLIC_GLOBAL_ENTRY_HOST ??
      process.env.EXPO_PUBLIC_GLOBAL_ENTRY_HOST,
    EXPO_PUBLIC_DEFAULT_MARKET_HOST:
      envFromFile.EXPO_PUBLIC_DEFAULT_MARKET_HOST ??
      process.env.EXPO_PUBLIC_DEFAULT_MARKET_HOST,
    EXPO_PUBLIC_MARKET_HOST_OPTIONS:
      envFromFile.EXPO_PUBLIC_MARKET_HOST_OPTIONS ??
      process.env.EXPO_PUBLIC_MARKET_HOST_OPTIONS,
    EXPO_PUBLIC_MARKET_OVERRIDE_TTL_HOURS:
      envFromFile.EXPO_PUBLIC_MARKET_OVERRIDE_TTL_HOURS ??
      process.env.EXPO_PUBLIC_MARKET_OVERRIDE_TTL_HOURS,
  };
  return { expo: { ...BASE_EXPO_CONFIG, extra } };
};
