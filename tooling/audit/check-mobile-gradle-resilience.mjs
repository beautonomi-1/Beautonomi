#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");

const REQUIRED_PLUGIN = "../../tooling/expo-plugins/withGradleWrapperResilience";
const REQUIRED_EAS_POST_INSTALL = "node ../../tooling/eas-prefetch-gradle.mjs";

const apps = ["customer", "provider"];
const failures = [];

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

for (const app of apps) {
  const appConfig = read(`apps/${app}/app.config.js`);
  if (!appConfig.includes(REQUIRED_PLUGIN)) {
    failures.push(`apps/${app}/app.config.js must include ${REQUIRED_PLUGIN}`);
  }

  const packageJson = JSON.parse(read(`apps/${app}/package.json`));
  const postInstall = packageJson.scripts?.["eas-build-post-install"];
  if (postInstall !== REQUIRED_EAS_POST_INSTALL) {
    failures.push(
      `apps/${app}/package.json must set eas-build-post-install to "${REQUIRED_EAS_POST_INSTALL}"`,
    );
  }
}

const gradlePlugin = read("tooling/expo-plugins/withGradleWrapperResilience.js");
const gradleExpectations = [
  ["remove JitPack from settings.gradle", "withSettingsGradle"],
  ["remove JitPack repositories", "removeJitpackRepository"],
  ["pin Amplitude analytics-core", 'details.requested.name == "analytics-core"'],
  ["pin Amplitude analytics-android", 'details.requested.name == "analytics-android"'],
];

for (const [label, needle] of gradleExpectations) {
  if (!gradlePlugin.includes(needle)) {
    failures.push(`withGradleWrapperResilience.js must ${label}`);
  }
}

const amplitudePatch = read("tooling/patch-amplitude-android-gradle.mjs");
if (!amplitudePatch.includes("ENGAGEMENT_ANALYTICS_ANDROID_VERSION")) {
  failures.push("patch-amplitude-android-gradle.mjs must define ENGAGEMENT_ANALYTICS_ANDROID_VERSION");
}

const easPrefetch = read("tooling/eas-prefetch-gradle.mjs");
if (!easPrefetch.includes("patchAllAmplitudeGradlePlugins")) {
  failures.push("eas-prefetch-gradle.mjs must patch Amplitude Gradle plugins before Android builds");
}

const analyticsPackage = JSON.parse(read("packages/analytics/package.json"));
if (analyticsPackage.dependencies?.["@amplitude/plugin-session-replay-react-native"]) {
  failures.push("@beautonomi/analytics must not depend on @amplitude/plugin-session-replay-react-native");
}

if (failures.length > 0) {
  console.error("Mobile Gradle resilience audit failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Mobile Gradle resilience audit passed.");
