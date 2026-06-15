#!/usr/bin/env node
/**
 * Pin dynamic com.amplitude:* Android deps in Amplitude RN plugins.
 * Upstream build.gradle files use version ranges (e.g. 1.+, [0.24.0,0.25.0)),
 * which makes Gradle list versions from every repository (including JitPack)
 * and can fail EAS builds with timeouts.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

/** Keep in sync with Maven Central com.amplitude:analytics-android latest 1.x */
const ENGAGEMENT_ANALYTICS_ANDROID_VERSION = "1.29.0";

/** Within @amplitude/plugin-session-replay-react-native range [0.24.0,0.25.0) */
const SESSION_REPLAY_ANDROID_VERSION = "0.24.2";

/** Within @amplitude/plugin-session-replay-react-native range [1.25.0,1.26.0) */
const SESSION_REPLAY_ANALYTICS_ANDROID_VERSION = "1.25.2";

const ENGAGEMENT_DYNAMIC_DEP =
  /implementation\s+"com\.amplitude:analytics-android:1\.\+"/;

const SESSION_REPLAY_DYNAMIC_DEP =
  /implementation\s*\(\s*"com\.amplitude:session-replay-android:\[0\.24\.0,0\.25\.0\)"\s*\)/;

const SESSION_REPLAY_ANALYTICS_DYNAMIC_DEP =
  /implementation\s*\(\s*"com\.amplitude:analytics-android:\[1\.25\.0,1\.26\.0\)"\s*\)/;

function resolveMonorepoRoot(cwd) {
  const candidates = [cwd, join(cwd, "..", "..")];
  for (const root of candidates) {
    if (existsSync(join(root, "packages", "analytics", "package.json"))) {
      return root;
    }
  }
  return join(cwd, "..", "..");
}

function monorepoRootFromAppCwd(cwd) {
  return resolveMonorepoRoot(cwd);
}

function resolvePluginBuildGradle(monorepoRoot, packageName) {
  const analyticsPkg = join(monorepoRoot, "packages", "analytics");
  if (!existsSync(join(analyticsPkg, "package.json"))) {
    return null;
  }
  try {
    const pkgJson = execSync(
      `node --print "require.resolve('${packageName}/package.json')"`,
      { cwd: analyticsPkg, encoding: "utf8" },
    ).trim();
    return join(dirname(pkgJson), "android", "build.gradle");
  } catch {
    return null;
  }
}

function resolveEngagementBuildGradle(monorepoRoot) {
  return resolvePluginBuildGradle(
    monorepoRoot,
    "@amplitude/plugin-engagement-react-native",
  );
}

function resolveSessionReplayBuildGradle(monorepoRoot) {
  return resolvePluginBuildGradle(
    monorepoRoot,
    "@amplitude/plugin-session-replay-react-native",
  );
}

function patchFile(buildGradlePath, replacements, label) {
  if (!buildGradlePath || !existsSync(buildGradlePath)) {
    return false;
  }
  let body = readFileSync(buildGradlePath, "utf8");
  let changed = false;
  for (const { pattern, replacement } of replacements) {
    if (!pattern.test(body)) {
      continue;
    }
    body = body.replace(pattern, replacement);
    changed = true;
  }
  if (!changed) {
    return false;
  }
  writeFileSync(buildGradlePath, body);
  console.log(`[patch-amplitude-android] pinned ${label} in ${buildGradlePath}`);
  return true;
}

export function patchAmplitudeEngagementGradle(buildGradlePath) {
  return patchFile(
    buildGradlePath,
    [
      {
        pattern: ENGAGEMENT_DYNAMIC_DEP,
        replacement: `implementation "com.amplitude:analytics-android:${ENGAGEMENT_ANALYTICS_ANDROID_VERSION}"`,
      },
    ],
    `analytics-android to ${ENGAGEMENT_ANALYTICS_ANDROID_VERSION}`,
  );
}

export function patchAmplitudeSessionReplayGradle(buildGradlePath) {
  return patchFile(
    buildGradlePath,
    [
      {
        pattern: SESSION_REPLAY_DYNAMIC_DEP,
        replacement: `implementation("com.amplitude:session-replay-android:${SESSION_REPLAY_ANDROID_VERSION}")`,
      },
      {
        pattern: SESSION_REPLAY_ANALYTICS_DYNAMIC_DEP,
        replacement: `implementation("com.amplitude:analytics-android:${SESSION_REPLAY_ANALYTICS_ANDROID_VERSION}")`,
      },
    ],
    `session-replay-android to ${SESSION_REPLAY_ANDROID_VERSION} and analytics-android to ${SESSION_REPLAY_ANALYTICS_ANDROID_VERSION}`,
  );
}

export function patchAllAmplitudeGradlePlugins(monorepoRoot) {
  let patched = false;
  patched =
    patchAmplitudeEngagementGradle(
      resolveEngagementBuildGradle(monorepoRoot),
    ) || patched;
  patched =
    patchAmplitudeSessionReplayGradle(
      resolveSessionReplayBuildGradle(monorepoRoot),
    ) || patched;
  return patched;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const monorepoRoot = monorepoRootFromAppCwd(process.cwd());
  if (!patchAllAmplitudeGradlePlugins(monorepoRoot)) {
    console.warn(
      "[patch-amplitude-android] no Amplitude Gradle pins applied — plugins not found or already pinned",
    );
  }
}
