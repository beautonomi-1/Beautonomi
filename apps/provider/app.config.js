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
const pushUsesProduction = appEnv === "production" || appEnv === "preview";
const oneSignalMode = pushUsesProduction ? "production" : "development";
const apsEnvironment = pushUsesProduction ? "production" : "development";

// Amplitude Guides & Surveys preview deep-link scheme (e.g. amp-abcdef123456).
// Value comes from Amplitude → Settings → Projects → your project → URL scheme (mobile).
// Only needed to PREVIEW unpublished guides/surveys on device; published content works without it.
const amplitudeUrlScheme =
  envFromFile.EXPO_PUBLIC_AMPLITUDE_URL_SCHEME ||
  process.env.EXPO_PUBLIC_AMPLITUDE_URL_SCHEME ||
  "";

const easBuildProfile = process.env.EAS_BUILD_PROFILE;
if (
  (easBuildProfile === "production" || easBuildProfile === "preview") &&
  !pushUsesProduction
) {
  throw new Error(
    `[Beautonomi provider] Push misconfiguration: EAS_BUILD_PROFILE=${easBuildProfile} but APP_ENV=${appEnv} ` +
      `(pushUsesProduction=false). Preview and production builds must use production APNs + OneSignal mode.`,
  );
}
if (process.env.EAS_BUILD === "true" || easBuildProfile) {
  // eslint-disable-next-line no-console
  console.log("[Beautonomi provider push-env]", {
    appEnv,
    easBuildProfile: easBuildProfile ?? "(local)",
    oneSignalMode,
    apsEnvironment,
    pushUsesProduction,
  });
}

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
  version: "1.0.83",
  orientation: "default",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  plugins: [
    [
      "./plugins/android-sibling-app-queries/app.plugin.js",
      { packageName: "com.beautonomi", scheme: "customer" },
    ],
    [
      "./plugins/android-sibling-app-queries/app.plugin.js",
      { packageName: "com.wiseasy.cashier", scheme: "wisecashier" },
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
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          buildToolsVersion: "36.0.0",
          ndkVersion: "28.0.12433566",
          useLegacyPackaging: false,
        },
      },
    ],
    "../../tooling/expo-plugins/withGradleWrapperResilience",
    // Prevents Android from destroying the React Native activity (and triggering
    // an ANR) when the device locale, font scale, or time settings change.
    "../../tooling/expo-plugins/withAndroidConfigChanges",
    [
      "expo-local-authentication",
      {
        faceIDPermission:
          "Beautonomi Provider uses Face ID or Touch ID to open the app securely. Biometric data stays on your device and is not sent to our servers.",
      },
    ],
    [
      "onesignal-expo-plugin",
      { mode: oneSignalMode },
    ],
    "expo-notifications",
    "expo-router",
    "expo-iap",
    "expo-apple-authentication",
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
          "Beautonomi Provider uses your photo library for your catalogue, profile, and documentation.",
        cameraPermission:
          "Beautonomi Provider uses the camera to take photos or videos for your catalogue, profile, messages, to scan arrival QR codes, and to scan product barcodes.",
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission:
          "Beautonomi Provider uses the camera to take photos or videos for your catalogue, profile, messages, to scan arrival QR codes, product barcodes, and for identity verification.",
        // Enable microphone access on Android for liveness video and future in-app features.
        recordAudioAndroid: true,
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
    "./plugins/sentry-allow-failure",
    // Didit native KYC SDK. NFC disabled — basic KYC (document + liveness) does
    // not require passport-chip reading, and disabling it avoids the iOS NFC
    // entitlement/provisioning-profile requirement. Requires a dev/prod build
    // (native module — not available in Expo Go); the launcher falls back to an
    // in-app browser when the module is absent.
    [
      "@didit-protocol/sdk-react-native",
      { iosNfcEnabled: false, androidNfcEnabled: false },
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
    usesAppleSignIn: true,
    buildNumber: "276",
    infoPlist: {
      UIBackgroundModes: ["remote-notification"],
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription:
        "Beautonomi Provider uses the camera for identity verification, profile photos, catalogue images, scanning QR codes, and scanning product barcodes.",
      NSMicrophoneUsageDescription:
        "Beautonomi Provider uses the microphone during identity verification to record your liveness video, and when you choose to record a video for posts, messages, or work documentation.",
      // WrongAppScreen: Linking.canOpenURL("customer://") needs the scheme here.
      // Must match plugin `scheme` and apps/customer `scheme` + package com.beautonomi.
      LSApplicationQueriesSchemes: ["customer"],
      // Amplitude Guides & Surveys preview deep links (amp-xxxx://). Dedicated URL
      // type so it never collides with expo-router; handleEngagementURL consumes it.
      ...(amplitudeUrlScheme
        ? {
            CFBundleURLTypes: [
              {
                CFBundleURLName: "AmplitudeURLScheme",
                CFBundleURLSchemes: [amplitudeUrlScheme],
              },
            ],
          }
        : {}),
    },
    entitlements: {
      "aps-environment": apsEnvironment,
      "com.apple.security.application-groups": [
        "group.com.beautonomi.partner.onesignal",
      ],
      // EAS credential sync reads this object. The expo-apple-authentication
      // plugin also writes the same key during prebuild/compile.
      "com.apple.developer.applesignin": ["Default"],
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
      "android.permission.RECORD_AUDIO",
      "com.google.android.gms.permission.AD_ID",
    ],
    versionCode: 276,
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
      // Amplitude Guides & Surveys preview deep links (amp-xxxx://).
      ...(amplitudeUrlScheme
        ? [
            {
              action: "VIEW",
              data: [{ scheme: amplitudeUrlScheme }],
              category: ["BROWSABLE", "DEFAULT"],
            },
          ]
        : []),
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
    "6748387936";
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
