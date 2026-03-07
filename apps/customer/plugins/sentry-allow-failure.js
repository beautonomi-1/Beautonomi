const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const SENTRY_PHASE_NAME = "Upload Debug Symbols to Sentry";
const SOURCE_ENV_LINE =
  'source "${SRCROOT}/.xcode.env" 2>/dev/null || true';
// Set in script body so child scripts (e.g. sentry-xcode-debug-files.sh) see it; EAS/pnpm run from ios/ and require.resolve fails.
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

/** Find the start index of the Sentry phase script content (after shellScript = ") in pbx. Returns { scriptIdx } or null. */
function findSentryScriptIndex(pbx) {
  // 1) Try by phase name (Expo/Sentry add "Upload Debug Symbols to Sentry")
  const phaseMarker = `name = "${SENTRY_PHASE_NAME}"`;
  let idx = pbx.indexOf(phaseMarker);
  if (idx !== -1) {
    const afterPhase = pbx.slice(idx);
    const scriptMatch = afterPhase.match(/shellScript\s*=\s*"/);
    if (scriptMatch) {
      return idx + scriptMatch.index + scriptMatch[0].length;
    }
  }
  // 2) Fallback: find any shellScript that runs the Sentry debug-files script
  const sentryScriptMarker = "sentry-xcode-debug-files";
  idx = pbx.indexOf(sentryScriptMarker);
  if (idx !== -1) {
    const before = pbx.slice(0, idx);
    const scriptOpen = before.lastIndexOf('shellScript = "');
    if (scriptOpen !== -1) {
      const contentStart = scriptOpen + 'shellScript = "'.length;
      return contentStart;
    }
  }
  return null;
}

/**
 * Apply .xcode.env and pbxproj changes. Used by the config plugin and by local test.
 * @param {string} iosRoot - Path to ios folder
 * @param {string} [projectName] - Xcode project name (e.g. "customer"); if omitted, discovered from iosRoot
 */
function applySentryAllowFailure(iosRoot, projectName) {
  const envPath = path.join(iosRoot, ".xcode.env");
  const lines = [
    "export SENTRY_ALLOW_FAILURE=true",
    // So the "Upload Debug Symbols to Sentry" phase can find @sentry/cli when run from ios/ (EAS/pnpm).
    'export SENTRY_CLI_PACKAGE_PATH="${SRCROOT}/../node_modules/@sentry/cli"',
    // Node require.resolve('@sentry/cli/package.json') runs from ios/; pnpm layout needs NODE_PATH to resolve it.
    'export NODE_PATH="${SRCROOT}/../node_modules"',
  ];
  let content = "";
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, "utf8");
  }
  let changed = false;
  const keyForLine = (line) => {
    if (line.includes("SENTRY_ALLOW_FAILURE")) return "SENTRY_ALLOW_FAILURE";
    if (line.includes("SENTRY_CLI_PACKAGE_PATH")) return "SENTRY_CLI_PACKAGE_PATH";
    if (line.includes("NODE_PATH")) return "NODE_PATH";
    return null;
  };
  for (const line of lines) {
    const key = keyForLine(line);
    if (!key || content.includes(key)) continue;
    const suffix = content.trimEnd() ? "\n" + line + "\n" : line + "\n";
    content = content.trimEnd() + suffix;
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(envPath, content, "utf8");
  }

  const resolvedName = projectName || findXcodeProjectName(iosRoot);
  if (!resolvedName) return;
  const pbxPath = path.join(iosRoot, resolvedName + ".xcodeproj", "project.pbxproj");
  if (!fs.existsSync(pbxPath)) {
    return;
  }
  let pbx = fs.readFileSync(pbxPath, "utf8");
  const scriptIdx = findSentryScriptIndex(pbx);
  if (scriptIdx == null) {
    return;
  }
  // Already patched?
  const restOfScript = pbx.slice(scriptIdx, scriptIdx + 500);
  if (
    restOfScript.includes(".xcode.env") &&
    restOfScript.includes("source ") &&
    restOfScript.includes("SENTRY_CLI_PACKAGE_PATH")
  ) {
    return;
  }
  const insertPoint = scriptIdx;
  const before = pbx.slice(0, insertPoint);
  const after = pbx.slice(insertPoint);
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const toInsert = esc(SOURCE_ENV_LINE) + "\\n" + esc(EXPORT_CLI_PATH_LINE) + "\\n";
  pbx = before + toInsert + after;
  fs.writeFileSync(pbxPath, pbx, "utf8");
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
      const projectName = config.slug || config.name || null;
      applySentryAllowFailure(iosRoot, projectName);
      return config;
    },
  ]);
}

module.exports = withSentryAllowFailure;
module.exports.applySentryAllowFailure = applySentryAllowFailure;
