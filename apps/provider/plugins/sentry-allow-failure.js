const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const SENTRY_PHASE_NAME = "Upload Debug Symbols to Sentry";
const SOURCE_ENV_LINE =
  'source "${SRCROOT}/.xcode.env" 2>/dev/null || true';
const EXPORT_CLI_PATH_LINE =
  'export SENTRY_CLI_PACKAGE_PATH="${SRCROOT}/../node_modules/@sentry/cli"';

/** Return the first .xcodeproj dir name under iosRoot that has project.pbxproj, or null. */
function findXcodeProjectName(iosRoot) {
  if (!fs.existsSync(iosRoot)) return null;
  const entries = fs.readdirSync(iosRoot, { withFileTypes: true }) || [];
  for (const e of entries) {
    if (e.isDirectory() && e.name.endsWith(".xcodeproj")) {
      const pbxPath = path.join(iosRoot, e.name, "project.pbxproj");
      if (fs.existsSync(pbxPath)) return e.name.replace(/\.xcodeproj$/, "");
    }
  }
  return null;
}

/** Find the start index of the Sentry phase script content (after shellScript = ") in pbx. Returns index or null. */
function findSentryScriptIndex(pbx) {
  const phaseMarker = `name = "${SENTRY_PHASE_NAME}"`;
  let idx = pbx.indexOf(phaseMarker);
  if (idx !== -1) {
    const afterPhase = pbx.slice(idx);
    const scriptMatch = afterPhase.match(/shellScript\s*=\s*"/);
    if (scriptMatch) {
      return idx + scriptMatch.index + scriptMatch[0].length;
    }
  }
  const sentryScriptMarker = "sentry-xcode-debug-files";
  idx = pbx.indexOf(sentryScriptMarker);
  if (idx !== -1) {
    const before = pbx.slice(0, idx);
    const scriptOpen = before.lastIndexOf('shellScript = "');
    if (scriptOpen !== -1) {
      return scriptOpen + 'shellScript = "'.length;
    }
  }
  return null;
}

/**
 * 1) Injects SENTRY_ALLOW_FAILURE=true into ios/.xcode.env.
 * 2) Prepends sourcing of .xcode.env to the "Upload Debug Symbols to Sentry" Xcode phase script
 *    so the phase actually sees it (EAS env is not passed to Run Script phases).
 * This allows the build to succeed when dSYM upload fails (e.g. no SENTRY_AUTH_TOKEN).
 */
function withSentryAllowFailure(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const iosRoot = config.modRequest.platformProjectRoot;

      // 1) Ensure .xcode.env exports SENTRY_ALLOW_FAILURE and SENTRY_CLI_PACKAGE_PATH
      const envPath = path.join(iosRoot, ".xcode.env");
      const linesToAdd = [
        "export SENTRY_ALLOW_FAILURE=true",
        'export SENTRY_CLI_PACKAGE_PATH="${SRCROOT}/../node_modules/@sentry/cli"',
        'export NODE_PATH="${SRCROOT}/../node_modules"',
      ];
      let content = "";
      if (fs.existsSync(envPath)) {
        content = fs.readFileSync(envPath, "utf8");
      }
      let changed = false;
      if (!content.includes("SENTRY_ALLOW_FAILURE")) {
        const line = linesToAdd[0];
        const suffix = content.trimEnd() ? "\n" + line + "\n" : line + "\n";
        content = content.trimEnd() + suffix;
        changed = true;
      }
      if (!content.includes("SENTRY_CLI_PACKAGE_PATH")) {
        const line = linesToAdd[1];
        const suffix = content.trimEnd() ? "\n" + line + "\n" : line + "\n";
        content = content.trimEnd() + suffix;
        changed = true;
      }
      if (!content.includes("NODE_PATH")) {
        const line = linesToAdd[2];
        const suffix = content.trimEnd() ? "\n" + line + "\n" : line + "\n";
        content = content.trimEnd() + suffix;
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(envPath, content, "utf8");
      }

      // 2) Prepend source .xcode.env to the Sentry phase script so it sees the var
      const projectName = config.slug || config.name || findXcodeProjectName(iosRoot);
      if (!projectName) return config;
      const pbxPath = path.join(iosRoot, projectName + ".xcodeproj", "project.pbxproj");
      if (!fs.existsSync(pbxPath)) {
        return config;
      }
      let pbx = fs.readFileSync(pbxPath, "utf8");
      const scriptIdx = findSentryScriptIndex(pbx);
      if (scriptIdx == null) {
        return config;
      }
      const restOfScript = pbx.slice(scriptIdx, scriptIdx + 500);
      if (
        restOfScript.includes(".xcode.env") &&
        restOfScript.includes("source ") &&
        restOfScript.includes("SENTRY_CLI_PACKAGE_PATH")
      ) {
        return config;
      }
      const insertPoint = scriptIdx;
      const before = pbx.slice(0, insertPoint);
      const after = pbx.slice(insertPoint);
      const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const toInsert =
        esc(SOURCE_ENV_LINE) + "\\n" + esc(EXPORT_CLI_PATH_LINE) + "\\n";
      pbx = before + toInsert + after;
      fs.writeFileSync(pbxPath, pbx, "utf8");
      return config;
    },
  ]);
}

module.exports = withSentryAllowFailure;
