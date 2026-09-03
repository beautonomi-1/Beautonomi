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

// APP_ENV drives production-only toggles (store URLs, market hosts, etc.).
// Push (APNs + OneSignal) uses production for both production AND preview
// profiles so TestFlight/internal builds receive real push notifications.
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
    `[Beautonomi customer] Push misconfiguration: EAS_BUILD_PROFILE=${easBuildProfile} but APP_ENV=${appEnv} ` +
      `(pushUsesProduction=false). Preview and production builds must use production APNs + OneSignal mode.`,
  );
}
if (process.env.EAS_BUILD === "true" || easBuildProfile) {
  // eslint-disable-next-line no-console
  console.log("[Beautonomi customer push-env]", {
    appEnv,
    easBuildProfile: easBuildProfile ?? "(local)",
    oneSignalMode,
    apsEnvironment,
    pushUsesProduction,
  });
}

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
  version: "1.0.88",
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
    usesAppleSignIn: true,
    buildNumber: "281",
    infoPlist: {
      UIBackgroundModes: ["remote-notification"],
      NSCalendarsUsageDescription:
        "Beautonomi can add your appointment to your calendar when you choose Save to calendar.",
      // iOS 17+ requires this in addition to NSCalendarsUsageDescription.
      NSCalendarsFullAccessUsageDescription:
        "Beautonomi can add your appointment to your calendar when you choose Save to calendar.",
      NSCameraUsageDescription:
        "Beautonomi uses the camera for identity verification and profile photos.",
      NSMicrophoneUsageDescription:
        "Beautonomi uses the microphone during identity verification to record your liveness video.",
      ITSAppUsesNonExemptEncryption: false,
      // WrongAppScreen: Linking.canOpenURL("provider://") needs the scheme here
      // (iOS blocks undeclared schemes). Must match plugin `scheme` and
      // apps/provider `scheme` + android.package com.beautonomi.partner.
      LSApplicationQueriesSchemes: ["provider"],
      // Singular SKAdNetwork + commonly published partner IDs (Part G).
      SKAdNetworkItems: [
        { SKAdNetworkIdentifier: "22mmun2rn5.skadnetwork" },
        { SKAdNetworkIdentifier: "cstr6suwn9.skadnetwork" },
        { SKAdNetworkIdentifier: "v9wttpbfk9.skadnetwork" },
        { SKAdNetworkIdentifier: "n38lu8286q.skadnetwork" },
        { SKAdNetworkIdentifier: "4dzt52r2t5.skadnetwork" },
        { SKAdNetworkIdentifier: "ludvb6z3bs.skadnetwork" },
        { SKAdNetworkIdentifier: "hs6bdukanm.skadnetwork" },
        { SKAdNetworkIdentifier: "kbd757ywx3.skadnetwork" },
        { SKAdNetworkIdentifier: "9t245vhmpl.skadnetwork" },
        { SKAdNetworkIdentifier: "prcb7njmu6.skadnetwork" },
        { SKAdNetworkIdentifier: "yclnxrl5pm.skadnetwork" },
        { SKAdNetworkIdentifier: "4468km3ulx.skadnetwork" },
        { SKAdNetworkIdentifier: "2u9pt9hc89.skadnetwork" },
        { SKAdNetworkIdentifier: "8s468mfl3y.skadnetwork" },
        { SKAdNetworkIdentifier: "ppxm28t8ap.skadnetwork" },
        { SKAdNetworkIdentifier: "4pfyvq9l8r.skadnetwork" },
        { SKAdNetworkIdentifier: "v72qych5uu.skadnetwork" },
      ],
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
        "group.com.beautonomi.onesignal",
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
    package: "com.beautonomi",
    permissions: [
      "android.permission.POST_NOTIFICATIONS",
      "com.google.android.gms.permission.AD_ID",
      "android.permission.CAMERA",
      "android.permission.RECORD_AUDIO",
    ],
    versionCode: 281,
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: "resize",
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "beautonomi.com", pathPrefix: "/bookings" },
          { scheme: "https", host: "beautonomi.com", pathPrefix: "/account-settings" },
          { scheme: "https", host: "beautonomi.com", pathPrefix: "/explore" },
          { scheme: "https", host: "www.beautonomi.com", pathPrefix: "/bookings" },
          { scheme: "https", host: "www.beautonomi.com", pathPrefix: "/account-settings" },
          { scheme: "https", host: "www.beautonomi.com", pathPrefix: "/explore" },
          { scheme: "https", host: "beautonomi.co.za", pathPrefix: "/bookings" },
          { scheme: "https", host: "beautonomi.co.za", pathPrefix: "/account-settings" },
          { scheme: "https", host: "beautonomi.co.za", pathPrefix: "/explore" },
          { scheme: "https", host: "www.beautonomi.co.za", pathPrefix: "/bookings" },
          { scheme: "https", host: "www.beautonomi.co.za", pathPrefix: "/account-settings" },
          { scheme: "https", host: "www.beautonomi.co.za", pathPrefix: "/explore" },
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
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          buildToolsVersion: "36.0.0",
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
          "Beautonomi uses Face ID or Touch ID to open the app securely. Biometric data stays on your device and is not sent to our servers.",
      },
    ],
    [
      "onesignal-expo-plugin",
      { mode: oneSignalMode },
    ],
    "expo-notifications",
    "expo-router",
    "expo-apple-authentication",
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
          "Beautonomi uses your photo library for your profile, reviews, and sharing images.",
        cameraPermission:
          "Beautonomi uses the camera for your profile, reviews, and sharing photos.",
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission:
          "Beautonomi uses the camera for identity verification and profile photos.",
        microphonePermission:
          "Beautonomi uses the microphone during identity verification to record your liveness video.",
        recordAudioAndroid: true,
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
    "6748387058";
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
