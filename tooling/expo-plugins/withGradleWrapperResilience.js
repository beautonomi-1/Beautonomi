const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { withDangerousMod, withProjectBuildGradle } = require(
  require.resolve("expo/config-plugins", {
    paths: [process.cwd()],
  }),
);

/** JitPack only — must not match other maven { url '...' } blocks (e.g. Singular). */
const JITPACK_MAVEN_WITH_CONTENT =
  /maven\s*\{\s*url\s*['"]https:\/\/(www\.)?jitpack\.io['"]\s*content\s*\{[\s\S]*?\}\s*\}\s*\n?/g;
const JITPACK_MAVEN_SINGLE_LINE =
  /maven\s*\{\s*url\s*['"]https:\/\/(www\.)?jitpack\.io['"]\s*\}\s*\n?/g;

const GRADLE_HTTP_TIMEOUT_PROPS = [
  "systemProp.org.gradle.internal.http.connectionTimeout=180000",
  "systemProp.org.gradle.internal.http.socketTimeout=180000",
];

function removeJitpackRepository(contents) {
  if (!/jitpack\.io/.test(contents)) {
    return contents;
  }
  return contents
    .replace(JITPACK_MAVEN_WITH_CONTENT, "")
    .replace(JITPACK_MAVEN_SINGLE_LINE, "");
}

function upsertGradleProperty(body, line) {
  const eq = line.indexOf("=");
  const key = line.slice(0, eq);
  const pattern = new RegExp(`^${key.replace(/\./g, "\\.")}=.*$`, "m");
  if (pattern.test(body)) {
    return body.replace(pattern, line);
  }
  return `${body.trimEnd()}\n${line}\n`;
}

function patchAmplitudeAndroidGradlePlugins(appRoot) {
  const scriptPath = path.join(appRoot, "../../tooling/patch-amplitude-android-gradle.mjs");
  if (!fs.existsSync(scriptPath)) {
    return;
  }
  try {
    execSync(`node "${scriptPath}"`, {
      cwd: appRoot,
      stdio: "inherit",
    });
  } catch (error) {
    console.warn(
      "[withGradleWrapperResilience] Amplitude Gradle pin failed:",
      error.message,
    );
  }
}

/**
 * Hardens Android Gradle for EAS / CI:
 * - Drops JitPack (Beautonomi native deps use Maven Central / Google / vendor repos).
 * - Pins Amplitude RN plugin Android deps (engagement 1.+, session-replay ranges).
 * - Longer Gradle wrapper + HTTP timeouts for flaky CI networks.
 */
module.exports = function withGradleWrapperResilience(config) {
  config = withProjectBuildGradle(config, (cfg) => {
    cfg.modResults.contents = removeJitpackRepository(cfg.modResults.contents);
    return cfg;
  });

  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const androidRoot = cfg.modRequest.platformProjectRoot;
      const appRoot = cfg.modRequest.projectRoot;

      patchAmplitudeAndroidGradlePlugins(appRoot);

      const wrapperPropsPath = path.join(
        androidRoot,
        "gradle/wrapper/gradle-wrapper.properties",
      );
      if (fs.existsSync(wrapperPropsPath)) {
        let body = fs.readFileSync(wrapperPropsPath, "utf8");
        if (/^networkTimeout=/m.test(body)) {
          body = body.replace(/^networkTimeout=\d+/m, "networkTimeout=120000");
        } else {
          body = `${body.trimEnd()}\nnetworkTimeout=120000\n`;
        }
        fs.writeFileSync(wrapperPropsPath, body);
      }

      const gradlePropsPath = path.join(androidRoot, "gradle.properties");
      if (fs.existsSync(gradlePropsPath)) {
        let body = fs.readFileSync(gradlePropsPath, "utf8");
        for (const line of GRADLE_HTTP_TIMEOUT_PROPS) {
          body = upsertGradleProperty(body, line);
        }
        fs.writeFileSync(gradlePropsPath, body);
      }

      return cfg;
    },
  ]);
};
