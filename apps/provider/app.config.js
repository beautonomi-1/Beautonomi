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

const appEnv =
  process.env.APP_ENV ||
  (process.env.NODE_ENV === "production" ? "production" : "development");
const isProduction = appEnv === "production";
const oneSignalMode = isProduction ? "production" : "development";

/** Base Expo config. Single source of truth (previously duplicated in app.json). */
const BASE_EXPO_CONFIG = {
  name: "Beautonomi Provider",
  slug: "provider",
  scheme: "provider",
  updates: {
    url: "https://u.expo.dev/dc17e4b9-e7c6-4ab4-b52d-3d807e5d9ad7",
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  version: "1.0.13",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  plugins: [
    [
      "./plugins/android-sibling-app-queries/app.plugin.js",
      { packageName: "com.beautonomi", scheme: "customer" },
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
        },
      },
    ],
    [
      "expo-local-authentication",
      {
        faceIDPermission:
          "Beautonomi Provider uses Face ID or Touch ID so you can sign in quickly. Biometric data stays on your device and is not sent to our servers.",
      },
    ],
    [
      "onesignal-expo-plugin",
      { mode: oneSignalMode },
    ],
    "expo-router",
    "expo-font",
    [
      "expo-tracking-transparency",
      {
        userTrackingPermission:
          "This identifier is used to measure how professionals discover Beautonomi Provider (for example, which campaigns led to installs) so we can improve the app. You can change this anytime in Settings.",
      },
    ],
    "singular-react-native",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Beautonomi Provider uses your location while the app is open for journey tracking, arrival checks, and at-home service features.",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Allow Beautonomi Provider to access photos for your catalogue, profile, and documentation.",
        cameraPermission:
          "Allow Beautonomi Provider to use the camera for your catalogue, profile, and documentation.",
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission:
          "Beautonomi Provider uses the camera to scan the customer's arrival QR code for at-home visits.",
        recordAudioAndroid: false,
      },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: "#ffffff",
        image: "./assets/splash-icon.png",
        imageWidth: 200,
      },
    ],
    [
      "@sentry/react-native/expo",
      {
        url: "https://sentry.io/",
        project: "mobile-provider",
        organization: "beautonomi",
      },
    ],
  ],
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.beautonomi.partner",
    appleTeamId: "QW33CYPQX5",
    buildNumber: "206",
    infoPlist: {
      UIBackgroundModes: ["remote-notification"],
      ITSAppUsesNonExemptEncryption: false,
      // WrongAppScreen: Linking.canOpenURL("customer://") needs the scheme here.
      // Must match plugin `scheme` and apps/customer `scheme` + package com.beautonomi.
      LSApplicationQueriesSchemes: ["customer"],
    },
    entitlements: {
      "aps-environment": isProduction ? "production" : "development",
      "com.apple.security.application-groups": [
        "group.com.beautonomi.partner.onesignal",
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
    package: "com.beautonomi.partner",
    permissions: [
      "android.permission.POST_NOTIFICATIONS",
      "com.google.android.gms.permission.AD_ID",
    ],
    versionCode: 206,
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: "resize",
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "beautonomi.com", pathPrefix: "/provider" },
          { scheme: "https", host: "www.beautonomi.com", pathPrefix: "/provider" },
          { scheme: "https", host: "beautonomi.co.za", pathPrefix: "/provider" },
          { scheme: "https", host: "www.beautonomi.co.za", pathPrefix: "/provider" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  extra: {
    eas: { projectId: "dc17e4b9-e7c6-4ab4-b52d-3d807e5d9ad7" },
    router: { origin: "https://beautonomi.com" },
  },
};

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
    EXPO_PUBLIC_IOS_APP_STORE_ID: iosStoreId,
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
