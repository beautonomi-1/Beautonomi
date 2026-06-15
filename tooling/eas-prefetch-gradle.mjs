#!/usr/bin/env node
/**
 * EAS Android post-install: pin Amplitude Gradle deps, then warm the Gradle wrapper.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { patchAllAmplitudeGradlePlugins } from "./patch-amplitude-android-gradle.mjs";

if (process.env.EAS_BUILD_PLATFORM !== "android") {
  process.exit(0);
}

const appRoot = process.cwd();
const monorepoRoot = join(appRoot, "..", "..");
const analyticsPkg = join(monorepoRoot, "packages", "analytics");

if (existsSync(join(analyticsPkg, "package.json"))) {
  try {
    patchAllAmplitudeGradlePlugins(monorepoRoot);
  } catch {
    console.warn("[eas-post-install] Amplitude Gradle pin failed — skipping");
  }
}

const androidDir = join(appRoot, "android");
const gradlew = join(androidDir, "gradlew");

if (!existsSync(gradlew)) {
  console.warn("[eas-prefetch-gradle] android/gradlew not found — skipping");
  process.exit(0);
}

const max = Math.max(1, Math.min(8, Number(process.env.GRADLE_PREFETCH_ATTEMPTS ?? "5") || 5));

for (let attempt = 1; attempt <= max; attempt++) {
  try {
    execSync("./gradlew --version", {
      cwd: androidDir,
      stdio: "inherit",
      env: process.env,
    });
    console.log(`[eas-prefetch-gradle] Gradle wrapper ok (attempt ${attempt}/${max})`);
    process.exit(0);
  } catch {
    console.warn(`[eas-prefetch-gradle] attempt ${attempt}/${max} failed`);
    if (attempt === max) {
      process.exit(1);
    }
    await delay(Math.min(45_000, 2500 * attempt * attempt));
  }
}
