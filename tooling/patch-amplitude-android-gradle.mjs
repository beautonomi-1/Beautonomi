#!/usr/bin/env node
/**
 * Pin com.amplitude:analytics-android in the engagement RN plugin.
 * The upstream build.gradle uses "1.+", which makes Gradle list versions from
 * every repository (including JitPack) and can fail EAS builds with timeouts.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

/** Keep in sync with Maven Central com.amplitude:analytics-android latest 1.x */
const ANALYTICS_ANDROID_VERSION = "1.29.0";

const DYNAMIC_DEP =
  /implementation\s+"com\.amplitude:analytics-android:1\.\+"/;

function monorepoRootFromAppCwd(cwd) {
  return join(cwd, "..", "..");
}

function resolveEngagementBuildGradle(monorepoRoot) {
  const analyticsPkg = join(monorepoRoot, "packages", "analytics");
  if (!existsSync(join(analyticsPkg, "package.json"))) {
    return null;
  }
  try {
    const pkgJson = execSync(
      'node --print "require.resolve(\'@amplitude/plugin-engagement-react-native/package.json\')"',
      { cwd: analyticsPkg, encoding: "utf8" },
    ).trim();
    return join(dirname(pkgJson), "android", "build.gradle");
  } catch {
    return null;
  }
}

export function patchAmplitudeEngagementGradle(buildGradlePath) {
  if (!buildGradlePath || !existsSync(buildGradlePath)) {
    return false;
  }
  const body = readFileSync(buildGradlePath, "utf8");
  if (!DYNAMIC_DEP.test(body)) {
    return false;
  }
  const pinned = body.replace(
    DYNAMIC_DEP,
    `implementation "com.amplitude:analytics-android:${ANALYTICS_ANDROID_VERSION}"`,
  );
  writeFileSync(buildGradlePath, pinned);
  console.log(
    `[patch-amplitude-android] pinned analytics-android to ${ANALYTICS_ANDROID_VERSION} in ${buildGradlePath}`,
  );
  return true;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const monorepoRoot = monorepoRootFromAppCwd(process.cwd());
  const gradlePath = resolveEngagementBuildGradle(monorepoRoot);
  if (!gradlePath) {
    console.warn("[patch-amplitude-android] engagement plugin not found — skipping");
    process.exit(0);
  }
  patchAmplitudeEngagementGradle(gradlePath);
}
