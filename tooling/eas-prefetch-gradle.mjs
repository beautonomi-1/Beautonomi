#!/usr/bin/env node
/**
 * EAS Android: runs after `expo prebuild` (see eas-build-post-install).
 * Retries `./gradlew --version` so the Gradle distribution download can recover
 * from transient HTTP 504s when services.gradle.org / GitHub edges flake.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

if (process.env.EAS_BUILD_PLATFORM !== "android") {
  process.exit(0);
}

const androidDir = join(process.cwd(), "android");
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
