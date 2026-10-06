#!/usr/bin/env node
/**
 * EAS Android post-install: pin Amplitude Gradle deps, then warm the Gradle wrapper.
 */
import { execSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
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
  console.warn("[eas-prefetch-gradle] android/gradlew not found — skipping (CNG prebuild may run later)");
  process.exit(0);
}

/** EAS/Linux archives often ship gradlew without the executable bit; `sh gradlew` also works. */
function runGradlewVersion() {
  if (process.platform !== "win32") {
    try {
      chmodSync(gradlew, 0o755);
    } catch {
      /* ignore */
    }
  }
  const isWin = process.platform === "win32";
  const attempts = isWin ? ["gradlew.bat"] : ["./gradlew", "sh gradlew"];
  let lastErr;
  for (const cmd of attempts) {
    try {
      execSync(`${cmd} --version`, {
        cwd: androidDir,
        stdio: "inherit",
        env: process.env,
        shell: isWin || cmd.startsWith("sh "),
      });
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

const max = Math.max(1, Math.min(8, Number(process.env.GRADLE_PREFETCH_ATTEMPTS ?? "5") || 5));

for (let attempt = 1; attempt <= max; attempt++) {
  try {
    runGradlewVersion();
    console.log(`[eas-prefetch-gradle] Gradle wrapper ok (attempt ${attempt}/${max})`);
    process.exit(0);
  } catch {
    console.warn(`[eas-prefetch-gradle] attempt ${attempt}/${max} failed`);
    if (attempt === max) {
      console.warn(
        "[eas-prefetch-gradle] giving up — prefetch is best-effort; the main EAS Gradle step may still succeed",
      );
      process.exit(0);
    }
    await delay(Math.min(45_000, 2500 * attempt * attempt));
  }
}
